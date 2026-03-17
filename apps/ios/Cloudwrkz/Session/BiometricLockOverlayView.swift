//
//  BiometricLockOverlayView.swift
//  Cloudwrkz
//
//  Full-screen overlay when app is locked. Liquid glass, gradient. Prompts for Face ID / Touch ID.
//

import SwiftUI

struct BiometricLockOverlayView: View {
    var onRetry: () async -> Void
    var isEvaluating: Bool = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 24) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(CloudwrkzColors.primary400)

                Text("biometric.app_locked")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)

                Text(String(format: String(localized: "biometric.use_to_unlock"), BiometricService.biometricTypeName))
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral400)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                if isEvaluating {
                    CloudwrkzSpinner(tint: CloudwrkzColors.primary400)
                        .scaleEffect(1.2)
                        .padding(.top, 8)
                } else {
                    Button {
                        Task { await onRetry() }
                    } label: {
                        Text(String(format: String(localized: "biometric.unlock_with"), BiometricService.biometricTypeName))
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .glassButtonPrimary(cornerRadius: 14)
                    }
                    .padding(.top, 8)
                    .padding(.horizontal, 40)
                    .disabled(isEvaluating)
                }
            }
            .padding(32)
            .glassPanel(cornerRadius: 24, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
            .padding(.horizontal, 24)
        }
        .accessibilityLabel("App locked")
        .accessibilityHint("Use \(BiometricService.biometricTypeName) to unlock")
    }
}

#Preview {
    BiometricLockOverlayView(onRetry: {}, isEvaluating: false)
}
