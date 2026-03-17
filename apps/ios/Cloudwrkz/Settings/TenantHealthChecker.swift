//
//  TenantHealthChecker.swift
//  Cloudwrkz
//
//  Checks if the configured tenant is reachable and healthy via GET /api/health.
//  Matches the API from the Cloudwrkz web app (References).
//

import Foundation

/// Result of checking the configured tenant's health endpoint.
enum TenantHealthResult: Equatable {
    case checking
    case healthy
    case degraded
    case unreachable(message: String?)
}

/// Minimal response shape for GET /api/health (References/cloudwrkz).
private struct HealthResponse: Decodable {
    let status: String?
}

enum TenantHealthChecker {
    private static let timeout: TimeInterval = 8

    /// Checks the configured tenant at `baseURL/api/health`.
    /// Returns `.unreachable` if URL is nil, request fails, or response is invalid.
    static func check(config: ServerConfig) async -> TenantHealthResult {
        guard let base = config.baseURL else {
            return .unreachable(message: "No server URL")
        }
        let url = base.appending(path: "api").appending(path: "health")

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = Self.timeout
        AppIdentity.apply(to: &request)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .unreachable(message: "Invalid response")
            }
            // Server may return 503 when unhealthy but still JSON
            guard (200...599).contains(http.statusCode) else {
                return .unreachable(message: "HTTP \(http.statusCode)")
            }
            let decoded = try JSONDecoder().decode(HealthResponse.self, from: data)
            switch decoded.status?.lowercased() {
            case "healthy":
                return .healthy
            case "degraded":
                return .degraded
            default:
                return .unreachable(message: "Service unhealthy")
            }
        } catch {
            let message = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .unreachable(message: message)
        }
    }
}
