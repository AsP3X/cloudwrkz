//
//  DashboardSectionPlaceholderView.swift
//  Cloudwrkz
//
//  Placeholder content for Tickets, ToDo, Links, etc. until feature views exist.
//

import SwiftUI

struct DashboardSectionPlaceholderView: View {
    let section: DashboardSection

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 20) {
                Image(systemName: section.iconName)
                    .font(.system(size: 48))
                    .foregroundStyle(CloudwrkzColors.primary400.opacity(0.8))

                Text(section.title)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)

                Text(section.subtitle)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
                    .multilineTextAlignment(.center)

                Text("Coming soon")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral500)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(CloudwrkzColors.neutral800.opacity(0.6), in: Capsule())
                    .padding(.top, 8)
            }
            .padding(32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .toolbarBackground(.hidden, for: .navigationBar)
    }
}

#Preview {
    NavigationStack {
        DashboardSectionPlaceholderView(section: .tickets)
    }
}
