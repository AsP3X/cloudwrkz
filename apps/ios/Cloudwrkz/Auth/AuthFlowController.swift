//
//  AuthFlowController.swift
//  Cloudwrkz
//
//  Owns auth flow: current screen and forward/back navigation. Used by RootView to show Splash/Login/Register/Main.
//

import SwiftUI

enum AuthScreen {
    case splash
    case login
    case register
    case main
}

@Observable
final class AuthFlowController {
    var screen: AuthScreen
    /// Used for WhatsApp/Telegram-style push (forward) vs pop (back) transitions.
    var isGoingBack: Bool = false

    private let pushPopAnimation = Animation.elasticSlide

    init(initialScreen: AuthScreen? = nil) {
        self.screen = initialScreen ?? (AuthTokenStorage.getToken() != nil ? .main : .splash)
    }

    func goForward(to newScreen: AuthScreen) {
        isGoingBack = false
        withAnimation(pushPopAnimation) { screen = newScreen }
    }

    func goBack(to newScreen: AuthScreen) {
        isGoingBack = true
        DispatchQueue.main.async {
            withAnimation(self.pushPopAnimation) { self.screen = newScreen }
        }
    }
}
