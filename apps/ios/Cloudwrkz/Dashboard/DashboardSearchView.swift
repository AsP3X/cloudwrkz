//
//  DashboardSearchView.swift
//  Cloudwrkz
//
//  Enterprise global search: glass panels, refined typography, fuzzy search API.
//

import SwiftUI

struct DashboardSearchView: View {
    @Environment(\.appState) private var appState
    var onDismiss: () -> Void
    /// Called when user taps a result; parent should dismiss and then open the detail (in-app or Safari).
    var onSelectResult: ((SearchResult) -> Void)?

    @State private var query = ""
    @State private var results: [SearchResult] = []
    @State private var total = 0
    @State private var isLoading = false
    @State private var isLoadingMore = false
    @State private var searchTask: Task<Void, Never>?
    @FocusState private var isFieldFocused: Bool

    private let minQueryLength = 2
    private let debounceInterval: UInt64 = 300_000_000

    /// ~6 cards fit on screen; initial fetch loads double that.
    private let initialPageSize = 12
    /// Subsequent pages loaded on scroll.
    private let pageSize = 12

    private var hasMore: Bool {
        if SearchService.isEnhancedSearch(query: query.trimmingCharacters(in: .whitespaces)) {
            return false
        }
        return results.count < total
    }

    var body: some View {
        ZStack {
            background
            VStack(spacing: 0) {
                header
                searchBar
                resultsContent
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            isFieldFocused = false
        }
        .onAppear {
            isFieldFocused = true
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

    private var header: some View {
        HStack(alignment: .center, spacing: 0) {
            Button {
                onDismiss()
            } label: {
                Text("common.cancel")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.primary400)
            }

            Spacer(minLength: 0)

            VStack(spacing: 2) {
                Text("search.title")
                    .font(.system(size: 20, weight: .bold))
                    .tracking(-0.3)
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Text("search.subtitle")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }

            Spacer(minLength: 0)

            Color.clear
                .frame(width: 60, height: 44)
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 20)
    }

    private var searchBar: some View {
        HStack(spacing: 14) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral500)

            TextField("", text: $query, prompt: Text("search.placeholder").foregroundStyle(CloudwrkzColors.neutral500))
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral100)
                .focused($isFieldFocused)
                .onChange(of: query) { _, newValue in
                    runSearchDebounced(query: newValue)
                }

            if !query.isEmpty {
                Button {
                    query = ""
                    results = []
                    total = 0
                    isLoadingMore = false
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 20))
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(CloudwrkzColors.neutral500)
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .glassField(cornerRadius: 16)
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
    }

