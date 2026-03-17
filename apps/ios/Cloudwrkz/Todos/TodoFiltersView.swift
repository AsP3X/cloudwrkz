//
//  TodoFiltersView.swift
//  Cloudwrkz
//
//  Filter sheet for todos list. Enterprise style, matches TicketFiltersView.
//

import SwiftUI

struct TodoFiltersView: View {
    @Binding var filters: TodoFilters
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
                Text("filter_todos.title")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            Text("filter_todos.subtitle")
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
                        scopeSection
                        statusSection
                        prioritySection
                        sortSection
                        archiveSection
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

    private var scopeSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(String(localized: "filter_todos.scope"))
            VStack(spacing: 10) {
                filterRow(
                    title: String(localized: "filter_todos.top_level_only"),
                    isSelected: !filters.includeSubtodos
                ) {
                    filters.includeSubtodos = false
                }
                filterRow(
                    title: String(localized: "filter_todos.include_subtodos"),
                    isSelected: filters.includeSubtodos
                ) {
                    filters.includeSubtodos = true
                }
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    private var statusSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(String(localized: "common.status"))
            VStack(spacing: 10) {
                ForEach(TodoFilters.TodoStatusFilter.allCases) { option in
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

    private var prioritySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(String(localized: "common.priority"))
            VStack(spacing: 10) {
                ForEach(TodoFilters.TodoPriorityFilter.allCases) { option in
                    filterRow(
                        title: option.displayName,
                        isSelected: filters.priority == option
                    ) {
                        filters.priority = option
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
                ForEach(TodoFilters.TodoSortOption.allCases) { option in
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

    private var archiveSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(String(localized: "filter_todos.show"))
            VStack(spacing: 10) {
                ForEach(TodoFilters.TodoArchiveFilter.allCases) { option in
                    filterRow(
                        title: option.displayName,
                        isSelected: filters.archive == option
                    ) {
                        filters.archive = option
                    }
                }
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
}

#Preview {
    TodoFiltersView(filters: .constant(TodoFilters()))
}
