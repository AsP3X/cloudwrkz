//
//  EmployeeService.swift
//  Cloudwrkz
//
//  GET /api/v1/employees/me — linked employee for the signed-in user (no employees.* permission required).
//

import Foundation

// Human: Same path derivation as collections so custom login bases still resolve the v1 API tree.
// Agent: EmployeeService.fetchMyEmployee builds URL from ServerConfig.loginPath; Bearer; DECODES MyEmployeeEnvelope.

enum EmployeeServiceError: Equatable, Error {
    case noServerURL
    case noToken
    case unauthorized
    case serverError(message: String)
    case networkError(description: String)
    case decodeFailed
}

enum EmployeeService {
    private static let timeout: TimeInterval = 20

    private static func employeesMePathSegments(loginPath: String) -> [String] {
        let path = loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let employeesPath: String
        if path.isEmpty {
            employeesPath = "api/v1/employees/me"
        } else if path.lowercased().hasSuffix("/auth/login") {
            employeesPath = String(path.dropLast("/auth/login".count)) + "/employees/me"
        } else {
            employeesPath = path.replacingOccurrences(of: "login", with: "employees/me", options: .caseInsensitive)
        }
        return employeesPath.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
    }

    /// GET `/employees/me`. Returns `nil` employee when the account has no linked record.
    static func fetchMyEmployee(config: ServerConfig) async -> Result<EmployeeMyRecord?, EmployeeServiceError> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        let pathSegments = employeesMePathSegments(loginPath: config.loginPath)
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
                do {
                    let decoded = try JSONDecoder().decode(MyEmployeeEnvelope.self, from: data)
                    return .success(decoded.employee)
                } catch {
                    return .failure(.decodeFailed)
                }
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 400...599:
                let message = String(data: data, encoding: .utf8) ?? "Server error (\(http.statusCode))"
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
