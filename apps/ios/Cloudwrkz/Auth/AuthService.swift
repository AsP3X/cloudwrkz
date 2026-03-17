//
//  AuthService.swift
//  Cloudwrkz
//
//  Login API client. Matches References/cloudwrkz when available.
//
//  API contract:
//  - Login: POST {baseURL}/{loginPath} body { email, password }, 200 { token, user?: { name, email } }
//  - Register: POST {baseURL}/api/register body { name, email, password, confirmPassword }, 201 { message }
//

import Foundation

// MARK: - Request / Response types

private struct LoginRequest: Encodable {
    let email: String
    let password: String
    let deviceName: String?
    let deviceType: String?
    let deviceOs: String?
    let deviceBrowser: String?
    let userAgent: String?
}

private struct RegisterRequest: Encodable {
    let name: String
    let email: String
    let password: String
    let confirmPassword: String
}

private struct ChangePasswordRequest: Encodable {
    let currentPassword: String
    let newPassword: String
    let confirmPassword: String
}

/// Success response from POST /api/auth/login (References/cloudwrkz).
/// Supports both "token" and "accessToken"; optional user with name and email.
private struct LoginSuccessResponse: Decodable {
    let token: String?
    let accessToken: String?
    let user: LoginUserInfo?

    var storedToken: String? {
        token ?? accessToken
    }
}

/// User object returned by cloudwrkz login API (user.name, user.email).
private struct LoginUserInfo: Decodable {
    let name: String?
    let email: String?
}

/// Error body from login endpoint when status is 4xx/5xx.
/// Supports common shapes: message, error, detail, msg; or errors[].
private struct LoginErrorResponse: Decodable {
    let message: String?
    let error: String?
    let detail: String?
    let msg: String?
    let errors: [String]?

    /// First non-empty string from any supported field.
    var displayMessage: String? {
        if let m = message, !m.isEmpty { return m }
        if let m = error, !m.isEmpty { return m }
        if let m = detail, !m.isEmpty { return m }
        if let m = msg, !m.isEmpty { return m }
        if let arr = errors, let first = arr.first(where: { !$0.isEmpty }) { return first }
        return nil
    }
}

// MARK: - Result type

enum AuthLoginFailure: Equatable, Error {
    case noServerURL
    case invalidCredentials
    case serverError(message: String)
    case networkError(description: String)
}

enum AuthRegisterFailure: Equatable, Error {
    case noServerURL
    case serverError(message: String)
    case networkError(description: String)
}

enum AuthMeFailure: Equatable, Error {
    case noServerURL
    case noToken
    case unauthorized
    case serverError(message: String)
    case networkError(description: String)
}

enum AuthChangePasswordFailure: Equatable, Error {
    case noServerURL
    case noToken
    case invalidCurrentPassword
    case serverError(message: String)
    case networkError(description: String)
}

private struct MeResponse: Decodable {
    let name: String?
    let email: String?
    /// Module IDs the user is allowed to access (e.g. ["tickets", "todos", "links", "time_tracking", "archive"]). Omitted = all modules.
    let modules: [String]?
}

enum AuthService {
    private static let timeout: TimeInterval = 15

