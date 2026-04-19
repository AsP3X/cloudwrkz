//
//  TodoService.swift
//  Cloudwrkz
//
//  Fetches todos from GET /api/todos. Uses Bearer token and ServerConfig.
//

import Foundation

enum TodoServiceError: Equatable, Error {
    case noServerURL
    case noToken
    case unauthorized
    case serverError(message: String)
    case networkError(description: String)
}

enum TodoService {
    private static let timeout: TimeInterval = 20

    /// Path for GET todos: derived from login path (api/auth/login → api/auth/todos, api/login → api/todos).
    private static func todosPathSegments(loginPath: String) -> [String] {
        let path = loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let todosPath: String
        if path.isEmpty {
            todosPath = "api/v1/todos"
        } else if path.lowercased().hasSuffix("/auth/login") {
            todosPath = String(path.dropLast("/auth/login".count)) + "/todos"
        } else {
            todosPath = path.replacingOccurrences(of: "login", with: "todos", options: .caseInsensitive)
        }
        return todosPath.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
    }

    /// GET mutation-jobs status URL (same derivation as `LinkService`).
    private static func mutationJobPathSegments(loginPath: String, jobId: String) -> [String] {
        let path = loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let mjPath: String
        if path.isEmpty {
            mjPath = "api/v1/mutation-jobs/\(jobId)"
        } else if path.lowercased().hasSuffix("/auth/login") {
            mjPath = String(path.dropLast("/auth/login".count)) + "/mutation-jobs/\(jobId)"
        } else {
            mjPath = path.replacingOccurrences(of: "login", with: "mutation-jobs", options: .caseInsensitive) + "/\(jobId)"
        }
        return mjPath.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
    }

    private struct MutationQueuedPayload: Decodable {
        let queued: Bool?
        let jobId: String?
        let job_id: String?
        let retry_deadline_secs: UInt32?
        var resolvedJobId: String? { jobId ?? job_id }
    }

    /// Poll `GET .../mutation-jobs/:id` until completed or failed (matches `LinkService` / web client).
    private static func pollMutationJob(
        config: ServerConfig,
        jobId: String,
        retryDeadlineSecs: UInt32
    ) async -> Result<Data?, TodoServiceError> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        let segments = mutationJobPathSegments(loginPath: config.loginPath, jobId: jobId)
        guard !segments.isEmpty else {
            return .failure(.noServerURL)
        }
        var statusURL = base
        for s in segments {
            statusURL = statusURL.appending(path: s)
        }
        let maxWait = TimeInterval(retryDeadlineSecs + 5)
        let deadline = Date().addingTimeInterval(maxWait)

