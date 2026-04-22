//
//  CloudwrkzApp.swift
//  Cloudwrkz
//
//  Created by Niklas Vorberg on 13.02.26.
//

import SwiftUI

// Human: App entry wires global appearance, language defaults, and injects shared `AppState` so every scene reads the same server configuration.
// Agent: @main App; @AppStorage appearance; @State AppState; init CALLS applyDisplayLanguage; body WindowGroup RootView environment appState preferredColorScheme.

@main
struct CloudwrkzApp: App {
    @AppStorage("cloudwrkz.account.appearance") private var appearance: String = "system"
    @State private var appState = AppState()

    init() {
        applyDisplayLanguage()
    }

    // Human: Account language choice must apply before first view layout so localized strings resolve consistently with Settings.
    // Agent: READ AccountSettingsStorage.displayLanguage; REMOVE or SET AppleLanguages UserDefaults.

    private func applyDisplayLanguage() {
        let preferred = AccountSettingsStorage.displayLanguage
        if preferred == "system" || preferred.isEmpty {
            UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        } else {
            UserDefaults.standard.set([preferred], forKey: "AppleLanguages")
        }
    }

    // Human: Maps persisted appearance string to SwiftUI color scheme; `nil` follows system dark/light automatically.
    // Agent: SWITCH appearance light|dark|default -> ColorScheme? optional.

    private var resolvedColorScheme: ColorScheme? {
        switch appearance {
        case "light": return .light
        case "dark": return .dark
        default: return nil
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(\.appState, appState)
                .preferredColorScheme(resolvedColorScheme)
        }
    }
}