    /// Performs POST baseURL/{config.loginPath}. Does not store the token; caller must use AuthTokenStorage.
    /// On success returns (token, user) where user contains name and email from the API when available.
    static func login(email: String, password: String, config: ServerConfig) async -> Result<(token: String, user: (name: String?, email: String?)?), AuthLoginFailure> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        let path = config.loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let pathToUse = path.isEmpty ? ServerConfig.defaultLoginPath : path
        let pathSegments = pathToUse
            .split(separator: "/", omittingEmptySubsequences: true)
            .map(String.init)
        guard !pathSegments.isEmpty else {
            return .failure(.noServerURL)
        }
        var url = base
        for segment in pathSegments {
            url = url.appending(path: segment)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        AppIdentity.apply(to: &request)

        let body = LoginRequest(
            email: email,
            password: password,
            deviceName: AppIdentity.deviceName,
            deviceType: AppIdentity.deviceType,
            deviceOs: AppIdentity.deviceOs,
            deviceBrowser: AppIdentity.deviceBrowser,
            userAgent: AppIdentity.userAgent
        )
        do {
            request.httpBody = try JSONEncoder().encode(body)
        } catch {
            return .failure(.networkError(description: error.localizedDescription))
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }

            switch http.statusCode {
            case 200...299:
                if isHTMLData(data) {
                    return .failure(.serverError(message: "Server returned a web page instead of a response. The login endpoint may not be available. No route at: \(request.url?.absoluteString ?? "")"))
                }
                let decoded = try JSONDecoder().decode(LoginSuccessResponse.self, from: data)
                guard let token = decoded.storedToken, !token.isEmpty else {
                    return .failure(.serverError(message: "No token in response"))
                }
                let user: (name: String?, email: String?)? = decoded.user.map { u in (name: u.name, email: u.email) }
                return .success((token: token, user: user))
            case 401:
                return .failure(.invalidCredentials)
            case 400...599:
                let message = extractServerErrorMessage(data: data, statusCode: http.statusCode, requestURL: request.url)
                return .failure(.serverError(message: message))
            default:
                return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }

    /// Path for change password: derived from login path (api/login → api/change-password, api/auth/login → api/auth/change-password).
    private static func changePasswordPathSegments(loginPath: String) -> [String] {
        let path = loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let changePath = path.isEmpty ? "api/change-password" : path.replacingOccurrences(of: "login", with: "change-password", options: .caseInsensitive)
        return changePath.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
    }

    /// POST change-password with Bearer token. Body: currentPassword, newPassword, confirmPassword. 200 = success.
    static func changePassword(currentPassword: String, newPassword: String, confirmPassword: String, config: ServerConfig) async -> Result<Void, AuthChangePasswordFailure> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        let pathSegments = changePasswordPathSegments(loginPath: config.loginPath)
        guard !pathSegments.isEmpty else {
            return .failure(.noServerURL)
        }
        var url = base
        for segment in pathSegments {
            url = url.appending(path: segment)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        let body = ChangePasswordRequest(currentPassword: currentPassword, newPassword: newPassword, confirmPassword: confirmPassword)
        do {
            request.httpBody = try JSONEncoder().encode(body)
        } catch {
            return .failure(.networkError(description: error.localizedDescription))
        }
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }
            switch http.statusCode {
            case 200...299:
                if isHTMLData(data) {
                    return .failure(.serverError(message: "Server returned a web page instead of a response. No route at: \(request.url?.absoluteString ?? "")"))
                }
                return .success(())
            case 401:
                return .failure(.invalidCurrentPassword)
            case 400...599:
                let message = extractServerErrorMessage(data: data, statusCode: http.statusCode, requestURL: request.url)
                return .failure(.serverError(message: message))
            default:
                return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }

    private static let registerPathSegments = ["api", "register"]

    /// GET current user with Bearer token. Path derived from login path (api/login → api/me, api/auth/login → api/auth/me).
    /// Returns name, email, and optional modules (allowed module IDs). When modules is nil or empty from API, caller may treat as "all modules allowed".
    static func fetchCurrentUser(config: ServerConfig) async -> Result<(name: String?, email: String?, modules: [String]?), AuthMeFailure> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        let path = config.loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let mePath = path.isEmpty ? "api/me" : path.replacingOccurrences(of: "login", with: "me", options: .caseInsensitive)
        let pathSegments = mePath.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        guard !pathSegments.isEmpty else {
            return .failure(.noServerURL)
        }
        var url = base
        for segment in pathSegments {
            url = url.appending(path: segment)
        }
        var request = URLRequest(url: url)
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
                let decoded = try JSONDecoder().decode(MeResponse.self, from: data)
                return .success((name: decoded.name, email: decoded.email, modules: decoded.modules))
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 400...599:
                let message = extractServerErrorMessage(data: data, statusCode: http.statusCode, requestURL: request.url)
                return .failure(.serverError(message: message))
            default:
                return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }

