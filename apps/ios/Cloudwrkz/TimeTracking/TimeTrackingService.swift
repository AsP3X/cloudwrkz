//
//  TimeTrackingService.swift
//  Cloudwrkz
//
//  API service for time tracking. Uses Bearer token and ServerConfig.
//  Endpoints: GET/POST /api/time-tracking, PATCH/DELETE /api/time-tracking/[id],
//  POST /api/time-tracking/[id]/{pause,resume,stop,complete}.
//

import Foundation

enum TimeTrackingServiceError: Equatable, Error {
    case noServerURL
    case noToken
    case unauthorized
    case notFound
    case serverError(message: String)
    case networkError(description: String)
}

enum TimeTrackingService {
    private static let timeout: TimeInterval = 20

    private static func timeTrackingPath(loginPath: String) -> String {
        let path = loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        if path.isEmpty { return "api/time-tracking" }
        return path.replacingOccurrences(of: "login", with: "time-tracking", options: .caseInsensitive)
    }

    private static func pathSegments(_ path: String) -> [String] {
        path.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
    }

    private static func buildURL(config: ServerConfig, extraSegments: [String] = []) -> URL? {
        guard let base = config.baseURL else { return nil }
        let segments = pathSegments(timeTrackingPath(loginPath: config.loginPath))
        guard !segments.isEmpty else { return nil }
        var url = base
        for segment in segments { url = url.appending(path: segment) }
        for segment in extraSegments { url = url.appending(path: segment) }
        return url
    }

