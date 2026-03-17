//
//  ServerConfig.swift
//  Cloudwrkz
//
//  Tenant and server configuration (official Cloudwrkz, on‑prem).
//  Persisted in UserDefaults so API base URL can be built from tenant + domain + port.
//

import Foundation

enum TenantType: String, CaseIterable, Identifiable {
    case official = "Official Cloudwrkz"
    case onprem = "On‑prem"

    var id: String { rawValue }

    /// Default host for official tenant; ignored when onprem.
    static let officialDomain = "cloudwrkz.com"
    static let officialPort: Int? = nil
}

struct ServerConfig: Equatable {
    var tenant: TenantType
    var serverDomain: String
    var serverPort: Int?
    /// When true use https, when false use http (e.g. for local deployments).
    var useHTTPS: Bool
    /// Path relative to base URL for login (e.g. "api/auth/login" or "api/login"). No leading slash.
    var loginPath: String

    static let defaultLoginPath = "api/login"

    static let defaults = ServerConfig(
        tenant: .official,
        serverDomain: TenantType.officialDomain,
        serverPort: TenantType.officialPort,
        useHTTPS: true,
        loginPath: defaultLoginPath
    )

    /// Base URL for API requests (e.g. https://cloudwrkz.com or http://localhost:3000).
    var baseURL: URL? {
        let host = tenant == .official ? TenantType.officialDomain : serverDomain
        let scheme = (tenant == .official || useHTTPS) ? "https" : "http"
        var components = URLComponents()
        components.scheme = scheme
        components.host = host.isEmpty ? nil : host
        components.port = (tenant != .official && (serverPort ?? 0) > 0) ? serverPort : nil
        return components.url
    }
}

// MARK: - UserDefaults persistence

private enum Keys {
    static let tenant = "cloudwrkz.serverConfig.tenant"
    static let serverDomain = "cloudwrkz.serverConfig.serverDomain"
    static let serverPort = "cloudwrkz.serverConfig.serverPort"
    static let useHTTPS = "cloudwrkz.serverConfig.useHTTPS"
    static let loginPath = "cloudwrkz.serverConfig.loginPath"
}

extension ServerConfig {
    static func load() -> ServerConfig {
        let raw = UserDefaults.standard.string(forKey: Keys.tenant)
        let tenant: TenantType = {
            if let r = raw, let t = TenantType(rawValue: r) { return t }
            if raw == "Self‑hosted" { return .onprem } // migrate removed option
            return .official
        }()
        let domain = UserDefaults.standard.string(forKey: Keys.serverDomain) ?? TenantType.officialDomain
        let port: Int? = {
            let v = UserDefaults.standard.object(forKey: Keys.serverPort)
            if let n = v as? Int { return n }
            if let n = v as? NSNumber { return n.intValue }
            return nil
        }()
        let path = UserDefaults.standard.string(forKey: Keys.loginPath) ?? ServerConfig.defaultLoginPath
        let https: Bool
        if UserDefaults.standard.object(forKey: Keys.useHTTPS) != nil {
            https = UserDefaults.standard.bool(forKey: Keys.useHTTPS)
        } else {
            https = true
        }
        return ServerConfig(tenant: tenant, serverDomain: domain, serverPort: port, useHTTPS: https, loginPath: path)
    }

    func save() {
        UserDefaults.standard.set(tenant.rawValue, forKey: Keys.tenant)
        UserDefaults.standard.set(serverDomain, forKey: Keys.serverDomain)
        if let p = serverPort {
            UserDefaults.standard.set(p, forKey: Keys.serverPort)
        } else {
            UserDefaults.standard.removeObject(forKey: Keys.serverPort)
        }
        UserDefaults.standard.set(useHTTPS, forKey: Keys.useHTTPS)
        let pathToSave = loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        if !pathToSave.isEmpty {
            UserDefaults.standard.set(pathToSave, forKey: Keys.loginPath)
        } else {
            UserDefaults.standard.set(ServerConfig.defaultLoginPath, forKey: Keys.loginPath)
        }
    }
}