    /// POST extend-session: if session is valid and has less than 7 days left, server extends to 7 days.
    /// Path derived from login path (api/login → api/extend-session, api/auth/login → api/auth/extend-session).
    /// Call when the user opens the app; does not notify on 401 (periodic validate will show session expired).
    static func extendSession(config: ServerConfig) async -> Result<Void, AuthMeFailure> {
        guard let base = config.baseURL else { return .failure(.noServerURL) }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return .failure(.noToken) }
        let path = config.loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let extendPath = path.isEmpty ? "api/extend-session" : path.replacingOccurrences(of: "login", with: "extend-session", options: .caseInsensitive)
        let pathSegments = extendPath.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        guard !pathSegments.isEmpty else { return .failure(.noServerURL) }
        var url = base
        for segment in pathSegments { url = url.appending(path: segment) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return .failure(.serverError(message: "Invalid response")) }
            switch http.statusCode {
            case 200: return .success(())
            case 401: return .failure(.unauthorized)
            case 400...599: return .failure(.serverError(message: "Server error \(http.statusCode)"))
            default: return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }

    /// Performs POST baseURL/api/register. On success the user account exists; caller typically navigates to login.
    static func register(name: String, email: String, password: String, confirmPassword: String, config: ServerConfig) async -> Result<Void, AuthRegisterFailure> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        var url = base
        for segment in registerPathSegments {
            url = url.appending(path: segment)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        AppIdentity.apply(to: &request)

        let body = RegisterRequest(name: name, email: email, password: password, confirmPassword: confirmPassword)
        do {
            request.httpBody = try JSONEncoder().encode(body)
        } catch {
            return .failure(.networkError(description: error.localizedDescription))
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }

            switch http.statusCode {
            case 200...299:
                if isHTMLData(data) {
                    return .failure(.serverError(message: "Server returned a web page instead of a response. The register endpoint may not be available. No route at: \(request.url?.absoluteString ?? "")"))
                }
                return .success(())
            case 400...599:
                let message = extractServerErrorMessage(data: data, statusCode: http.statusCode, requestURL: request.url)
                return .failure(.serverError(message: message))
            default:
                return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }

    private static func isHTMLData(_ data: Data) -> Bool {
        guard !data.isEmpty, let s = String(data: data, encoding: .utf8) else { return false }
        let lower = s.prefix(200).lowercased()
        return lower.contains("<!doctype") || lower.contains("<html") || lower.contains("</html>")
    }

    /// Extracts a user-visible message from 4xx/5xx response body, or returns a fallback including status code.
    private static func extractServerErrorMessage(data: Data, statusCode: Int, requestURL: URL? = nil) -> String {
        if let errorBody = try? JSONDecoder().decode(LoginErrorResponse.self, from: data),
           let msg = errorBody.displayMessage, !msg.isEmpty {
            return msg
        }
        var fallback: String
        if !data.isEmpty, let raw = String(data: data, encoding: .utf8) {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                if isHTML(trimmed) {
                    if let title = extractHTMLTitle(trimmed), !title.isEmpty {
                        fallback = "Server error (\(statusCode)): \(title)"
                    } else {
                        fallback = "Server error (\(statusCode)). The server returned a web page instead of a JSON response."
                    }
                } else {
                    fallback = trimmed.count <= 200 ? trimmed : String(trimmed.prefix(197)) + "..."
                }
            } else {
                fallback = "Server error (\(statusCode))"
            }
        } else {
            fallback = "Server error (\(statusCode))"
        }
        if statusCode == 404, let url = requestURL {
            fallback += " No route at: \(url.absoluteString)"
        }
        return fallback
    }

    private static func isHTML(_ s: String) -> Bool {
        let lower = s.lowercased()
        return lower.hasPrefix("<!doctype") || lower.hasPrefix("<html") || lower.contains("</html>")
    }

    private static func extractHTMLTitle(_ html: String) -> String? {
        guard let start = html.range(of: "<title", options: .caseInsensitive),
              let endOpen = html[start.upperBound...].range(of: ">"),
              let endClose = html[endOpen.upperBound...].range(of: "</title>", options: .caseInsensitive) else {
            return nil
        }
        let content = String(html[endOpen.upperBound..<endClose.lowerBound])
        return content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : content
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "&#x27;", with: "'")
            .replacingOccurrences(of: "&quot;", with: "\"")
    }
}
