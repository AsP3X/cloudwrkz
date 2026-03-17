//
//  SessionExpiredOverlayView.swift
//  Cloudwrkz
//
//  Full-screen overlay when the session has been revoked/expired remotely.
//  Liquid glass, gradient. Single CTA to return to sign-in.
//

import SwiftUI

struct SessionExpiredOverlayView: View {
    var onContinue: () -> Void

    @State private var appeared = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                VStack(spacing: 28) {
                    // Icon ring with subtle red glow
                    ZStack {
                        Circle()
                            .fill(CloudwrkzColors.error500.opacity(0.08))
                            .frame(width: 96, height: 96)

                        Circle()
                            .stroke(CloudwrkzColors.error500.opacity(0.15), lineWidth: 1.5)
                            .frame(width: 96, height: 96)

                        Image(systemName: "person.badge.clock.fill")
                            .font(.system(size: 42, weight: .medium))
                            .foregroundStyle(
                                .linearGradient(
                                    colors: [CloudwrkzColors.error500, CloudwrkzColors.warning500],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                    }
                    .scaleEffect(appeared ? 1 : 0.6)
                    .opacity(appeared ? 1 : 0)

                    VStack(spacing: 10) {
                        Text("session.session_ended")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundStyle(CloudwrkzColors.neutral100)

                        Text("session.ended_message")
                            .font(.system(size: 15, weight: .regular))
                            .foregroundStyle(CloudwrkzColors.neutral400)
                            .multilineTextAlignment(.center)
                            .lineSpacing(3)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 4)
                    .opacity(appeared ? 1 : 0)
                    .offset(y: appeared ? 0 : 8)

                    // Divider
                    Rectangle()
                        .fill(CloudwrkzColors.divider)
                        .frame(height: 1)
                        .padding(.horizontal, 8)
                        .opacity(appeared ? 1 : 0)

                    Button(action: onContinue) {
                        HStack(spacing: 10) {
                            Image(systemName: "arrow.right.circle.fill")
                                .font(.system(size: 18, weight: .medium))
                            Text("session.back_to_sign_in")
                                .font(.system(size: 17, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .glassButtonPrimary(cornerRadius: 14)
                    }
                    .opacity(appeared ? 1 : 0)
                    .offset(y: appeared ? 0 : 12)
                }
                .padding(32)
                .glassPanel(cornerRadius: 28, tint: CloudwrkzColors.primary500, tintOpacity: 0.03)
                .padding(.horizontal, 24)

                Spacer()
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.45)) {
                appeared = true
            }
        }
        .accessibilityLabel("Session ended")
        .accessibilityHint("Tap Back to Sign In to return to the login screen")
    }
}

#Preview {
    SessionExpiredOverlayView(onContinue: {})
}
