//
//  ServerHealthStatusView.swift
//  Cloudwrkz
//
//  Enterprise server health status sheet. Fancy, clean, modern. Shows full /api/health data.
//

import SwiftUI

struct ServerHealthStatusView: View {
    let config: ServerConfig
    @Environment(\.dismiss) private var dismiss

    @State private var health: ServerHealthResponse?
    @State private var isLoading = true
    @State private var fetchError: String?
    @State private var lastFetched: Date?

    private var overallStatus: String {
        health?.status?.lowercased() ?? "unreachable"
    }

    private var statusColor: Color {
        switch overallStatus {
        case "healthy": return CloudwrkzColors.success500
        case "degraded": return CloudwrkzColors.warning500
        default: return CloudwrkzColors.error500
        }
    }

    private var statusIcon: String {
        switch overallStatus {
        case "healthy": return "checkmark.circle.fill"
        case "degraded": return "exclamationmark.triangle.fill"
        default: return "xmark.circle.fill"
        }
    }

    private var statusLabel: String {
        switch overallStatus {
        case "healthy": return "Healthy"
        case "degraded": return "Degraded"
        default: return fetchError != nil ? "Unreachable" : "Unhealthy"
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                background

                if isLoading && health == nil {
                    VStack(spacing: 16) {
CloudwrkzSpinner(tint: CloudwrkzColors.primary400)
                        .scaleEffect(1.2)
                        Text("Checking server…")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(CloudwrkzColors.neutral200)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            headerSection
                            overallStatusCard
                            if let db = health?.services?.database {
                                databaseSection(db)
                            }
                            if let err = fetchError {
                                errorSection(err)
                            }
                            if let url = config.baseURL?.absoluteString {
                                endpointSection(url)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 8)
                        .padding(.bottom, 32)
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Refresh") {
                        fetchHealth()
                    }
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.primary400)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
        }
        .onAppear { fetchHealth() }
    }

    // MARK: - Background

    private var background: some View {
        LinearGradient(
            colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                Image(systemName: "heart.text.square.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text("Service health")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            Text("Real-time server and database status")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral200)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }

    // MARK: - Overall status card

    private var overallStatusCard: some View {
        HStack(spacing: 16) {
            Image(systemName: statusIcon)
                .font(.system(size: 36))
                .foregroundStyle(statusColor)

            VStack(alignment: .leading, spacing: 4) {
                Text(statusLabel)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                if let ts = lastFetched ?? healthTimestamp {
                    Text("Updated \(formatted(ts))")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral200)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // Status pill – high contrast
            Text(overallStatus.uppercased())
                .font(.system(size: 11, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(CloudwrkzColors.neutral100)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(statusColor.opacity(0.35), in: Capsule())
                .overlay(Capsule().stroke(statusColor.opacity(0.6), lineWidth: 1))
        }
        .padding(20)
        .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.neutral800, tintOpacity: 0.4)
    }

    private var healthTimestamp: Date? {
        guard let s = health?.timestamp ?? health?.services?.database?.lastChecked else { return nil }
        return ISO8601DateFormatter().date(from: s) ?? ISO8601DateFormatter().date(from: s.replacingOccurrences(of: "Z", with: "+00:00"))
    }

    private func formatted(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    // MARK: - Database section

    private func databaseSection(_ db: DatabaseHealth) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Database")

            VStack(spacing: 0) {
                metricRow(label: "Status", value: (db.status ?? "—").capitalized, valueColor: statusColor(for: db.status))
                metricRowDivider()
                metricRow(label: "Connected", value: (db.connected == true) ? "Yes" : "No", valueColor: (db.connected == true) ? CloudwrkzColors.success500 : CloudwrkzColors.error500)
                if let ms = db.responseTime, ms >= 0 {
                    metricRowDivider()
                    metricRow(label: "Response time", value: String(format: "%.0f ms", ms), valueColor: responseTimeColor(ms))
                }
                if let active = db.activeConnections, let max = db.maxConnections {
                    metricRowDivider()
                    metricRow(label: "Connections", value: "\(active) / \(max)", valueColor: nil)
                }
                if let dropped = db.droppedConnections, dropped > 0 {
                    metricRowDivider()
                    metricRow(label: "Dropped", value: "\(dropped)", valueColor: CloudwrkzColors.warning500)
                }
                if let size = db.databaseSize, !size.isEmpty {
                    metricRowDivider()
                    metricRow(label: "Database size", value: size, valueColor: nil)
                }
                if let err = db.error, !err.isEmpty {
                    metricRowDivider()
                    metricRow(label: "Error", value: err, valueColor: CloudwrkzColors.error500)
                }
            }
            .padding(20)
            .background(CloudwrkzColors.neutral900.opacity(0.7))
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.neutral800, tintOpacity: 0.25)
        }
    }

    private func statusColor(for status: String?) -> Color {
        switch status?.lowercased() {
        case "healthy": return CloudwrkzColors.success500
        case "degraded": return CloudwrkzColors.warning500
        default: return CloudwrkzColors.error500
        }
    }

    private func responseTimeColor(_ ms: Double) -> Color {
        if ms > 1000 { return CloudwrkzColors.error500 }
        if ms > 500 { return CloudwrkzColors.warning500 }
        return CloudwrkzColors.success500
    }

    private func metricRow(label: String, value: String, valueColor: Color?) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral200)
            Spacer()
            Text(value)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(valueColor ?? CloudwrkzColors.neutral100)
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 10)
    }

    private func metricRowDivider() -> some View {
        Divider()
            .background(CloudwrkzColors.neutral700)
            .padding(.vertical, 2)
    }

    private func errorSection(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Error")
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.octagon.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(CloudwrkzColors.error500)
                Text(message)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral200)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(CloudwrkzColors.neutral900.opacity(0.7))
            .glassPanel(cornerRadius: 16, tint: CloudwrkzColors.error500, tintOpacity: 0.12)
        }
    }

    private func endpointSection(_ url: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Endpoint")
            HStack(spacing: 10) {
                Image(systemName: "link")
                    .font(.system(size: 14))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text(url)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(CloudwrkzColors.neutral900.opacity(0.5))
            .glassField(cornerRadius: 12)
        }
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.8)
            .foregroundStyle(CloudwrkzColors.neutral200)
    }

    // MARK: - Fetch

    private func fetchHealth() {
        isLoading = true
        fetchError = nil
        Task { @MainActor in
            if let response = await ServerHealthDetail.fetch(config: config) {
                health = response
                lastFetched = Date()
                fetchError = nil
            } else {
                health = nil
                fetchError = config.baseURL == nil ? "No server URL configured" : "Could not reach server"
            }
            isLoading = false
        }
    }
}

#Preview {
    ServerHealthStatusView(config: AppState().config)
}