        while Date() < deadline {
            try? await Task.sleep(nanoseconds: 800_000_000)
            var request = URLRequest(url: statusURL)
            request.httpMethod = "GET"
            request.timeoutInterval = timeout
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            AppIdentity.apply(to: &request)
            let data: Data
            let http: HTTPURLResponse
            do {
                let (d, response) = try await URLSession.shared.data(for: request)
                guard let h = response as? HTTPURLResponse else {
                    return .failure(.serverError(message: "Invalid response"))
                }
                data = d
                http = h
            } catch {
                let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
                return .failure(.networkError(description: description))
            }
            if http.statusCode == 401 {
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            }
            guard http.statusCode == 200,
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let st = obj["status"] as? String
            else {
                continue
            }
            if st == "completed" {
                let code = (obj["http_status"] as? Int) ?? 200
                if code >= 400 {
                    let msg = (obj["message"] as? String) ?? "Request failed"
                    return .failure(.serverError(message: msg))
                }
                if let body = obj["body"] {
                    if let bodyData = try? JSONSerialization.data(withJSONObject: body) {
                        return .success(bodyData)
                    }
                }
                return .success(nil)
            }
            if st == "failed" {
                let msg = (obj["message"] as? String) ?? "Change could not be applied"
                return .failure(.serverError(message: msg))
            }
        }
        return .failure(.serverError(message: "The server took too long to apply your change. Please try again."))
    }

    private static var dateDecoder: JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            do {
                return try ApiTimestampParsing.decode(s)
            } catch {
                throw DecodingError.dataCorruptedError(in: c, debugDescription: "Invalid date: \(s)")
            }
        }
        return d
    }

    /// GET /api/todos with optional query params. Returns todos or error.
    static func fetchTodos(config: ServerConfig, filters: TodoFilters) async -> Result<[Todo], TodoServiceError> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        let pathSegments = todosPathSegments(loginPath: config.loginPath)
        guard !pathSegments.isEmpty else {
            return .failure(.noServerURL)
        }
        var url = base
        for segment in pathSegments {
            url = url.appending(path: segment)
        }
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        var queryItems: [URLQueryItem] = []
        queryItems.append(URLQueryItem(name: "status", value: filters.status.rawValue))
        queryItems.append(URLQueryItem(name: "priority", value: filters.priority.rawValue))
        queryItems.append(URLQueryItem(name: "sort", value: filters.sort.rawValue))
        queryItems.append(URLQueryItem(name: "archive", value: filters.archive.rawValue))
        queryItems.append(URLQueryItem(name: "includeSubtodos", value: filters.includeSubtodos ? "true" : "false"))
        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }
        guard let finalURL = components.url else {
            return .failure(.noServerURL)
        }
        var request = URLRequest(url: finalURL)
        request.httpMethod = "GET"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }
            switch http.statusCode {
            case 200:
                let decoded = try dateDecoder.decode(TodosResponse.self, from: data)
                return .success(decoded.todos)
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 400...599:
                let message = (try? JSONDecoder().decode(MessageResponse.self, from: data))?.message
                    ?? "Server error (\(http.statusCode))"
                return .failure(.serverError(message: message))
            default:
                return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }

    private static func isoDate(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }

    /// GET .../todos/:id — fetch a single todo with subtodos (for detail refresh).
    static func fetchTodo(config: ServerConfig, id: String) async -> Result<Todo, TodoServiceError> {
        guard let requestURL = todoURL(config: config, id: id) else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        var request = URLRequest(url: requestURL)
        request.httpMethod = "GET"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }
            switch http.statusCode {
            case 200:
                let decoded = try dateDecoder.decode(Todo.self, from: data)
                return .success(decoded)
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 404:
                return .failure(.serverError(message: "Todo not found"))
            case 400...599:
                let message = (try? JSONDecoder().decode(MessageResponse.self, from: data))?.message
                    ?? "Server error (\(http.statusCode))"
                return .failure(.serverError(message: message))
            default:
                return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }

    /// PATCH .../todos/:id — update a todo (e.g. set status to COMPLETED, or unarchive with archivedAt: null).
    static func updateTodo(
        config: ServerConfig,
        id: String,
        status: String,
        mutationHooks: MutationJobTitleHooks? = nil
    ) async -> Result<Void, TodoServiceError> {
        let body: [String: Any] = ["status": status]
        return await patchTodo(config: config, id: id, body: body, mutationHooks: mutationHooks)
    }

    /// Archive a todo (PATCH with archivedAt: current date).
    static func archiveTodo(
        config: ServerConfig,
        id: String,
        mutationHooks: MutationJobTitleHooks? = nil
    ) async -> Result<Void, TodoServiceError> {
        let body: [String: Any] = ["archivedAt": isoDate(Date())]
        return await patchTodo(config: config, id: id, body: body, mutationHooks: mutationHooks)
    }

    /// Unarchive a todo (PATCH with archivedAt: null).
    static func unarchiveTodo(
        config: ServerConfig,
        id: String,
        mutationHooks: MutationJobTitleHooks? = nil
    ) async -> Result<Void, TodoServiceError> {
        let body: [String: Any?] = ["archivedAt": NSNull()]
        return await patchTodo(config: config, id: id, body: body as [String: Any], mutationHooks: mutationHooks)
    }

    private static func patchTodo(
        config: ServerConfig,
        id: String,
        body: [String: Any],
        mutationHooks: MutationJobTitleHooks? = nil
    ) async -> Result<Void, TodoServiceError> {
        guard let requestURL = todoURL(config: config, id: id) else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        var request = URLRequest(url: requestURL)
        request.httpMethod = "PATCH"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else {
            return .failure(.serverError(message: "Invalid request"))
        }
        request.httpBody = jsonData

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }
            switch http.statusCode {
            case 200:
                if let completed = mutationHooks?.onCompleted {
                    await completed()
                }
                return .success(())
            case 202:
                if let onQueued = mutationHooks?.onQueued {
                    await onQueued()
                }
                guard let queuedPayload = try? JSONDecoder().decode(MutationQueuedPayload.self, from: data),
                      let jid = queuedPayload.resolvedJobId, !jid.isEmpty
                else {
                    return .failure(.serverError(message: "Todo update was queued but no job id was returned"))
                }
                let deadline = queuedPayload.retry_deadline_secs ?? 120
                switch await pollMutationJob(config: config, jobId: jid, retryDeadlineSecs: deadline) {
                case .failure(let err):
                    return .failure(err)
                case .success:
                    if let completed = mutationHooks?.onCompleted {
                        await completed()
                    }
                    return .success(())
                }
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 404:
                return .failure(.serverError(message: "Todo not found"))
            case 400...599:
                let message = (try? JSONDecoder().decode(MessageResponse.self, from: data))?.message
                    ?? "Server error (\(http.statusCode))"
                return .failure(.serverError(message: message))
            default:
                return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }

    /// DELETE .../todos/:id — delete a todo (and its subtodos).
    static func deleteTodo(
        config: ServerConfig,
        id: String,
        mutationHooks: MutationJobTitleHooks? = nil
    ) async -> Result<Void, TodoServiceError> {
        guard let requestURL = todoURL(config: config, id: id) else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        var request = URLRequest(url: requestURL)
        request.httpMethod = "DELETE"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }
            switch http.statusCode {
            case 200, 204:
                if let completed = mutationHooks?.onCompleted {
                    await completed()
                }
                return .success(())
            case 202:
                if let onQueued = mutationHooks?.onQueued {
                    await onQueued()
                }
                guard let queuedPayload = try? JSONDecoder().decode(MutationQueuedPayload.self, from: data),
                      let jid = queuedPayload.resolvedJobId, !jid.isEmpty
                else {
                    return .failure(.serverError(message: "Todo delete was queued but no job id was returned"))
                }
                let deadline = queuedPayload.retry_deadline_secs ?? 120
                switch await pollMutationJob(config: config, jobId: jid, retryDeadlineSecs: deadline) {
                case .failure(let err):
                    return .failure(err)
                case .success:
                    if let completed = mutationHooks?.onCompleted {
                        await completed()
                    }
                    return .success(())
                }
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 404:
                return .failure(.serverError(message: "Todo not found"))
            case 400...599:
                let message = (try? JSONDecoder().decode(MessageResponse.self, from: data))?.message
                    ?? "Server error (\(http.statusCode))"
                return .failure(.serverError(message: message))
            default:
                return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }

    private static func todoURL(config: ServerConfig, id: String) -> URL? {
        guard let base = config.baseURL else { return nil }
        let pathSegments = todosPathSegments(loginPath: config.loginPath)
        guard !pathSegments.isEmpty else { return nil }
        var url = base
        for segment in pathSegments {
            url = url.appending(path: segment)
        }
        url = url.appending(path: id)
        return URL(string: url.absoluteString)
    }

    /// POST to same path as GET (api/auth/todos or api/todos). Creates a todo or subtodo.
    /// - Parameters:
    ///   - config: Server config (base URL, login path for path derivation).
    ///   - title: Required title.
    ///   - description: Optional description.
    ///   - parentTodoId: If set, creates a subtodo under this parent.
    /// - Returns: Success with new todo id, or failure.
    static func createTodo(
        config: ServerConfig,
        title: String,
        description: String? = nil,
        parentTodoId: String? = nil,
        mutationHooks: MutationJobTitleHooks? = nil
    ) async -> Result<String, TodoServiceError> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        let pathSegments = todosPathSegments(loginPath: config.loginPath)
        guard !pathSegments.isEmpty else {
            return .failure(.noServerURL)
        }
        var url = base
        for segment in pathSegments {
            url = url.appending(path: segment)
        }
        guard let requestURL = URL(string: url.absoluteString) else {
            return .failure(.noServerURL)
        }
        var request = URLRequest(url: requestURL)
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        var body: [String: Any] = ["title": title.trimmingCharacters(in: .whitespacesAndNewlines)]
        if let d = description?.trimmingCharacters(in: .whitespacesAndNewlines), !d.isEmpty {
            body["description"] = d
        }
        if let parentId = parentTodoId, !parentId.isEmpty {
            body["parentTodoId"] = parentId
        }
        guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else {
            return .failure(.serverError(message: "Invalid request"))
        }
        request.httpBody = jsonData

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }
            switch http.statusCode {
            case 201:
                struct CreateResponse: Decodable { let id: String }
                let decoded = try JSONDecoder().decode(CreateResponse.self, from: data)
                if let completed = mutationHooks?.onCompleted {
                    await completed()
                }
                return .success(decoded.id)
            case 202:
                if let onQueued = mutationHooks?.onQueued {
                    await onQueued()
                }
                guard let queuedPayload = try? JSONDecoder().decode(MutationQueuedPayload.self, from: data),
                      let jid = queuedPayload.resolvedJobId, !jid.isEmpty
                else {
                    return .failure(.serverError(message: "Todo creation was queued but no job id was returned"))
                }
                let deadline = queuedPayload.retry_deadline_secs ?? 120
                switch await pollMutationJob(config: config, jobId: jid, retryDeadlineSecs: deadline) {
                case .failure(let err):
                    return .failure(err)
                case .success(let bodyData):
                    struct CreateResponse: Decodable { let id: String }
                    guard let bodyData,
                          let decoded = try? JSONDecoder().decode(CreateResponse.self, from: bodyData)
                    else {
                        return .failure(.serverError(message: "Todo created but response was incomplete"))
                    }
                    if let completed = mutationHooks?.onCompleted {
                        await completed()
                    }
                    return .success(decoded.id)
                }
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 403:
                let msg = (try? JSONDecoder().decode(MessageResponse.self, from: data))?.message ?? "You can't create todos."
                return .failure(.serverError(message: msg))
            case 400...599:
                let message = (try? JSONDecoder().decode(MessageResponse.self, from: data))?.message
                    ?? "Server error (\(http.statusCode))"
                return .failure(.serverError(message: message))
            default:
                return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }
}

private struct MessageResponse: Decodable {
    let message: String?
}
