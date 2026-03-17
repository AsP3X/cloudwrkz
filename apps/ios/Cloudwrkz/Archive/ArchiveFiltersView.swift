//
//  ArchiveFiltersView.swift
//  Cloudwrkz
//
//  Filter sheet for archive list: type, sort, archived date range.
//  Matches TodoFiltersView / TicketFiltersView style.
//

import SwiftUI

struct ArchiveFiltersView: View {
    @Binding var filters: ArchiveFilters
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
                Text("Filter archive")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            Text("Narrow by search, type, sort order, and when items were archived.")
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
                        searchSection
                        typeSection
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

    private var typeSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Type")
            VStack(spacing: 10) {
                ForEach(ArchiveTypeFilter.allCases) { option in
                    filterRow(title: option.rawValue, isSelected: filters.type == option) {
                        filters.type = option
                    }
                }
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    private var sortSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Sort")
            VStack(spacing: 10) {
                ForEach(ArchiveSortOption.allCases) { option in
                    filterRow(title: option.displayName, isSelected: filters.sort == option) {
                        filters.sort = option
                    }
                }
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    private var searchSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Search")
            TextField("Search in titles…", text: $filters.searchQuery)
                .textFieldStyle(.plain)
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral100)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(CloudwrkzColors.neutral900.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                )
                .autocorrectionDisabled()
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    private var dateSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Archived date range (optional)")
            VStack(alignment: .leading, spacing: 16) {
                dateRow(label: "From", date: $filters.archivedFrom)
                dateRow(label: "To", date: $filters.archivedTo)
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    private var resetSection: some View {
        Button {
            filters = ArchiveFilters()
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

    private func dateRow(label: String, date: Binding<Date?>) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Text(label)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral400)
                    .frame(width: 50, alignment: .leading)
                if date.wrappedValue != nil {
                    DatePicker("", selection: Binding(
                        get: { date.wrappedValue ?? Date() },
                        set: { date.wrappedValue = $0 }
                    ), displayedComponents: .date)
                    .datePickerStyle(.compact)
                    .labelsHidden()
                    .tint(CloudwrkzColors.primary400)
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
    }

    private func filterRow(title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Text(title)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Spacer(minLength: 8)
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    ArchiveFiltersView(filters: .constant(ArchiveFilters()))
}
