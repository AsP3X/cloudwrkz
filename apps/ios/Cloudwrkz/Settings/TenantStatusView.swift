//
//  TenantStatusView.swift
//  Cloudwrkz
//
//  Small status element showing whether the configured tenant is healthy and reachable.
//

import SwiftUI

struct TenantStatusView: View {
    let config: ServerConfig
    var onTap: (() -> Void)? = nil

    @State private var result: TenantHealthResult = .checking

    var body: some View {
        let content = HStack(spacing: 6) {
            statusIcon
            Text(statusLabel)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(statusColor)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .glassPanel(cornerRadius: 20, tint: statusColor, tintOpacity: 0.12)

        Group {
            if let onTap {
                Button(action: onTap) {
                    content
                }
                .buttonStyle(.plain)
            } else {
                content
            }
        }
        .onAppear { performCheck() }
        .onChange(of: config) { _, _ in performCheck() }
    }

    private var statusIcon: some View {
        Group {
            switch result {
            case .checking:
CloudwrkzSpinner(tint: CloudwrkzColors.neutral400)
                .scaleEffect(0.7)
            case .healthy:
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(CloudwrkzColors.primary400)
            case .degraded:
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(CloudwrkzColors.primary400)
            case .unreachable:
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(CloudwrkzColors.error500)
            }
        }
    }

    private var statusLabel: String {
        switch result {
        case .checking: return String(localized: "tenant_status.checking")
        case .healthy: return String(localized: "tenant_status.healthy")
        case .degraded: return String(localized: "tenant_status.degraded")
        case .unreachable: return String(localized: "tenant_status.unreachable")
        }
    }

    private var statusColor: Color {
        switch result {
        case .checking: return CloudwrkzColors.neutral400
        case .healthy, .degraded: return CloudwrkzColors.primary400
        case .unreachable: return CloudwrkzColors.error500
        }
    }

    private func performCheck() {
        Task { @MainActor in
            result = .checking
            let r = await TenantHealthChecker.check(config: config)
            result = r
        }
    }
}

#Preview {
    ZStack {
        LinearGradient(
            colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
        TenantStatusView(config: AppState().config)
    }
}
