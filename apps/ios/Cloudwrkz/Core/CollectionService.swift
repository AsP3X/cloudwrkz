//
//  CollectionService.swift
//  Cloudwrkz
//
//  Fetches collections from GET /api/collections. Uses Bearer token and ServerConfig.
//

import Foundation

enum CollectionServiceError: Equatable, Error {
    case noServerURL
    case noToken
    case unauthorized
    case serverError(message: String)
    case networkError(description: String)
}

enum CollectionService {
    private static let timeout: TimeInterval = 20

    /// Path for GET collections: derived from login path (api/auth/login → api/auth/collections).
    private static func collectionsPathSegments(loginPath: String) -> [String] {
        let path = loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let collectionsPath = path.isEmpty
            ? "api/collections"
            : path.replacingOccurrences(of: "login", with: "collections", options: .caseInsensitive)
        return collectionsPath.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
    }

    /// GET /api/collections. Returns collections or error.
    static func fetchCollections(config: ServerConfig, archived: Bool = false) async -> Result<[Collection], CollectionServiceError> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        let pathSegments = collectionsPathSegments(loginPath: config.loginPath)
        guard !pathSegments.isEmpty else {
            return .failure(.noServerURL)
        }
        var url = base
        for segment in pathSegments {
            url = url.appending(path: segment)
        }
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "archived", value: archived ? "true" : "false")]
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
                let decoded = try JSONDecoder().decode(CollectionsResponse.self, from: data)
                return .success(decoded.collections)
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

private struct MessageResponse: Decodable {
    let message: String?
}
