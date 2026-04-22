//
//  TicketService.swift
//  Cloudwrkz
//
//  Fetches tickets from GET /api/tickets. Uses Bearer token and ServerConfig.
//

import Foundation

// Human: Ticket threads are the heaviest objects in the app—this client keeps paging, filters, and detail fetch in one place.
// Agent: TicketService Bearer tickets path derivation; list detail comments attachments; dateDecoder ApiTimestampParsing; 401 notify.

enum TicketServiceError: Equatable, Error {
    case noServerURL
    case noToken
    case unauthorized
    case serverError(message: String)
    case networkError(description: String)
}

enum TicketService {
    // Human: Ticket lists can be large JSON arrays; slightly generous timeout reduces false “offline” during peak hours.
    // Agent: timeout 20s; ticketsPathSegments; mutation job polling where API returns 202.

    private static let timeout: TimeInterval = 20

    /// Path for GET tickets: derived from login path (api/auth/login → api/auth/tickets, api/login → api/tickets).
    private static func ticketsPathSegments(loginPath: String) -> [String] {
        let path = loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let ticketsPath: String
        if path.isEmpty {
            ticketsPath = "api/v1/tickets"
        } else if path.lowercased().hasSuffix("/auth/login") {
            ticketsPath = String(path.dropLast("/auth/login".count)) + "/tickets"
        } else {
            ticketsPath = path.replacingOccurrences(of: "login", with: "tickets", options: .caseInsensitive)
        }
        return ticketsPath.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
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

    /// GET /api/tickets with optional query params. Returns tickets or error.
    static func fetchTickets(config: ServerConfig, filters: TicketFilters) async -> Result<[Ticket], TicketServiceError> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        let pathSegments = ticketsPathSegments(loginPath: config.loginPath)
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
        queryItems.append(URLQueryItem(name: "sort", value: filters.sort.rawValue))
        queryItems.append(URLQueryItem(name: "archive", value: filters.archive.rawValue))
        if let d = filters.createdFrom {
            queryItems.append(URLQueryItem(name: "createdFrom", value: isoDate(d)))
        }
        if let d = filters.createdTo {
            queryItems.append(URLQueryItem(name: "createdTo", value: isoDate(d)))
        }
        if let d = filters.updatedFrom {
            queryItems.append(URLQueryItem(name: "updatedFrom", value: isoDate(d)))
        }
        if let d = filters.updatedTo {
            queryItems.append(URLQueryItem(name: "updatedTo", value: isoDate(d)))
        }
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
                let decoded = try dateDecoder.decode(TicketsResponse.self, from: data)
                return .success(decoded.tickets)
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

    /// Build URL for a single ticket (PATCH/DELETE).
    private static func ticketURL(config: ServerConfig, id: String) -> URL? {
        guard let base = config.baseURL else { return nil }
        let segments = ticketsPathSegments(loginPath: config.loginPath)
        guard !segments.isEmpty else { return nil }
        var url = base
        for segment in segments { url = url.appending(path: segment) }
        url = url.appending(path: id)
        return url
    }

    /// GET mutation-jobs status URL (same derivation as `TodoService` / `LinkService`).
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

    /// Poll `GET .../mutation-jobs/:id` until completed or failed (Rust API queues PATCH/DELETE as 202).
    private static let mutationJobPollIntervalNs: UInt64 = 350_000_000

    private static func pollMutationJob(
        config: ServerConfig,
        jobId: String,
        retryDeadlineSecs: UInt32
    ) async -> Result<Void, TicketServiceError> {
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

        var pollIndex = 0
        while Date() < deadline {
            if pollIndex > 0 {
                try? await Task.sleep(nanoseconds: mutationJobPollIntervalNs)
            }
            pollIndex += 1
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
                return .success(())
            }
            if st == "failed" {
                let msg = (obj["message"] as? String) ?? "Change could not be applied"
                return .failure(.serverError(message: msg))
            }
        }
        return .failure(.serverError(message: "The server took too long to apply your change. Please try again."))
    }

    /// Runs PATCH/DELETE; API may respond with 202 + background job id (`GET /api/v1/mutation-jobs/{id}`).
    private static func runTicketMutation(
        request: URLRequest,
        config: ServerConfig,
        mutationHooks: MutationJobTitleHooks? = nil
    ) async -> Result<Void, TicketServiceError> {
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
                    return .failure(.serverError(message: "Change was queued but no job id was returned"))
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
            case 403, 404:
                let message = (try? JSONDecoder().decode(MessageResponse.self, from: data))?.message ?? "Server error (\(http.statusCode))"
                return .failure(.serverError(message: message))
            case 400...599:
                let message = (try? JSONDecoder().decode(MessageResponse.self, from: data))?.message ?? "Server error (\(http.statusCode))"
                return .failure(.serverError(message: message))
            default:
                return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            return .failure(.networkError(description: (error as? URLError)?.localizedDescription ?? error.localizedDescription))
        }
    }

    /// GET .../tickets/:id — fetch a single ticket (e.g. opening a global search result).
    static func fetchTicket(config: ServerConfig, id: String) async -> Result<Ticket, TicketServiceError> {
        guard let requestURL = ticketURL(config: config, id: id) else {
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
                struct SingleTicketResponse: Decodable {
                    let ticket: Ticket
                }
                let decoded = try dateDecoder.decode(SingleTicketResponse.self, from: data)
                return .success(decoded.ticket)
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 404:
                return .failure(.serverError(message: "Ticket not found"))
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

    /// PATCH .../tickets/:id — archive (archivedAt: current date).
    static func archiveTicket(
        config: ServerConfig,
        id: String,
        mutationHooks: MutationJobTitleHooks? = nil
    ) async -> Result<Void, TicketServiceError> {
        guard let requestURL = ticketURL(config: config, id: id) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }
        var request = URLRequest(url: requestURL)
        request.httpMethod = "PATCH"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        let body: [String: Any] = ["archivedAt": isoDate(Date())]
        request.httpBody = (try? JSONSerialization.data(withJSONObject: body))
        return await runTicketMutation(request: request, config: config, mutationHooks: mutationHooks)
    }

    /// PATCH .../tickets/:id — unarchive (archivedAt: null).
    static func unarchiveTicket(
        config: ServerConfig,
        id: String,
        mutationHooks: MutationJobTitleHooks? = nil
    ) async -> Result<Void, TicketServiceError> {
        guard let requestURL = ticketURL(config: config, id: id) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }
        var request = URLRequest(url: requestURL)
        request.httpMethod = "PATCH"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        let body: [String: Any?] = ["archivedAt": NSNull()]
        request.httpBody = (try? JSONSerialization.data(withJSONObject: body))
        return await runTicketMutation(request: request, config: config, mutationHooks: mutationHooks)
    }

    /// DELETE .../tickets/:id — delete a ticket permanently.
    static func deleteTicket(
        config: ServerConfig,
        id: String,
        mutationHooks: MutationJobTitleHooks? = nil
    ) async -> Result<Void, TicketServiceError> {
        guard let requestURL = ticketURL(config: config, id: id) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }
        var request = URLRequest(url: requestURL)
        request.httpMethod = "DELETE"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        return await runTicketMutation(request: request, config: config, mutationHooks: mutationHooks)
    }
}

private struct MessageResponse: Decodable {
    let message: String?
}
