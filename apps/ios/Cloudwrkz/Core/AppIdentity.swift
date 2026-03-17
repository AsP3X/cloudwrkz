//
//  AppIdentity.swift
//  Cloudwrkz
//
//  Provides app and device identity for API requests.
//  Sets a recognizable User-Agent header and supplies device metadata
//  so sessions are clearly identified (e.g. "Mobile iOS (Cloudwrkz App)").
//

import Foundation
#if canImport(UIKit)
import UIKit
#endif

enum AppIdentity {

    // MARK: - User-Agent

    /// User-Agent string sent with every API request.
    /// Format: `Cloudwrkz-iOS/{version} ({build}; iOS {osVersion}; {model})`
    /// Example: `Cloudwrkz-iOS/1.2 (42; iOS 17.4; iPhone16,1)`
    static let userAgent: String = {
        let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        let buildNumber = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        let osVersion = ProcessInfo.processInfo.operatingSystemVersionString
        let model = deviceModelIdentifier
        return "Cloudwrkz-iOS/\(appVersion) (\(buildNumber); iOS \(osVersion); \(model))"
    }()

    // MARK: - Device metadata (matches web DeviceMetadata shape)

    /// Human-friendly session label shown in "Login sessions".
    /// Example: "Mobile iOS (Cloudwrkz App)"
    static let deviceName = "Mobile iOS (Cloudwrkz App)"

    /// Device category: "mobile", "tablet", or "desktop".
    static let deviceType: String = {
        #if canImport(UIKit)
        switch UIDevice.current.userInterfaceIdiom {
        case .pad:
            return "tablet"
        case .mac:
            return "desktop"
        default:
            return "mobile"
        }
        #else
        return "mobile"
        #endif
    }()

    /// Operating system name.
    static let deviceOs = "iOS"

    /// "Browser" equivalent — the app itself.
    static let deviceBrowser = "Cloudwrkz App"

    // MARK: - URLRequest helper

    /// Applies the Cloudwrkz iOS User-Agent header to a request.
    static func apply(to request: inout URLRequest) {
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
    }

    // MARK: - Private

    private static let deviceModelIdentifier: String = {
        var systemInfo = utsname()
        uname(&systemInfo)
        let mirror = Mirror(reflecting: systemInfo.machine)
        let identifier = mirror.children.reduce("") { id, element in
            guard let value = element.value as? Int8, value != 0 else { return id }
            return id + String(UnicodeScalar(UInt8(value)))
        }
        return identifier.isEmpty ? "Unknown" : identifier
    }()
}
