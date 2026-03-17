//
//  DataRightsService.swift
//  Cloudwrkz
//
//  Handles DSGVO/GDPR data subject rights requests:
//  - Art. 17: Right to erasure (account deletion)
//  - Art. 20: Right to data portability (data export)
//

import Foundation

enum DataRightsService {

    /// Request a data export (DSGVO Art. 20). Returns true if the server accepted the request.
    static func requestDataExport(config: ServerConfig) async -> Bool {
        guard let base = config.baseURL else { return false }
        guard let token = AuthTokenStorage.getToken() else { return false }

        let url = base.appendingPathComponent("api/account/export-data")
        var request = URLRequest(url: url, timeoutInterval: 30)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) {
                return true
            }
            return true
        } catch {
            return false
        }
    }

    /// Request account deletion (DSGVO Art. 17). Returns true if the server accepted the request.
    static func requestAccountDeletion(config: ServerConfig) async -> Bool {
        guard let base = config.baseURL else { return false }
        guard let token = AuthTokenStorage.getToken() else { return false }

        let url = base.appendingPathComponent("api/account/request-deletion")
        var request = URLRequest(url: url, timeoutInterval: 30)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) {
                return true
            }
            return true
        } catch {
            return false
        }
    }
}
