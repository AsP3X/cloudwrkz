//
//  TimeTrackingService.swift
//  Cloudwrkz
//
//  API service for time tracking. Uses Bearer token and ServerConfig.
//  Endpoints: GET/POST /api/time-tracking, PATCH/DELETE /api/time-tracking/[id],
//  POST /api/time-tracking/[id]/{pause,resume,stop,complete}; POST breaks may return 202 + mutation job poll.
//

import Foundation

// Human: Time entries and live timers are safety-sensitive—wrong state after resume is worse than a slow spinner, so calls are explicit per action.
// Agent: TimeTrackingService buildURL timeTrackingPath; GET list POST create PATCH DELETE; POST pause resume stop complete; Bearer 20s timeout.

enum TimeTrackingServiceError: Equatable, Error {
    case noServerURL
    case noToken
    case unauthorized
    case notFound
    case serverError(message: String)
    case networkError(description: String)
}

enum TimeTrackingService {
    // Human: Timer actions share the same URL builder so `/api/v1` vs custom loginPath prefixes cannot drift between start and stop.
    // Agent: pathSegments appends extraSegments; JSON encode/decode; notFound on 404.

    private static let timeout: TimeInterval = 20

    private static func timeTrackingPath(loginPath: String) -> String {
        let path = loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        if path.isEmpty { return "api/v1/time-tracking" }
        if path.lowercased().hasSuffix("/auth/login") {
            return String(path.dropLast("/auth/login".count)) + "/time-tracking"
        }
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
        let encodedBody: Data
        do {
            encodedBody = try dateEncoder.encode(input)
        } catch {
            return .failure(.serverError(message: "Could not encode changes for the server."))
        }
        request.httpBody = encodedBody

        return await executeVoid(request: request, config: config)
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
        return await executeVoid(request: request, config: config)
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

        return await executeVoid(request: request, config: config)
    }

