//
//  SessionMonitor.swift
//  Cloudwrkz
//
//  Session validation and timer. Listens for .sessionExpired; exposes showSessionExpired and onSessionExpired callback.
//

import Foundation
import SwiftUI

@Observable
final class SessionMonitor {
    /// When true, show session-expired overlay. Set when .sessionExpired notification is received.
    var showSessionExpired: Bool = false

    private let sessionCheckInterval: TimeInterval = 30
    private var sessionCheckTimer: Timer?
    private var sessionExpiredObserver: NSObjectProtocol?

    /// Called when session expired (after clearing overlay). RootView uses this to clear data and navigate to splash.
    var onSessionExpired: (() -> Void)?

    init() {
        sessionExpiredObserver = NotificationCenter.default.addObserver(
            forName: .sessionExpired,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.handleSessionExpired()
        }
    }

    deinit {
        stopTimer()
        if let observer = sessionExpiredObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    /// Validate session (call /me). If server returns 401, SessionExpiredNotifier posts and we show overlay.
    func validate(config: ServerConfig) {
        guard AuthTokenStorage.getToken() != nil else { return }
        Task {
            _ = await AuthService.fetchCurrentUser(config: config)
        }
    }

    func startTimer(config: ServerConfig) {
        stopTimer()
        let timer = Timer(timeInterval: sessionCheckInterval, repeats: true) { [weak self] _ in
            self?.validate(config: config)
        }
        RunLoop.main.add(timer, forMode: .common)
        sessionCheckTimer = timer
    }

    func stopTimer() {
        sessionCheckTimer?.invalidate()
        sessionCheckTimer = nil
    }

    /// Call when user dismisses the session-expired overlay (e.g. tap "OK").
    func dismissSessionExpiredOverlay() {
        showSessionExpired = false
    }

    private func handleSessionExpired() {
        stopTimer()
        onSessionExpired?()
        showSessionExpired = true
    }
}