    private var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespaces)
    }

    private var canRunSearch: Bool {
        let t = trimmedQuery
        if t.isEmpty { return false }
        if SearchService.isEnhancedSearch(query: t) { return t.count > 1 }
        return t.count >= minQueryLength
    }

    @ViewBuilder
    private var resultsContent: some View {
        if !canRunSearch {
            emptyState(
                icon: "magnifyingglass",
                title: "Start typing to search",
                subtitle: SearchService.isEnhancedSearch(query: trimmedQuery)
                    ? String(localized: "search.enhanced_hint")
                    : "Find tickets, tasks, users, links and more across your workspace."
            )
        } else if isLoading {
            loadingState
        } else if results.isEmpty {
            emptyState(
                icon: "doc.text.magnifyingglass",
                title: "No results for \"\(query)\"",
                subtitle: "Try different keywords or check spelling."
            )
        } else {
            resultsList
        }
    }

    private func emptyState(icon: String, title: String, subtitle: String) -> some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: icon)
                .font(.system(size: 44, weight: .light))
                .foregroundStyle(CloudwrkzColors.neutral600)
            VStack(spacing: 8) {
                Text(title)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral200)
                Text(subtitle)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
            Spacer()
        }
    }

    private var loadingState: some View {
        VStack(spacing: 16) {
            Spacer()
CloudwrkzSpinner(tint: CloudwrkzColors.primary400)
            .scaleEffect(1.2)
            Text("search.searching")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral500)
            Spacer()
        }
    }

    private var resultsList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("\(total) result\(total == 1 ? "" : "s")")
                        .font(.system(size: 13, weight: .semibold))
                        .tracking(0.5)
                        .foregroundStyle(CloudwrkzColors.neutral500)
                    Spacer()
                }

                ForEach(results) { result in
                    SearchResultRow(result: result, onTap: { openResult(result) })
                        .onAppear {
                            loadMoreIfNeeded(currentResult: result)
                        }
                }

                if isLoadingMore {
                    HStack {
                        Spacer()
                        CloudwrkzSpinner(tint: CloudwrkzColors.primary400)
                            .scaleEffect(0.8)
                        Text("search.loading_more")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(CloudwrkzColors.neutral500)
                        Spacer()
                    }
                    .padding(.vertical, 12)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func runSearchDebounced(query: String) {
        searchTask?.cancel()
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty {
            results = []
            total = 0
            return
        }
        if !SearchService.isEnhancedSearch(query: trimmed) && trimmed.count < minQueryLength {
            results = []
            total = 0
            return
        }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: debounceInterval)
            guard !Task.isCancelled else { return }
            await performSearch(query: trimmed)
        }
    }

    @MainActor
    private func performSearch(query: String) async {
        isLoading = true
        defer { isLoading = false }
        let config = appState.config
        if SearchService.isEnhancedSearch(query: query) {
            switch await SearchService.enhancedSearch(config: config, query: query) {
            case .success(let response):
                results = response.results
                total = response.total
            case .failure(.cancelled):
                break
            case .failure:
                results = []
                total = 0
            }
        } else {
            switch await SearchService.search(config: config, query: query, limit: initialPageSize, offset: 0) {
            case .success(let response):
                results = response.results
                total = response.total
            case .failure(.cancelled):
                break
            case .failure:
                results = []
                total = 0
            }
        }
    }

    private func loadMoreIfNeeded(currentResult: SearchResult) {
        guard hasMore, !isLoadingMore else { return }
        let thresholdIndex = max(results.count - 3, 0)
        guard let index = results.firstIndex(where: { $0.id == currentResult.id }),
              index >= thresholdIndex else { return }
        Task { await loadMore() }
    }

    @MainActor
    private func loadMore() async {
        guard hasMore, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        let currentQuery = query.trimmingCharacters(in: .whitespaces)
        let config = appState.config
        switch await SearchService.search(config: config, query: currentQuery, limit: pageSize, offset: results.count) {
        case .success(let response):
            results.append(contentsOf: response.results)
            total = response.total
        case .failure(.cancelled):
            break
        case .failure:
            break
        }
    }

    private func openResult(_ result: SearchResult) {
        if let onSelectResult = onSelectResult {
            onSelectResult(result)
            onDismiss()
        } else {
            // Fallback: open detail page in Safari
            guard let base = appState.config.baseURL else { return }
            let path = result.url.hasPrefix("/") ? String(result.url.dropFirst()) : result.url
            guard let url = URL(string: path, relativeTo: base) else { return }
            UIApplication.shared.open(url)
            onDismiss()
        }
    }
}

// MARK: - Result row (enterprise card)

private struct SearchResultRow: View {
    let result: SearchResult
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 14) {
                typeIcon
                VStack(alignment: .leading, spacing: 6) {
                    Text(result.title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.neutral100)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    if let desc = result.description, !desc.isEmpty {
                        Text(desc)
                            .font(.system(size: 14, weight: .regular))
                            .foregroundStyle(CloudwrkzColors.neutral500)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                    if let context = result.context, !context.isEmpty {
                        Text(context)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(CloudwrkzColors.primary400)
                            .lineLimit(1)
                    }
                    typePill
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: "arrow.up.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .glassPanel(cornerRadius: 16, tint: nil, tintOpacity: 0.04)
        }
        .buttonStyle(.plain)
    }

    private var typeIcon: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(CloudwrkzColors.primary500.opacity(0.15))
                .frame(width: 40, height: 40)
            Image(systemName: iconName)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(CloudwrkzColors.primary400)
        }
    }

    private var typePill: some View {
        Text(typeLabel)
            .font(.system(size: 11, weight: .semibold))
            .tracking(0.4)
            .foregroundStyle(CloudwrkzColors.neutral500)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(CloudwrkzColors.neutral800.opacity(0.8))
            .clipShape(Capsule())
    }

    private var iconName: String {
        switch result.type {
        case "ticket": return "ticket"
        case "task": return "checklist"
        case "subtask": return "list.bullet.indent"
        case "user": return "person.fill"
        case "comment": return "bubble.left.fill"
        case "timeentry": return "clock"
        case "link": return "link"
        case "setting": return "gearshape.fill"
        default: return "doc.text"
        }
    }

    private var typeLabel: String {
        switch result.type {
        case "ticket": return "Ticket"
        case "task": return "Task"
        case "subtask": return "Subtask"
        case "user": return "User"
        case "comment": return "Comment"
        case "timeentry": return "Time entry"
        case "link": return "Link"
        case "setting": return "Setting"
        default: return result.type.capitalized
        }
    }
}

#Preview {
    DashboardSearchView(onDismiss: {})
}
