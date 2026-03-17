//
//  ServerHealthDetail.swift
//  Cloudwrkz
//
//  Full GET /api/health response model and fetch. Matches References/cloudwrkz API.
//

import Foundation

/// Full health response from GET /api/health (References/cloudwrkz).
struct ServerHealthResponse: Decodable {
    let status: String?
    let timestamp: String?
    let error: String?
    let services: Services?
}

struct Services: Decodable {
    let database: DatabaseHealth?
}

struct DatabaseHealth: Decodable {
    let status: String?
    let connected: Bool?
    let responseTime: Double?
    let error: String?
    let activeConnections: Int?
    let maxConnections: Int?
    let droppedConnections: Int?
    let databaseSize: String?
    let lastChecked: String?
}

enum ServerHealthDetail {
    private static let timeout: TimeInterval = 10

    /// Fetches full health from config.baseURL/api/health. Returns nil on failure.
    static func fetch(config: ServerConfig) async -> ServerHealthResponse? {
        guard let base = config.baseURL else { return nil }
        let url = base.appending(path: "api").appending(path: "health")

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = timeout
        request.cachePolicy = .reloadIgnoringLocalCacheData

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...599).contains(http.statusCode) else {
                return nil
            }
            let decoded = try JSONDecoder().decode(ServerHealthResponse.self, from: data)
            return decoded
        } catch {
            return nil
        }
    }
}
