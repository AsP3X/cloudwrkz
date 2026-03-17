//
//  SessionExpiredNotifier.swift
//  Cloudwrkz
//
//  Centralized session expiration handler. When any API call receives a 401 (session revoked/expired),
//  this broadcasts a notification so RootView can trigger automatic logout.
//  Debounced to avoid multiple rapid-fire logouts from concurrent failing requests.
//

import Foundation

extension Notification.Name {
    static let sessionExpired = Notification.Name("com.cloudwrkz.sessionExpired")
}

enum SessionExpiredNotifier {
    private static let debounceInterval: TimeInterval = 2
    private static var lastPosted: Date?

    /// Call from any service when a 401 Unauthorized response is received.
    /// Posts `.sessionExpired` on the main thread. Debounced so concurrent 401s
    /// only trigger a single logout.
    static func notify() {
        let now = Date()
        if let last = lastPosted, now.timeIntervalSince(last) < debounceInterval {
            return
        }
        lastPosted = now
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .sessionExpired, object: nil)
        }
    }
}
