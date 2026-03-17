//
//  QrLoginService.swift
//  Cloudwrkz
//
//  Calls POST /api/auth/qr-login/approve with requestId; app must be logged in (Bearer token).
//

import Foundation

enum QrLoginApproveFailure: Equatable, Error {
    case noServerURL
    case noToken
    case invalidRequestId
    case unauthorized
    case requestNotFoundOrExpired
    case requestAlreadyUsedOrExpired
    case requestExpired
    case serverError(message: String)
    case networkError(description: String)
}

enum QrLoginService {
    private static let timeout: TimeInterval = 15
    private static let approvePathSegments = ["api", "auth", "qr-login", "approve"]

    /// Approve a QR login request (browser will then receive the session). Caller must be logged in.
    static func approve(requestId: String, config: ServerConfig) async -> Result<Void, QrLoginApproveFailure> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }
        let trimmed = requestId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 100 else {
            return .failure(.invalidRequestId)
        }

        var url = base
        for segment in Self.approvePathSegments {
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

        struct Body: Encodable {
            let requestId: String
        }
        do {
            request.httpBody = try JSONEncoder().encode(Body(requestId: trimmed))
        } catch {
            return .failure(.networkError(description: error.localizedDescription))
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }

            switch http.statusCode {
            case 200:
                return .success(())
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 404:
                return .failure(.requestNotFoundOrExpired)
            case 409:
                return .failure(.requestAlreadyUsedOrExpired)
            case 410:
                return .failure(.requestExpired)
            case 400...599:
                let message = (try? JSONDecoder().decode(ServerMessage.self, from: data))?.message
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

    private struct ServerMessage: Decodable {
        let message: String?
    }
}
