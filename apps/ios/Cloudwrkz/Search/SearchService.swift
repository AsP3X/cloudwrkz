//
//  SearchService.swift
//  Cloudwrkz
//
//  Fetches results from GET /api/search or GET /api/auth/search. Uses Bearer token and ServerConfig.
//  Enhanced search (">" syntax): POST to .../search/enhanced with body { query: "> ..." }.
//  Cancels in-flight requests when a new search starts.
//

import Foundation

enum SearchServiceError: Equatable, Error {
    case noServerURL
    case noToken
    case unauthorized
    case serverError(message: String)
    case networkError(description: String)
    case cancelled
}

/// Enhanced search prefix (">") — same as web. Queries starting with this use structured filters.
enum SearchServiceEnhanced {
    static let prefix = ">"
}

enum SearchService {
    private static let timeout: TimeInterval = 15

    private static func searchPathSegments(loginPath: String) -> [String] {
        let path = loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let searchPath = path.isEmpty ? "api/search" : path.replacingOccurrences(of: "login", with: "search", options: .caseInsensitive)
        return searchPath.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
    }

    /// True if the query uses enhanced search syntax (starts with ">").
    static func isEnhancedSearch(query: String) -> Bool {
        query.trimmingCharacters(in: .whitespaces).hasPrefix(SearchServiceEnhanced.prefix)
    }

    /// GET /api/search?q=...&limit=20&offset=0 (or /api/auth/search when using auth login path). Cancels previous request if still in flight.
    static func search(config: ServerConfig, query: String, limit: Int = 20, offset: Int = 0) async -> Result<SearchResponse, SearchServiceError> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        let pathSegments = searchPathSegments(loginPath: config.loginPath)
        guard !pathSegments.isEmpty else {
            return .failure(.noServerURL)
        }
        var url = base
        for segment in pathSegments {
            url = url.appending(path: segment)
        }
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
        ]
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
                let decoded = try JSONDecoder().decode(SearchResponse.self, from: data)
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
        } catch let error as URLError where error.code == .cancelled {
            return .failure(.cancelled)
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }

    /// POST /api/search/enhanced (or .../auth/search/enhanced). Body: { "query": "> search \"foo\", type: \"ticket\"" }.
    /// Use when query starts with ">". Returns up to 100 results; no offset/pagination.
    static func enhancedSearch(config: ServerConfig, query: String) async -> Result<SearchResponse, SearchServiceError> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        var pathSegments = searchPathSegments(loginPath: config.loginPath)
        guard !pathSegments.isEmpty else {
            return .failure(.noServerURL)
        }
        pathSegments.append("enhanced")
        var url = base
        for segment in pathSegments {
            url = url.appending(path: segment)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        let body: [String: String] = ["query": query]
        guard let bodyData = try? JSONEncoder().encode(body) else {
            return .failure(.serverError(message: "Failed to encode request body"))
        }
        request.httpBody = bodyData

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }
            switch http.statusCode {
            case 200:
                let decoded = try JSONDecoder().decode(SearchResponse.self, from: data)
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
        } catch let error as URLError where error.code == .cancelled {
            return .failure(.cancelled)
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }
}

private struct MessageResponse: Decodable {
    let message: String?
}
