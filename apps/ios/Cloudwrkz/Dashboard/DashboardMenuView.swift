//
//  DashboardMenuView.swift
//  Cloudwrkz
//
//  Sheet menu styled like ServerConfigView. Liquid glass, same layout pattern.
//

import SwiftUI

struct DashboardMenuView: View {
    @Environment(\.dismiss) private var dismiss

    /// Called to close the menu (e.g. when used as a pull-up drawer). If not provided, uses Environment dismiss.
    var onDismiss: (() -> Void)? = nil

    /// Called when user taps "Server configuration" — caller should dismiss then present server config.
    var onOpenServerConfig: () -> Void = {}
    /// Called when user taps "Log out" — caller should dismiss then clear token and navigate to splash.
    var onLogout: (() -> Void)? = nil

    private func dismissMenu() {
        if let onDismiss = onDismiss {
            onDismiss()
        } else {
            dismiss()
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                background

                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        headerSection
                        menuSection
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            
        }
    }

    private var background: some View {
        LinearGradient(
            colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                Image(systemName: "line.3.horizontal.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text("dashboard.menu.title")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            Text("dashboard.menu.subtitle")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral400)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }

    private var menuSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(String(localized: "dashboard.menu.options"))

            VStack(spacing: 10) {
                menuRow(icon: "house.fill", title: String(localized: "dashboard.section.home"), subtitle: String(localized: "dashboard.menu.back_to_dashboard")) {
                    dismissMenu()
                }
                menuRow(icon: "gearshape.2.fill", title: String(localized: "account_settings.server_config"), subtitle: String(localized: "dashboard.menu.server_config_subtitle")) {
                    dismissMenu()
                    onOpenServerConfig()
                }
                if onLogout != nil {
                    menuRow(icon: "rectangle.portrait.and.arrow.right", title: String(localized: "profile.log_out"), subtitle: String(localized: "profile.log_out_subtitle"), isDestructive: true) {
                        dismissMenu()
                        onLogout?()
                    }
                }
            }
        }
    }

    private func menuRow(
        icon: String,
        title: String,
        subtitle: String,
        isDestructive: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Image(systemName: icon)
                    .font(.system(size: 22))
                    .foregroundStyle(isDestructive ? CloudwrkzColors.error500 : CloudwrkzColors.primary400)
                    .frame(width: 32, height: 32)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(isDestructive ? CloudwrkzColors.error500 : CloudwrkzColors.neutral100)
                    Text(subtitle)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral500)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            .padding(16)
            .glassCard(cornerRadius: 16)
        }
        .buttonStyle(.plain)
    }

    private func sectionHeader(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.8)
            .foregroundStyle(CloudwrkzColors.neutral500)
    }
}

#Preview {
    DashboardMenuView()
}
