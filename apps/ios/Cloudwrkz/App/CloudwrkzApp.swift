//
//  CloudwrkzApp.swift
//  Cloudwrkz
//
//  Created by Niklas Vorberg on 13.02.26.
//

import SwiftUI

@main
struct CloudwrkzApp: App {
    @AppStorage("cloudwrkz.account.appearance") private var appearance: String = "system"
    @State private var appState = AppState()

    init() {
        applyDisplayLanguage()
    }

    private func applyDisplayLanguage() {
        let preferred = AccountSettingsStorage.displayLanguage
        if preferred == "system" || preferred.isEmpty {
            UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        } else {
            UserDefaults.standard.set([preferred], forKey: "AppleLanguages")
        }
    }

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
