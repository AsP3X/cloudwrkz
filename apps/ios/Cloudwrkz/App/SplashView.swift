//
//  SplashView.swift
//  Cloudwrkz
//
//  Cloud + title at top; buttons at bottom, no card behind them.
//

import SwiftUI

struct SplashView: View {
    @State private var appeared = false
    var onLogin: () -> Void = {}
    var onRegister: () -> Void = {}

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // Title and cloud at top
                VStack(spacing: 16) {
                    Image(systemName: "cloud.fill")
                        .font(.system(size: 52, weight: .medium))
                        .foregroundStyle(CloudwrkzColors.textOnGradient)

                    Text("splash.app_name")
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(CloudwrkzColors.textOnGradient)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 60)
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 12)

                Spacer()

                // Buttons at bottom, no background panel
                VStack(spacing: 14) {
                    Button(action: onLogin) {
                        Text("splash.sign_in")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.textOnGradient)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                    }
                    .glassButtonPrimary()

                    Button(action: onRegister) {
                        Text("splash.create_account")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.primary400)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                    }
                    .glassButtonSecondary()
                }
                .padding(.horizontal, 32)
                .padding(.bottom, 48)
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 20)
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.5)) {
                appeared = true
            }
        }
    }
}

#Preview {
    SplashView()
}
