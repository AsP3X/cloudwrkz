//
//  ProfileService.swift
//  Cloudwrkz
//
//  Upload profile avatar to POST /api/profile/upload-avatar. Uses Bearer token and ServerConfig.
//

import Foundation

enum ProfileServiceError: Equatable, Error {
    case noServerURL
    case noToken
    case unauthorized
    case serverError(message: String)
    case networkError(description: String)
    case encodingFailed
}

private struct UploadAvatarResponse: Decodable {
    let url: String
}

enum ProfileService {
    private static let timeout: TimeInterval = 30
    private static let uploadPathSegments = ["api", "profile", "upload-avatar"]

    /// POST /api/profile/upload-avatar with multipart form "file" (image data, should be < 1MB).
    /// Returns the avatar URL on success.
    static func uploadAvatar(config: ServerConfig, imageData: Data) async -> Result<String, ProfileServiceError> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }

        var url = base
        for segment in uploadPathSegments {
            url = url.appending(path: segment)
        }

        let boundary = "CloudwrkzBoundary-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        AppIdentity.apply(to: &request)

        guard let part1 = "--\(boundary)\r\n".data(using: .utf8),
              let part2 = "Content-Disposition: form-data; name=\"file\"; filename=\"avatar.jpg\"\r\n".data(using: .utf8),
              let part3 = "Content-Type: image/jpeg\r\n\r\n".data(using: .utf8),
              let part4 = "\r\n--\(boundary)--\r\n".data(using: .utf8) else {
            return .failure(.encodingFailed)
        }
        var body = Data()
        body.append(part1)
        body.append(part2)
        body.append(part3)
        body.append(imageData)
        body.append(part4)
        request.httpBody = body

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }
            switch http.statusCode {
            case 200:
                let decoded = try JSONDecoder().decode(UploadAvatarResponse.self, from: data)
                return .success(decoded.url)
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 400...599:
                let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
                    ?? String(data: data, encoding: .utf8)
                    ?? "Upload failed"
                return .failure(.serverError(message: message))
            default:
                return .failure(.serverError(message: "Unexpected status \(http.statusCode)"))
            }
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }

    // MARK: - User preferences (e.g. display language)

    private static let preferencesPathSegments = ["api", "profile", "preferences"]

    /// PATCH /api/profile/preferences with { "locale": "en" } to save display language on the server.
    /// Server may return 200/204 on success; 404 if endpoint not yet implemented.
    static func updatePreferences(config: ServerConfig, locale: String) async -> Result<Void, ProfileServiceError> {
        guard let base = config.baseURL else {
            return .failure(.noServerURL)
        }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else {
            return .failure(.noToken)
        }

        var url = base
        for segment in preferencesPathSegments {
            url = url.appending(path: segment)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.timeoutInterval = timeout
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        AppIdentity.apply(to: &request)

        let body: [String: String] = ["locale": locale]
        guard let bodyData = try? JSONEncoder().encode(body) else {
            return .failure(.encodingFailed)
        }
        request.httpBody = bodyData

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.serverError(message: "Invalid response"))
            }
            switch http.statusCode {
            case 200, 204:
                return .success(())
            case 401:
                SessionExpiredNotifier.notify()
                return .failure(.unauthorized)
            case 404:
                // Endpoint not implemented yet; treat as success so local preference is still saved
                return .success(())
            case 400...599:
                return .failure(.serverError(message: "Failed to save preference"))
            default:
                return .success(())
            }
        } catch {
            let description = (error as? URLError)?.localizedDescription ?? error.localizedDescription
            return .failure(.networkError(description: description))
        }
    }
}
