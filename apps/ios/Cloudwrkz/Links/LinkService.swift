//
//  LinkService.swift
//  Cloudwrkz
//
//  Fetches links from GET /api/links. Uses Bearer token and ServerConfig.
//

import Foundation

enum LinkServiceError: Equatable, Error {
    case noServerURL
    case noToken
    case unauthorized
    case serverError(message: String)
    case networkError(description: String)
}

enum LinkService {
    private static let timeout: TimeInterval = 20

    /// Path for GET links: derived from login path (api/auth/login → api/auth/links, api/login → api/links).
    private static func linksPathSegments(loginPath: String) -> [String] {
        let path = loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let linksPath = path.isEmpty ? "api/links" : path.replacingOccurrences(of: "login", with: "links", options: .caseInsensitive)
        return linksPath.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
    }

    private static var dateDecoder: JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: s) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: s) { return date }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Invalid date: \(s)")
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
        requestURL = requestURL.appending(path: id)

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
                struct UpdateResponse: Decodable { let id: String }
                let decoded = try JSONDecoder().decode(UpdateResponse.self, from: data)
                return .success(decoded.id)
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
        guard let base = config.baseURL else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }
        let pathSegments = linksPathSegments(loginPath: config.loginPath)
        guard !pathSegments.isEmpty else { return .failure(.noServerURL) }
        var requestURL = base
        for segment in pathSegments { requestURL = requestURL.appending(path: segment) }
        requestURL = requestURL.appending(path: id)
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
            case 200: return .success(())
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
        guard let base = config.baseURL else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }
        let pathSegments = linksPathSegments(loginPath: config.loginPath)
        guard !pathSegments.isEmpty else { return .failure(.noServerURL) }
        var requestURL = base
        for segment in pathSegments { requestURL = requestURL.appending(path: segment) }
        requestURL = requestURL.appending(path: id)

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
