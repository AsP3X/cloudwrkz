//
//  RootView.swift
//  Cloudwrkz
//
//  Thin coordinator: composes AuthFlowController, SessionMonitor, ContentView, auth screens, and sheet/overlay presentation.
//

import SwiftUI
import UIKit

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.appState) private var appState

    @State private var authFlow = AuthFlowController()
    @State private var sessionMonitor = SessionMonitor()

    @State private var showServerConfig = false
    @State private var showHealthStatus = false
    @State private var pendingServerConfigAfterDismiss = false
    @State private var pendingHealthStatusAfterDismiss = false

    @State private var isAppLocked = false
    @State private var isEvaluatingBiometric = false

    private let pushPopAnimation = Animation.elasticSlide

    private func clearAllUserDataAndCache() {
        AuthTokenStorage.clear()
        UserProfileStorage.clear()
        AccountSettingsStorage.clear()
        LocalCacheService.clearAll()
    }

    var body: some View {
        ZStack {
            ContentView(
                isMainVisible: authFlow.screen == .main,
                showServerConfig: $showServerConfig,
                onLogout: {
                    clearAllUserDataAndCache()
                    withAnimation(pushPopAnimation) { authFlow.goForward(to: .splash) }
                }
            )
            .opacity(authFlow.screen == .main ? 1 : 0)

            switch authFlow.screen {
            case .splash:
                SplashView(
                    onLogin: { authFlow.goForward(to: .login) },
                    onRegister: { authFlow.goForward(to: .register) }
                )
                .transition(.asymmetric(
                    insertion: .move(edge: .leading),
                    removal: .move(edge: .leading)
                ))
            case .login:
                LoginView(
                    onSuccess: { authFlow.goForward(to: .main) },
                    onBack: { authFlow.goBack(to: .splash) }
                )
                .transition(.asymmetric(
                    insertion: authFlow.isGoingBack ? .move(edge: .leading) : .move(edge: .trailing),
                    removal: authFlow.isGoingBack ? .move(edge: .trailing) : .move(edge: .leading)
                ))
            case .register:
                RegisterView(
                    onSuccess: { authFlow.goForward(to: .login) },
                    onBack: { authFlow.goBack(to: .splash) }
                )
                .transition(.asymmetric(
                    insertion: authFlow.isGoingBack ? .move(edge: .leading) : .move(edge: .trailing),
                    removal: authFlow.isGoingBack ? .move(edge: .trailing) : .move(edge: .leading)
                ))
            case .main:
                EmptyView()
            }

            // Tenant status and gear over splash/login/register.
            VStack {
                HStack(spacing: 0) {
                    if authFlow.screen == .login || authFlow.screen == .register {
                        Color.clear
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                            .allowsHitTesting(false)
                    }
                    TenantStatusView(config: appState.config, onTap: { requestHealthStatus() })
                        .padding(.leading, 12)
                        .padding(.top, 12)
                    Spacer()
                    Button(action: { requestServerConfig() }) {
                        Image(systemName: "gearshape.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                            .frame(width: 44, height: 44)
                    }
                    .padding(.trailing, 12)
                    .padding(.top, 12)
                }
                Spacer()
            }
            .allowsHitTesting(authFlow.screen != .main)
            .opacity(authFlow.screen == .main ? 0 : 1)

            if authFlow.screen == .main, isAppLocked, !sessionMonitor.showSessionExpired {
                BiometricLockOverlayView(
                    onRetry: { await tryUnlockWithBiometric() },
                    isEvaluating: isEvaluatingBiometric
                )
                .transition(.opacity)
                .zIndex(1)
                .task { await tryUnlockWithBiometric() }
            }

            if sessionMonitor.showSessionExpired {
                SessionExpiredOverlayView {
                    sessionMonitor.dismissSessionExpiredOverlay()
                    withAnimation(pushPopAnimation) { authFlow.goForward(to: .splash) }
                }
                .transition(.opacity)
                .zIndex(2)
            }
        }
        .animation(pushPopAnimation, value: authFlow.screen)
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .background, authFlow.screen == .main, AccountSettingsStorage.biometricLockEnabled {
                isAppLocked = true
            }
            if newPhase == .active, authFlow.screen == .main {
                Task { _ = await AuthService.extendSession(config: appState.config) }
                sessionMonitor.validate(config: appState.config)
                sessionMonitor.startTimer(config: appState.config)
            }
            if newPhase == .background || newPhase == .inactive {
                sessionMonitor.stopTimer()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)) { _ in
            if authFlow.screen == .main, AccountSettingsStorage.biometricLockEnabled {
                isAppLocked = true
            }
        }
        .onChange(of: authFlow.screen) { _, newScreen in
            if newScreen != .main {
                isAppLocked = false
                sessionMonitor.stopTimer()
            } else {
                sessionMonitor.validate(config: appState.config)
                sessionMonitor.startTimer(config: appState.config)
            }
        }
        .onAppear {
            sessionMonitor.onSessionExpired = {
                clearAllUserDataAndCache()
                isAppLocked = false
            }
        }
        .sheet(isPresented: $showServerConfig, onDismiss: {
            if pendingHealthStatusAfterDismiss {
                pendingHealthStatusAfterDismiss = false
                showHealthStatus = true
            }
        }) {
            ServerConfigView(config: Binding(
                get: { appState.config },
                set: { appState.config = $0 }
            ))
        }
        .sheet(isPresented: $showHealthStatus, onDismiss: {
            if pendingServerConfigAfterDismiss {
                pendingServerConfigAfterDismiss = false
                showServerConfig = true
            }
        }) {
            ServerHealthStatusView(config: appState.config)
        }
    }

    private func requestServerConfig() {
        if showHealthStatus {
            pendingServerConfigAfterDismiss = true
            showHealthStatus = false
        } else {
            showServerConfig = true
        }
    }

    private func requestHealthStatus() {
        if showServerConfig {
            pendingHealthStatusAfterDismiss = true
            showServerConfig = false
        } else {
            showHealthStatus = true
        }
    }

    private func tryUnlockWithBiometric() async {
        guard AccountSettingsStorage.biometricLockEnabled, BiometricService.isAvailable else {
            await MainActor.run { isAppLocked = false }
            return
        }
        await MainActor.run { isEvaluatingBiometric = true }
        try? await Task.sleep(nanoseconds: 300_000_000)
        let success = await BiometricService.evaluate(reason: String(localized: "biometric.unlock_reason"))
        await MainActor.run {
            isEvaluatingBiometric = false
            if success { isAppLocked = false }
        }
    }
}

#Preview {
    RootView()
        .environment(\.appState, AppState())
}