    private static var dateDecoder: JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            formatter.timeZone = TimeZone(identifier: "UTC")
            if let date = formatter.date(from: s) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: s) { return date }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Invalid date: \(s)")
        }
        return d
    }

    private static var dateEncoder: JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            formatter.timeZone = TimeZone(identifier: "UTC")
            try c.encode(formatter.string(from: date))
        }
        return e
    }

    // MARK: - GET /api/time-tracking (list)

    static func fetchTimeEntries(
        config: ServerConfig,
        filters: TimeTrackingFilters
    ) async -> Result<[TimeEntry], TimeTrackingServiceError> {
        guard let url = buildURL(config: config) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }

        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        var queryItems: [URLQueryItem] = []

        if filters.status != .all {
            if filters.status == .active {
                queryItems.append(URLQueryItem(name: "status", value: "RUNNING"))
                queryItems.append(URLQueryItem(name: "status", value: "PAUSED"))
            } else {
                queryItems.append(URLQueryItem(name: "status", value: filters.status.rawValue))
            }
        }

        queryItems.append(URLQueryItem(name: "sort", value: filters.sort.rawValue))
        queryItems.append(URLQueryItem(name: "archive", value: filters.archive.rawValue))

        if let d = filters.dateFrom { queryItems.append(URLQueryItem(name: "dateFrom", value: isoDate(d))) }
        if let d = filters.dateTo { queryItems.append(URLQueryItem(name: "dateTo", value: isoDate(d))) }

        if !queryItems.isEmpty { components.queryItems = queryItems }

        guard let finalURL = components.url else { return .failure(.noServerURL) }

        var request = URLRequest(url: finalURL)
        request.httpMethod = "GET"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)

        return await execute(request: request, decode: { data in
            let decoded = try dateDecoder.decode(TimeEntriesResponse.self, from: data)
            return decoded.timeEntries
        })
    }

    // MARK: - GET /api/time-tracking/active

    static func fetchActiveTimeEntries(config: ServerConfig) async -> Result<[TimeEntry], TimeTrackingServiceError> {
        guard let url = buildURL(config: config, extraSegments: ["active"]) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)

        return await execute(request: request, decode: { data in
            let decoded = try dateDecoder.decode(TimeEntriesResponse.self, from: data)
            return decoded.timeEntries
        })
    }

    // MARK: - GET /api/time-tracking/[id]

    static func fetchTimeEntry(config: ServerConfig, id: String) async -> Result<TimeEntry, TimeTrackingServiceError> {
        guard let url = buildURL(config: config, extraSegments: [id]) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)

        return await execute(request: request, decode: { data in
            let decoded = try dateDecoder.decode(SingleTimeEntryResponse.self, from: data)
            return decoded.timeEntry
        })
    }

    // MARK: - POST /api/time-tracking (create / start timer)

    struct CreateInput: Encodable {
        var name: String?
        var description: String?
        var tags: [String]?
        var location: String?
        var billable: Bool?
        var ticketId: String?
    }

    static func createTimeEntry(config: ServerConfig, input: CreateInput) async -> Result<String, TimeTrackingServiceError> {
        guard let url = buildURL(config: config) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        request.httpBody = try? dateEncoder.encode(input)

        return await execute(request: request, decode: { data in
            let decoded = try JSONDecoder().decode(CreateTimeEntryResponse.self, from: data)
            return decoded.id
        })
    }

    // MARK: - POST /api/time-tracking/add (manual entry with duration)

    struct AddManualInput: Encodable {
        var name: String
        var description: String?
        var tags: [String]?
        var location: String?
        var billable: Bool?
        var hours: Int
        var minutes: Int
        var seconds: Int
        var startedAt: Date
    }

    static func addTimeEntry(config: ServerConfig, input: AddManualInput) async -> Result<String, TimeTrackingServiceError> {
        guard let url = buildURL(config: config, extraSegments: ["add"]) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        request.httpBody = try? dateEncoder.encode(input)

        return await execute(request: request, decode: { data in
            let decoded = try JSONDecoder().decode(CreateTimeEntryResponse.self, from: data)
            return decoded.id
        })
    }

    // MARK: - PATCH /api/time-tracking/[id] (update)

    struct UpdateInput: Encodable {
        var name: String?
        var description: String?
        var tags: [String]?
        var location: String?
        var billable: Bool?
        var startedAt: Date?
        var stoppedAt: Date?
    }

    static func updateTimeEntry(config: ServerConfig, id: String, input: UpdateInput) async -> Result<Void, TimeTrackingServiceError> {
        guard let url = buildURL(config: config, extraSegments: [id]) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }

        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        request.httpBody = try? dateEncoder.encode(input)

        return await executeVoid(request: request)
    }

    /// Unarchive a time entry (PATCH with archivedAt: null).
    static func unarchiveTimeEntry(config: ServerConfig, id: String) async -> Result<Void, TimeTrackingServiceError> {
        guard let url = buildURL(config: config, extraSegments: [id]) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        let body: [String: Any?] = ["archivedAt": NSNull()]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        return await executeVoid(request: request)
    }

    // MARK: - DELETE /api/time-tracking/[id]

    static func deleteTimeEntry(config: ServerConfig, id: String) async -> Result<Void, TimeTrackingServiceError> {
        guard let url = buildURL(config: config, extraSegments: [id]) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)

        return await executeVoid(request: request)
    }

    // MARK: - POST /api/time-tracking/[id]/pause

    static func pauseTimeEntry(config: ServerConfig, id: String) async -> Result<Void, TimeTrackingServiceError> {
        return await postAction(config: config, id: id, action: "pause")
    }

    // MARK: - POST /api/time-tracking/[id]/resume

    static func resumeTimeEntry(config: ServerConfig, id: String) async -> Result<Void, TimeTrackingServiceError> {
        return await postAction(config: config, id: id, action: "resume")
    }

    // MARK: - POST /api/time-tracking/[id]/stop

    static func stopTimeEntry(config: ServerConfig, id: String) async -> Result<Void, TimeTrackingServiceError> {
        return await postAction(config: config, id: id, action: "stop")
    }

    // MARK: - POST /api/time-tracking/[id]/complete

    static func completeTimeEntry(config: ServerConfig, id: String) async -> Result<Void, TimeTrackingServiceError> {
        return await postAction(config: config, id: id, action: "complete")
    }

    // MARK: - POST /api/time-tracking/[id]/breaks

    struct AddBreakBody: Encodable {
        let startedAt: String?
        let endedAt: String?
        let description: String?
    }

    struct AddBreakResponse: Decodable {
        let id: String
    }

    static func addBreak(
        config: ServerConfig,
        timeEntryId: String,
        startedAt: Date? = nil,
        endedAt: Date? = nil,
        description: String? = nil
    ) async -> Result<String, TimeTrackingServiceError> {
        let id = timeEntryId.trimmingCharacters(in: .whitespaces)
        guard !id.isEmpty else { return .failure(.notFound) }
        guard let url = buildURL(config: config, extraSegments: [id, "breaks"]) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(identifier: "UTC")
        let body = AddBreakBody(
            startedAt: startedAt.map { formatter.string(from: $0) },
            endedAt: endedAt.map { formatter.string(from: $0) },
            description: description
        )

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        request.httpBody = try? JSONEncoder().encode(body)

        return await execute(request: request, decode: { data in
            let decoded = try dateDecoder.decode(AddBreakResponse.self, from: data)
            return decoded.id
        })
    }

    // MARK: - DELETE /api/time-tracking/[id]/breaks/[breakId]

    static func deleteBreak(
        config: ServerConfig,
        timeEntryId: String,
        breakId: String
    ) async -> Result<Void, TimeTrackingServiceError> {
        guard let url = buildURL(config: config, extraSegments: [timeEntryId, "breaks", breakId]) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)

        return await executeVoid(request: request)
    }

    // MARK: - Shared helpers

    private static func postAction(config: ServerConfig, id: String, action: String) async -> Result<Void, TimeTrackingServiceError> {
        guard let url = buildURL(config: config, extraSegments: [id, action]) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)

        return await executeVoid(request: request)
    }

    private static func execute<T>(request: URLRequest, decode: (Data) throws -> T) async -> Result<T, TimeTrackingServiceError> {
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }
            switch http.statusCode {
            case 200, 201:
                let decoded = try decode(data)
                return .success(decoded)
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 404:
                return .failure(.notFound)
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

    private static func executeVoid(request: URLRequest) async -> Result<Void, TimeTrackingServiceError> {
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }
            switch http.statusCode {
            case 200, 201, 204:
                return .success(())
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 404:
                return .failure(.notFound)
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
}

private struct MessageResponse: Decodable {
    let message: String?
}
