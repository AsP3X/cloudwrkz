//
//  TicketFiltersView.swift
//  Cloudwrkz
//
//  Filter sheet for tickets list. Enterprise style, matches ServerConfigView.
//

import SwiftUI

struct TicketFiltersView: View {
    @Binding var filters: TicketFilters
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
                Text("filter_tickets.title")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            Text("filter_tickets.subtitle")
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
                    Button("common.done") {
                        dismiss()
                    }
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
        }
    }

    private var statusSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(String(localized: "common.status"))
            VStack(spacing: 10) {
                ForEach(TicketFilters.TicketStatusFilter.allCases) { option in
                    filterRow(
                        title: option.displayName,
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

    private var sortSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(String(localized: "filter_todos.sort_by"))
            VStack(spacing: 10) {
                ForEach(TicketFilters.TicketSortOption.allCases) { option in
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

    private var dateSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(String(localized: "filter_tickets.date_range"))
            VStack(alignment: .leading, spacing: 16) {
                dateRow(label: String(localized: "filter_tickets.created_from"), date: $filters.createdFrom)
                dateRow(label: String(localized: "filter_tickets.created_to"), date: $filters.createdTo)
                dateRow(label: String(localized: "filter_tickets.updated_from"), date: $filters.updatedFrom)
                dateRow(label: String(localized: "filter_tickets.updated_to"), date: $filters.updatedTo)
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    private func filterRow(title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 16) {
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
                .frame(width: 110, alignment: .leading)
            if let d = date.wrappedValue {
                Text(formatted(d))
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Spacer()
                Button("filter_tickets.clear") {
                    date.wrappedValue = nil
                }
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(CloudwrkzColors.primary400)
            } else {
                Text("filter_tickets.not_set")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
                Spacer()
                Button("filter_tickets.set") {
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

    private func formatted(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateStyle = .medium
        return f.string(from: d)
    }
}

#Preview {
    TicketFiltersView(filters: .constant(TicketFilters()))
}
