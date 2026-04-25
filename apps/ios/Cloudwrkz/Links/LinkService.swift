//
//  LinkService.swift
//  Cloudwrkz
//
//  Fetches links from GET /api/links. Uses Bearer token and ServerConfig.
//

import Foundation

// Human: Links CRUD and list fetches share one module so collection filters and mutation-job polling stay consistent with web.
// Agent: LinkService URLSession Bearer; paths from loginPath→links; JSONDecoder ApiTimestampParsing; HTTP 401 SessionExpiredNotifier; optional MutationJobTitleHooks.

enum LinkServiceError: Equatable, Error {
    case noServerURL
    case noToken
    case unauthorized
    case serverError(message: String)
    case networkError(description: String)
}

enum LinkService {
    // Human: 20s covers heavier list payloads on slow networks without blocking the UI spinner unreasonably long.
    // Agent: timeout 20s; dateDecoder snake_case custom dates; fetch create update delete archive flows.

    private static let timeout: TimeInterval = 20

    /// Path for GET links: derived from login path (api/auth/login → api/auth/links, api/login → api/links).
    private static func linksPathSegments(loginPath: String) -> [String] {
        let path = loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let linksPath: String
        if path.isEmpty {
            linksPath = "api/v1/links"
        } else if path.lowercased().hasSuffix("/auth/login") {
            linksPath = String(path.dropLast("/auth/login".count)) + "/links"
        } else {
            linksPath = path.replacingOccurrences(of: "login", with: "links", options: .caseInsensitive)
        }
        return linksPath.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
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

    /// GET /api/links with optional query params. Returns links response or error.
    static func fetchLinks(config: ServerConfig, filters: LinkFilters, page: Int = 1, limit: Int = 50) async -> Result<LinksResponse, LinkServiceError> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        let pathSegments = linksPathSegments(loginPath: config.loginPath)
        guard !pathSegments.isEmpty else {
            return .failure(.noServerURL)
        }
        var url = base
        for segment in pathSegments {
            url = url.appending(path: segment)
        }
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        var queryItems: [URLQueryItem] = []
        queryItems.append(URLQueryItem(name: "sort", value: filters.sort.rawValue))
        queryItems.append(URLQueryItem(name: "page", value: String(page)))
        queryItems.append(URLQueryItem(name: "limit", value: String(limit)))
        queryItems.append(URLQueryItem(name: "archived", value: filters.archived ? "true" : "false"))
        if filters.isFavorite != .all {
            queryItems.append(URLQueryItem(name: "isFavorite", value: filters.isFavorite.rawValue))
        }
        if let cid = filters.collectionId, !cid.isEmpty {
            queryItems.append(URLQueryItem(name: "collectionId", value: cid))
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
                let decoded = try dateDecoder.decode(LinksResponse.self, from: data)
                return .success(decoded)
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

    /// Build URL for a single link resource (GET/PUT/DELETE).
    private static func linkURL(config: ServerConfig, id: String) -> URL? {
        guard let base = config.baseURL else { return nil }
        let pathSegments = linksPathSegments(loginPath: config.loginPath)
        guard !pathSegments.isEmpty else { return nil }
        var url = base
        for segment in pathSegments {
            url = url.appending(path: segment)
        }
        return url.appending(path: id)
    }

    /// GET mutation-jobs status URL (same derivation as web `api` client).
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

    /// Poll `GET .../mutation-jobs/:id` until completed or failed (matches Vite `client.ts`).
    private static let mutationJobPollIntervalNs: UInt64 = 350_000_000

    private static func pollMutationJob(
        config: ServerConfig,
        jobId: String,
        retryDeadlineSecs: UInt32
    ) async -> Result<Data?, LinkServiceError> {
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

    /// GET .../links/:id — fetch a single link (e.g. opening a global search result).
    static func fetchLink(config: ServerConfig, id: String) async -> Result<Link, LinkServiceError> {
        guard let requestURL = linkURL(config: config, id: id) else {
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
                struct SingleLinkResponse: Decodable {
                    let link: Link
                }
                let decoded = try dateDecoder.decode(SingleLinkResponse.self, from: data)
                return .success(decoded.link)
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 404:
                return .failure(.serverError(message: "Link not found"))
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

    /// POST /api/links — create a link. Returns the new link id on success.
    /// Pass favicon when available (e.g. from fetchMetadata) so the server can cache and store it like the website.
    static func createLink(
        config: ServerConfig,
        url: String,
        title: String? = nil,
        description: String? = nil,
        favicon: String? = nil,
        collectionIds: [String]? = nil
    ) async -> Result<String, LinkServiceError> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        let pathSegments = linksPathSegments(loginPath: config.loginPath)
        guard !pathSegments.isEmpty else {
            return .failure(.noServerURL)
        }
        var requestURL = base
        for segment in pathSegments {
            requestURL = requestURL.appending(path: segment)
        }
        var request = URLRequest(url: requestURL)
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        let body: [String: Any] = {
            var b: [String: Any] = ["url": url.trimmingCharacters(in: .whitespacesAndNewlines)]
            if let t = title?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty {
                b["title"] = t
            }
            if let d = description?.trimmingCharacters(in: .whitespacesAndNewlines), !d.isEmpty {
                b["description"] = d
            }
            if let f = favicon?.trimmingCharacters(in: .whitespacesAndNewlines), !f.isEmpty {
                b["favicon"] = f
            }
            if let ids = collectionIds, !ids.isEmpty {
                b["collectionIds"] = ids
            }
            return b
        }()
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
                return .success(decoded.id)
            case 202:
                guard let queued = try? JSONDecoder().decode(MutationQueuedPayload.self, from: data),
                      let jid = queued.resolvedJobId, !jid.isEmpty
                else {
                    return .failure(.serverError(message: "Link creation was queued but no job id was returned"))
                }
                let deadline = queued.retry_deadline_secs ?? 120
                switch await pollMutationJob(config: config, jobId: jid, retryDeadlineSecs: deadline) {
                case .failure(let err):
                    return .failure(err)
                case .success(let bodyData):
                    struct CreateResponse: Decodable { let id: String }
                    guard let bodyData,
                          let decoded = try? JSONDecoder().decode(CreateResponse.self, from: bodyData)
                    else {
                        return .failure(.serverError(message: "Link created but response was incomplete"))
                    }
                    return .success(decoded.id)
                }
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 403:
                let msg = (try? JSONDecoder().decode(MessageResponse.self, from: data))?.message ?? "You can't create links."
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

    /// PUT .../[id] — update an existing link. Returns the link id on success.
    static func updateLink(
        config: ServerConfig,
        id: String,
        url: String? = nil,
        title: String? = nil,
        description: String? = nil,
        favicon: String? = nil,
        linkType: String? = nil,
        tags: [String]? = nil,
        notes: String? = nil,
        isFavorite: Bool? = nil,
        rating: Int?? = nil,
        collectionIds: [String]? = nil,
        extractMetadata: Bool? = nil
    ) async -> Result<String, LinkServiceError> {
        guard let requestURL = linkURL(config: config, id: id) else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }

        var request = URLRequest(url: requestURL)
        request.httpMethod = "PUT"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)

        var body: [String: Any] = [:]
        if let url = url?.trimmingCharacters(in: .whitespacesAndNewlines), !url.isEmpty {
            body["url"] = url
        }
        if let title = title {
            body["title"] = title.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let description = description {
            body["description"] = description.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let favicon = favicon {
            body["favicon"] = favicon.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let linkType = linkType {
            body["linkType"] = linkType
        }
        if let tags = tags {
            body["tags"] = tags
        }
        if let notes = notes {
            body["notes"] = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let isFavorite = isFavorite {
            body["isFavorite"] = isFavorite
        }
        if let rating = rating {
            if let value = rating {
                body["rating"] = value
            } else {
                body["rating"] = NSNull()
            }
        }
        if let collectionIds = collectionIds {
            body["collectionIds"] = collectionIds
        }
        if let extractMetadata = extractMetadata {
            body["extractMetadata"] = extractMetadata
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
            case 200:
                return .success(id)
            case 202:
                guard let queued = try? JSONDecoder().decode(MutationQueuedPayload.self, from: data),
                      let jid = queued.resolvedJobId, !jid.isEmpty
                else {
                    return .failure(.serverError(message: "Link update was queued but no job id was returned"))
                }
                let deadline = queued.retry_deadline_secs ?? 120
                switch await pollMutationJob(config: config, jobId: jid, retryDeadlineSecs: deadline) {
                case .failure(let err):
                    return .failure(err)
                case .success:
                    return .success(id)
                }
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 403:
                let msg = (try? JSONDecoder().decode(MessageResponse.self, from: data))?.message ?? "You can't update this link."
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

    /// Unarchive a link (PUT with archivedAt: null).
    static func unarchiveLink(config: ServerConfig, id: String) async -> Result<Void, LinkServiceError> {
        guard let requestURL = linkURL(config: config, id: id) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }
        var request = URLRequest(url: requestURL)
        request.httpMethod = "PUT"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        let body: [String: Any?] = ["archivedAt": NSNull()]
        request.httpBody = (try? JSONSerialization.data(withJSONObject: body))
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return .failure(.serverError(message: "Invalid response")) }
            switch http.statusCode {
            case 200:
                return .success(())
            case 202:
                guard let queued = try? JSONDecoder().decode(MutationQueuedPayload.self, from: data),
                      let jid = queued.resolvedJobId, !jid.isEmpty
                else {
                    return .failure(.serverError(message: "Unarchive was queued but no job id was returned"))
                }
                let deadline = queued.retry_deadline_secs ?? 120
                switch await pollMutationJob(config: config, jobId: jid, retryDeadlineSecs: deadline) {
                case .failure(let err):
                    return .failure(err)
                case .success:
                    return .success(())
                }
            case 401: SessionExpiredNotifier.notify(); return .failure(.unauthorized)
            case 403, 400...599:
                let message = (try? JSONDecoder().decode(MessageResponse.self, from: data))?.message ?? "Server error (\(http.statusCode))"
                return .failure(.serverError(message: message))
            default: return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }

    /// DELETE .../[id] — delete a single link.
    static func deleteLink(config: ServerConfig, id: String) async -> Result<Void, LinkServiceError> {
        guard let requestURL = linkURL(config: config, id: id) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }

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
                return .success(())
            case 202:
                guard let queued = try? JSONDecoder().decode(MutationQueuedPayload.self, from: data),
                      let jid = queued.resolvedJobId, !jid.isEmpty
                else {
                    return .failure(.serverError(message: "Delete was queued but no job id was returned"))
                }
                let deadline = queued.retry_deadline_secs ?? 120
                switch await pollMutationJob(config: config, jobId: jid, retryDeadlineSecs: deadline) {
                case .failure(let err):
                    return .failure(err)
                case .success:
                    return .success(())
                }
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 403:
                let msg = (try? JSONDecoder().decode(MessageResponse.self, from: data))?.message ?? "You can't delete this link."
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

    /// POST .../metadata — extract title, description, favicon from URL for Add Link form.
    static func fetchMetadata(config: ServerConfig, url: String) async -> Result<LinkMetadata, LinkServiceError> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        let pathSegments = linksPathSegments(loginPath: config.loginPath)
        guard !pathSegments.isEmpty else {
            return .failure(.noServerURL)
        }
        var requestURL = base
        for segment in pathSegments {
            requestURL = requestURL.appending(path: segment)
        }
        requestURL = requestURL.appending(path: "metadata")
        var request = URLRequest(url: requestURL)
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        request.httpBody = (try? JSONSerialization.data(withJSONObject: ["url": url])) ?? Data()
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }
            switch http.statusCode {
            case 200:
                let decoded = try JSONDecoder().decode(LinkMetadata.self, from: data)
                return .success(decoded)
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
}

struct LinkMetadata: Decodable {
    let title: String?
    let description: String?
    let favicon: String?
}

private struct MessageResponse: Decodable {
    let message: String?
}
