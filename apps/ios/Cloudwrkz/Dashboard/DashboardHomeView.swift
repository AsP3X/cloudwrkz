//
//  DashboardHomeView.swift
//  Cloudwrkz
//
//  Default dashboard detail: welcome and quick access to sections.
//

import SwiftUI

// Human: Home is the neutral landing: welcome copy plus tiles into enabled modules so new users aren’t dropped into an empty list.
// Agent: DashboardHomeView; READS UserProfileStorage allowed modules; noModulesWarning; onSelectSection DashboardSection; quickAccessSection.

struct DashboardHomeView: View {
    var onSelectSection: ((DashboardSection) -> Void)?

    // Human: Gradient matches the rest of the shell so “home” doesn’t look like a separate lite mode compared to feature tabs.
    // Agent: ZStack gradient ScrollView welcomeSection quickAccessSection; conditional noModulesAvailable.

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            if noModulesAvailable {
                noModulesWarning
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        welcomeSection
                        quickAccessSection
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 20)
                    .padding(.bottom, 32)
                }
            }
        }
        .toolbarBackground(.hidden, for: .navigationBar)
    }

    private var noModulesAvailable: Bool {
        guard let ids = UserProfileStorage.allowedModuleIds else { return false }
        return ids.isEmpty
    }

    /// Centered full-screen warning, same style as server/load error view in TicketsOverviewView etc.
    private var noModulesWarning: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 44))
                .foregroundStyle(CloudwrkzColors.warning500)
            Text("dashboard.no_modules.title")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral100)
            Text("dashboard.no_modules.message")
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral400)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var welcomeSection: some View {
        Text("dashboard.welcome_back")
            .font(.system(size: 15, weight: .regular))
            .foregroundStyle(CloudwrkzColors.neutral400)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var quickAccessSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("dashboard.quick_access")
                .font(.system(size: 11, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(CloudwrkzColors.neutral500)

            VStack(spacing: 10) {
                ForEach(DashboardSection.visibleMenuSections(allowedModuleIds: UserProfileStorage.allowedModuleIds)) { section in
                    Button {
                        onSelectSection?(section)
                    } label: {
                        HStack(spacing: 16) {
                            Image(systemName: section.iconName)
                                .font(.system(size: 20))
                                .foregroundStyle(CloudwrkzColors.primary400)
                                .frame(width: 32, height: 32)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(section.title)
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(CloudwrkzColors.neutral100)
                                Text(section.subtitle)
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
            }
        }
    }

}

#Preview {
    NavigationStack {
        DashboardHomeView()
    }
}
