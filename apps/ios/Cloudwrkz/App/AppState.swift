//
//  AppState.swift
//  Cloudwrkz
//
//  Shared app state: single source of truth for ServerConfig. Injected via environment.
//

import SwiftUI

@Observable
final class AppState {
    var config: ServerConfig

    init(config: ServerConfig = ServerConfig.load()) {
        self.config = config
    }

    /// Reload config from UserDefaults (e.g. after another process changed it). Rare.
    func reloadFromStorage() {
        config = ServerConfig.load()
    }
}

// MARK: - Environment

private struct AppStateKey: EnvironmentKey {
    static let defaultValue: AppState = AppState()
}

extension EnvironmentValues {
    var appState: AppState {
        get { self[AppStateKey.self] }
        set { self[AppStateKey.self] = newValue }
    }
}
