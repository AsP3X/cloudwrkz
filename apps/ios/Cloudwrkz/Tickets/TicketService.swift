//
//  TicketService.swift
//  Cloudwrkz
//
//  Fetches tickets from GET /api/tickets. Uses Bearer token and ServerConfig.
//

import Foundation

enum TicketServiceError: Equatable, Error {
    case noServerURL
    case noToken
    case unauthorized
    case serverError(message: String)
    case networkError(description: String)
}

enum TicketService {
    private static let timeout: TimeInterval = 20

    /// Path for GET tickets: derived from login path (api/auth/login → api/auth/tickets, api/login → api/tickets).
    private static func ticketsPathSegments(loginPath: String) -> [String] {
        let path = loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let ticketsPath = path.isEmpty ? "api/tickets" : path.replacingOccurrences(of: "login", with: "tickets", options: .caseInsensitive)
        return ticketsPath.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
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

    /// PATCH .../tickets/:id — archive (archivedAt: current date).
    static func archiveTicket(config: ServerConfig, id: String) async -> Result<Void, TicketServiceError> {
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
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return .failure(.serverError(message: "Invalid response")) }
            switch http.statusCode {
            case 200: return .success(())
            case 401: SessionExpiredNotifier.notify(); return .failure(.unauthorized)
            case 403, 404, 400...599:
                let message = (try? JSONDecoder().decode(MessageResponse.self, from: data))?.message ?? "Server error (\(http.statusCode))"
                return .failure(.serverError(message: message))
            default: return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            return .failure(.networkError(description: (error as? URLError)?.localizedDescription ?? error.localizedDescription))
        }
    }

    /// PATCH .../tickets/:id — unarchive (archivedAt: null).
    static func unarchiveTicket(config: ServerConfig, id: String) async -> Result<Void, TicketServiceError> {
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
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return .failure(.serverError(message: "Invalid response")) }
            switch http.statusCode {
            case 200: return .success(())
            case 401: SessionExpiredNotifier.notify(); return .failure(.unauthorized)
            case 403, 404, 400...599:
                let message = (try? JSONDecoder().decode(MessageResponse.self, from: data))?.message ?? "Server error (\(http.statusCode))"
                return .failure(.serverError(message: message))
            default: return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            return .failure(.networkError(description: (error as? URLError)?.localizedDescription ?? error.localizedDescription))
        }
    }

    /// DELETE .../tickets/:id — delete a ticket permanently.
    static func deleteTicket(config: ServerConfig, id: String) async -> Result<Void, TicketServiceError> {
        guard let requestURL = ticketURL(config: config, id: id) else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }
        var request = URLRequest(url: requestURL)
        request.httpMethod = "DELETE"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return .failure(.serverError(message: "Invalid response")) }
            switch http.statusCode {
            case 200, 204: return .success(())
            case 401: SessionExpiredNotifier.notify(); return .failure(.unauthorized)
            case 403, 404, 400...599:
                let message = (try? JSONDecoder().decode(MessageResponse.self, from: data))?.message ?? "Server error (\(http.statusCode))"
                return .failure(.serverError(message: message))
            default: return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            return .failure(.networkError(description: (error as? URLError)?.localizedDescription ?? error.localizedDescription))
        }
    }
}

private struct MessageResponse: Decodable {
    let message: String?
}