    /// POST /api/time-tracking/bulk-delete — one `time_entry_bulk_delete` background job on the Rust API (202 + poll).
    /// Callers without this route (e.g. legacy Next handlers) get `notFound` and should fall back to per-id deletes.
    static func bulkDeleteTimeEntries(config: ServerConfig, ids: [String]) async -> Result<Void, TimeTrackingServiceError> {
        let trimmed = ids.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !trimmed.isEmpty else { return .success(()) }
        guard let url = buildURL(config: config, extraSegments: ["bulk-delete"]) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        struct BulkIdsBody: Encodable { let ids: [String] }
        request.httpBody = try? JSONEncoder().encode(BulkIdsBody(ids: trimmed))

        return await executeVoid(request: request, config: config)
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

    /// Must match `CreateBreakRequest` on the API (`started_at` / `ended_at`); camelCase is ignored and yields zero-duration breaks.
    struct AddBreakBody: Encodable {
        let started_at: String?
        let ended_at: String?
        let description: String?
    }

    /// POST `/time-tracking/{id}/breaks` — API may return **202** + mutation job (same as pause/delete); poll until completed.
    static func addBreak(
        config: ServerConfig,
        timeEntryId: String,
        startedAt: Date? = nil,
        endedAt: Date? = nil,
        description: String? = nil
    ) async -> Result<Void, TimeTrackingServiceError> {
        let id = timeEntryId.trimmingCharacters(in: .whitespaces)
        guard !id.isEmpty else { return .failure(.notFound) }
        guard let url = buildURL(config: config, extraSegments: [id, "breaks"]) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(identifier: "UTC")
        let body = AddBreakBody(
            started_at: startedAt.map { formatter.string(from: $0) },
            ended_at: endedAt.map { formatter.string(from: $0) },
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

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }
            switch http.statusCode {
            case 200, 201, 204:
                return .success(())
            case 202:
                guard let queued = try? JSONDecoder().decode(MutationQueuedPayload.self, from: data),
                      let jid = queued.resolvedJobId, !jid.isEmpty
                else {
                    return .failure(.serverError(message: "Change was queued but no job id was returned"))
                }
                let deadline = queued.retry_deadline_secs ?? 120
                return await pollMutationJob(config: config, jobId: jid, retryDeadlineSecs: deadline)
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 404:
                return .failure(.notFound)
            case 400...599:
                return .failure(.serverError(message: apiErrorMessage(from: data, statusCode: http.statusCode)))
            default:
                return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
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

        return await executeVoid(request: request, config: config)
    }

    // MARK: - Mutation jobs (Rust API returns 202 + poll GET …/mutation-jobs/{id} for many writes)

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

    private static let mutationJobPollIntervalNs: UInt64 = 350_000_000

    private static func pollMutationJob(
        config: ServerConfig,
        jobId: String,
        retryDeadlineSecs: UInt32
    ) async -> Result<Void, TimeTrackingServiceError> {
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
                  let stRaw = (obj["status"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !stRaw.isEmpty
            else {
                continue
            }
            let st = stRaw.lowercased()
            if st == "completed" {
                let code = intFromJsonNumber(obj, key: "http_status") ?? 200
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

        return await executeVoid(request: request, config: config)
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
                return .failure(.serverError(message: apiErrorMessage(from: data, statusCode: http.statusCode)))
            default:
                return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch let error as DecodingError {
            return .failure(.serverError(message: decodingErrorDescription(error)))
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }

    private static func decodingErrorDescription(_ error: DecodingError) -> String {
        switch error {
        case .typeMismatch(let ty, let ctx),
             .valueNotFound(let ty, let ctx):
            return "Could not read server data (\(ty)) at \(ctx.codingPath.map(\.stringValue).joined(separator: ".")): \(ctx.debugDescription)"
        case .keyNotFound(let key, let ctx):
            return "Missing field \(key.stringValue) at \(ctx.codingPath.map(\.stringValue).joined(separator: "."))."
        case .dataCorrupted(let ctx):
            return ctx.debugDescription
        @unknown default:
            return error.localizedDescription
        }
    }

    private static func executeVoid(request: URLRequest, config: ServerConfig) async -> Result<Void, TimeTrackingServiceError> {
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }
            switch http.statusCode {
            case 200, 201, 204:
                return .success(())
            case 202:
                guard let queued = try? JSONDecoder().decode(MutationQueuedPayload.self, from: data),
                      let jid = queued.resolvedJobId, !jid.isEmpty
                else {
                    return .failure(.serverError(message: "Change was queued but no job id was returned"))
                }
                let deadline = queued.retry_deadline_secs ?? 120
                return await pollMutationJob(config: config, jobId: jid, retryDeadlineSecs: deadline)
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 404:
                return .failure(.notFound)
            case 400...599:
                return .failure(.serverError(message: apiErrorMessage(from: data, statusCode: http.statusCode)))
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

/// Parses API JSON errors: primary shape `{ "error": { "message": "…" } }` (`AppError` / `ErrorEnvelope`), then legacy `{ "message": "…" }`.
private struct ApiErrorEnvelope: Decodable {
    struct ErrorBody: Decodable {
        let message: String?
    }

    let error: ErrorBody?
}

private extension TimeTrackingService {
    static func apiErrorMessage(from data: Data, statusCode: Int) -> String {
        let fallback = "Server error (\(statusCode))"
        if let env = try? JSONDecoder().decode(ApiErrorEnvelope.self, from: data),
           let m = env.error?.message?.trimmingCharacters(in: .whitespacesAndNewlines),
           !m.isEmpty
        {
            return m
        }
        if let legacy = try? JSONDecoder().decode(MessageResponse.self, from: data),
           let m = legacy.message?.trimmingCharacters(in: .whitespacesAndNewlines),
           !m.isEmpty
        {
            return m
        }
        return fallback
    }

    /// Reads `http_status` from mutation-job JSON (NSNumber / Int / Double).
    static func intFromJsonNumber(_ obj: [String: Any], key: String) -> Int? {
        if let i = obj[key] as? Int { return i }
        if let n = obj[key] as? NSNumber { return n.intValue }
        if let d = obj[key] as? Double { return Int(d) }
        return nil
    }
}
