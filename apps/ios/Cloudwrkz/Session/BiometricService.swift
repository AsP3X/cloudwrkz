//
//  BiometricService.swift
//  Cloudwrkz
//
//  Face ID / Touch ID via LocalAuthentication. Used for biometric app lock.
//

import Foundation
import LocalAuthentication

enum BiometricService {
    /// Whether the device supports biometrics and we can use them for app lock.
    static var isAvailable: Bool {
        let context = LAContext()
        var error: NSError?
        return context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    }

    /// Human‑readable biometric type for UI (e.g. "Face ID" or "Touch ID").
    static var biometricTypeName: String {
        let context = LAContext()
        switch context.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return "Biometrics"
        }
    }

    /// Evaluate biometrics. Must run on main thread to show system Face ID / Touch ID UI.
    /// - Returns: true if authenticated, false if failed or cancelled.
    @MainActor
    static func evaluate(reason: String = "Unlock Cloudwrkz") async -> Bool {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return false
        }
        do {
            return try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason)
        } catch {
            return false
        }
    }
}
