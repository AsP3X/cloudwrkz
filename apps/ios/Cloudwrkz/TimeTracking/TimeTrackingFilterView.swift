//
//  TimeTrackingFilterView.swift
//  Cloudwrkz
//
//  Filter sheet for time tracking list. Enterprise liquid glass design.
//  Matches TicketFiltersView pattern with status, sort, date range.
//

import SwiftUI

struct TimeTrackingFilterView: View {
    @Binding var filters: TimeTrackingFilters
    @Environment(\.dismiss) private var dismiss

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
                Image(systemName: "line.3.horizontal.decrease.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text("Filter time entries")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            Text("Narrow the list by status, sort order, and date range.")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral400)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }

    private func sectionHeader(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.8)
            .foregroundStyle(CloudwrkzColors.neutral500)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                background
                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        headerSection
                        statusSection
                        sortSection
                        dateSection
                        resetSection
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
        }
    }

    // MARK: - Status section

    private var statusSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Status")
            VStack(spacing: 10) {
                ForEach(TimeTrackingFilters.TimeTrackingStatusFilter.allCases) { option in
                    filterRow(
                        title: option.displayName,
                        icon: statusIcon(option),
                        iconColor: statusColor(option),
                        isSelected: filters.status == option
                    ) {
                        filters.status = option
                    }
                }
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    // MARK: - Sort section

    private var sortSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Sort by")
            VStack(spacing: 10) {
                ForEach(TimeTrackingFilters.TimeTrackingSortOption.allCases) { option in
                    filterRow(
                        title: option.displayName,
                        isSelected: filters.sort == option
                    ) {
                        filters.sort = option
                    }
                }
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    // MARK: - Date section

    private var dateSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Date range (optional)")
            VStack(alignment: .leading, spacing: 16) {
                dateRow(label: "From", date: $filters.dateFrom)
                dateRow(label: "To", date: $filters.dateTo)
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    // MARK: - Reset section

    private var resetSection: some View {
        Button {
            filters = TimeTrackingFilters()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "arrow.counterclockwise")
                    .font(.system(size: 14))
                Text("Reset all filters")
                    .font(.system(size: 15, weight: .semibold))
            }
            .foregroundStyle(CloudwrkzColors.neutral400)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .glassButtonSecondary()
        }
    }

    // MARK: - Row views

    private func filterRow(title: String, icon: String? = nil, iconColor: Color? = nil, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                if let icon = icon, let color = iconColor {
                    Image(systemName: icon)
                        .font(.system(size: 14))
                        .foregroundStyle(color)
                        .frame(width: 20)
                }
                Text(title)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? CloudwrkzColors.glassFillHighlight : CloudwrkzColors.glassFillSubtle)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(
                                isSelected ? CloudwrkzColors.primary400.opacity(0.5) : CloudwrkzColors.glassStrokeSubtle,
                                lineWidth: isSelected ? 1.5 : 1
                            )
                    )
            )
        }
        .buttonStyle(.plain)
    }

    private func dateRow(label: String, date: Binding<Date?>) -> some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral400)
                .frame(width: 50, alignment: .leading)
            if let d = date.wrappedValue {
                Text(formatted(d))
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Spacer()
                Button("Clear") {
                    date.wrappedValue = nil
                }
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(CloudwrkzColors.primary400)
            } else {
                Text("Not set")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
                Spacer()
                Button("Set") {
                    date.wrappedValue = Date()
                }
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(CloudwrkzColors.primary400)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(CloudwrkzColors.neutral900.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
        )
    }

    // MARK: - Helpers

    private func statusIcon(_ status: TimeTrackingFilters.TimeTrackingStatusFilter) -> String {
        switch status {
        case .all: return "circle.grid.3x3.fill"
        case .running: return "play.circle.fill"
        case .paused: return "pause.circle.fill"
        case .stopped: return "stop.circle.fill"
        case .completed: return "checkmark.circle.fill"
        case .active: return "bolt.circle.fill"
        }
    }

    private func statusColor(_ status: TimeTrackingFilters.TimeTrackingStatusFilter) -> Color {
        switch status {
        case .all: return CloudwrkzColors.neutral400
        case .running: return CloudwrkzColors.success500
        case .paused: return CloudwrkzColors.warning500
        case .stopped: return CloudwrkzColors.neutral400
        case .completed: return CloudwrkzColors.primary400
        case .active: return CloudwrkzColors.success400
        }
    }

    private func formatted(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateStyle = .medium
        return f.string(from: d)
    }
}

#Preview {
    TimeTrackingFilterView(filters: .constant(TimeTrackingFilters()))
}
