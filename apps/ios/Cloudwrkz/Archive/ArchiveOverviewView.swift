//
//  ArchiveOverviewView.swift
//  Cloudwrkz
//
//  Enterprise archive list: tickets, todos, time entries, links. Liquid glass, transparent bar.
//  Matches cloudwrkz dashboard archive design language.
//

import SwiftUI

enum ArchiveOverviewViewStyle: String, CaseIterable {
    case card = "card"
    case list = "list"
}

struct ArchiveOverviewView: View {
    /// When provided, row tap pushes onto this path (no NavigationLink = no chevron). Swipe actions still work.
    @Binding var path: NavigationPath

    @State private var items: [ArchiveItem] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var filters = ArchiveFilters()
    @State private var showFilters = false
    @State private var itemToDelete: ArchiveItem?
    @State private var isWorking = false
    @State private var refreshErrorMessage: String?
    @AppStorage("archiveOverviewViewStyle") private var viewStyleRaw: String = ArchiveOverviewViewStyle.card.rawValue

    private var viewStyle: ArchiveOverviewViewStyle {
        ArchiveOverviewViewStyle(rawValue: viewStyleRaw) ?? .card
    }

    private var hasActiveFilters: Bool {
        filters.type != .all
            || filters.sort != .newestArchivedFirst
            || filters.archivedFrom != nil
            || filters.archivedTo != nil
            || !filters.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var filteredItems: [ArchiveItem] {
        var list: [ArchiveItem]
        switch filters.type {
        case .all: list = items
        case .tickets: list = items.filter { if case .ticket = $0 { return true }; return false }
        case .todos: list = items.filter { if case .todo = $0 { return true }; return false }
        case .time: list = items.filter { if case .timeEntry = $0 { return true }; return false }
        case .links: list = items.filter { if case .link = $0 { return true }; return false }
        }
        let query = filters.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        if !query.isEmpty {
            let lower = query.lowercased()
            list = list.filter {
                $0.title.lowercased().contains(lower) || $0.subtitle.lowercased().contains(lower)
            }
        }
        if let from = filters.archivedFrom {
            list = list.filter { ($0.archivedAt ?? .distantPast) >= from }
        }
        if let to = filters.archivedTo {
            var end = Calendar.current.startOfDay(for: to)
            end = Calendar.current.date(byAdding: .day, value: 1, to: end) ?? end
            list = list.filter { ($0.archivedAt ?? .distantFuture) < end }
        }
        switch filters.sort {
        case .newestArchivedFirst:
            return list.sorted { (a, b) in (a.archivedAt ?? .distantPast) > (b.archivedAt ?? .distantPast) }
        case .oldestArchivedFirst:
            return list.sorted { (a, b) in (a.archivedAt ?? .distantPast) < (b.archivedAt ?? .distantPast) }
        case .titleAsc:
            return list.sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        case .titleDesc:
            return list.sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedDescending }
        }
    }

    @Environment(\.appState) private var appState

    var body: some View {
        ZStack {
            background
            if isLoading && items.isEmpty {
                loadingView
            } else if let error = errorMessage {
                errorView(error)
            } else if items.isEmpty {
                emptyView
            } else {
                VStack(spacing: 0) {
                    if let refreshErr = refreshErrorMessage {
                        refreshErrorBanner(message: refreshErr)
                    }
                    typeFilterBar
                    switch viewStyle {
                    case .card: archiveCardView
                    case .list: archiveList
                    }
                }
            }
        }
        .navigationTitle("Archive")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Button {
                        viewStyleRaw = ArchiveOverviewViewStyle.card.rawValue
                    } label: {
                        Label("Card view", systemImage: "square.grid.2x2")
                    }
                    Button {
                        viewStyleRaw = ArchiveOverviewViewStyle.list.rawValue
                    } label: {
                        Label("List view", systemImage: "list.bullet")
                    }
                } label: {
                    Image(systemName: viewStyle == .card ? "square.grid.2x2" : "list.bullet")
                        .font(.system(size: 22))
                        .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showFilters = true
                } label: {
                    Image(systemName: "line.3.horizontal.decrease.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(hasActiveFilters ? CloudwrkzColors.warning500 : CloudwrkzColors.primary400)
                }
            }
        }
        .sheet(isPresented: $showFilters) {
            ArchiveFiltersView(filters: $filters)
        }
        .onAppear { Task { await loadAll(isRefresh: false) } }
        .refreshable {
            refreshErrorMessage = nil
            await loadAll(isRefresh: true)
        }
        .tint(CloudwrkzColors.primary400)
        .confirmationDialog("Delete permanently?", isPresented: Binding(get: { itemToDelete != nil }, set: { if !$0 { itemToDelete = nil } }), titleVisibility: .visible) {
            Button("Cancel", role: .cancel) { itemToDelete = nil }
            Button("Delete", role: .destructive) {
                if let item = itemToDelete {
                    itemToDelete = nil
                    Task { await deleteItem(item) }
                }
            }
        } message: {
            Text("This cannot be undone.")
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

    private var typeFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ArchiveTypeFilter.allCases) { filter in
                    Button {
                        filters.type = filter
                    } label: {
                        Text(filter.rawValue)
                            .font(.system(size: 14, weight: filters.type == filter ? .semibold : .medium))
                            .foregroundStyle(filters.type == filter ? CloudwrkzColors.neutral950 : CloudwrkzColors.neutral400)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                filters.type == filter
                                    ? CloudwrkzColors.primary400
                                    : Color.clear,
                                in: Capsule()
                            )
                            .overlay(
                                Capsule()
                                    .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .background(Color.clear)
    }

    private var archiveCardView: some View {
        Group {
            if filteredItems.isEmpty {
                emptyFilteredView
            } else {
                ScrollView {
                    LazyVStack(spacing: 14) {
                        ForEach(filteredItems) { item in
                            archiveCardRow(for: item)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .padding(.bottom, 32)
                }
                .scrollContentBackground(.hidden)
                .refreshable {
                    refreshErrorMessage = nil
                    await loadAll(isRefresh: true)
                }
            }
        }
    }

    private var archiveList: some View {
        Group {
            if filteredItems.isEmpty {
                emptyFilteredView
            } else {
                List {
                    ForEach(filteredItems) { item in
                        archiveRow(for: item)
                            .listRowInsets(EdgeInsets(top: 5, leading: 20, bottom: 5, trailing: 20))
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .refreshable {
                    refreshErrorMessage = nil
                    await loadAll(isRefresh: true)
                }
            }
        }
    }

    @ViewBuilder
    private func archiveCardRow(for item: ArchiveItem) -> some View {
        Button {
            navigateToItem(item)
        } label: {
            ArchiveRowView(item: item)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                Task { await unarchiveItem(item) }
            } label: {
                Label("Unarchive", systemImage: "arrow.uturn.backward")
            }
            Button(role: .destructive) {
                itemToDelete = item
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .disabled(isWorking)
    }

    @ViewBuilder
    private func archiveRow(for item: ArchiveItem) -> some View {
        Button {
            navigateToItem(item)
        } label: {
            ArchiveListRowView(item: item)
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button {
                Task { await unarchiveItem(item) }
            } label: {
                Label("Unarchive", systemImage: "arrow.uturn.backward")
            }
            .tint(CloudwrkzColors.primary400)
            Button(role: .destructive) {
                itemToDelete = item
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .disabled(isWorking)
    }

    private func navigateToItem(_ item: ArchiveItem) {
        switch item {
        case .ticket(let t): path.append(t)
        case .todo(let t): path.append(t)
        case .link(let l): path.append(l)
        case .timeEntry(let e): path.append(e)
        }
    }

    private func unarchiveItem(_ item: ArchiveItem) async {
        guard !isWorking else { return }
        isWorking = true
        defer { Task { @MainActor in isWorking = false } }
        var success = false
        switch item {
        case .ticket(let t):
            if case .success = await TicketService.unarchiveTicket(config: appState.config, id: t.id) { success = true }
        case .todo(let t):
            if case .success = await TodoService.unarchiveTodo(config: appState.config, id: t.id) { success = true }
        case .link(let l):
            if case .success = await LinkService.unarchiveLink(config: appState.config, id: l.id) { success = true }
        case .timeEntry(let e):
            if case .success = await TimeTrackingService.unarchiveTimeEntry(config: appState.config, id: e.id) { success = true }
        }
        if success { await loadAll(isRefresh: true) }
    }

    private func deleteItem(_ item: ArchiveItem) async {
        guard !isWorking else { return }
        isWorking = true
        defer { Task { @MainActor in isWorking = false } }
        var success = false
        switch item {
        case .ticket(let t):
            if case .success = await TicketService.deleteTicket(config: appState.config, id: t.id) { success = true }
        case .todo(let t):
            if case .success = await TodoService.deleteTodo(config: appState.config, id: t.id) { success = true }
        case .link(let l):
            if case .success = await LinkService.deleteLink(config: appState.config, id: l.id) { success = true }
        case .timeEntry(let e):
            if case .success = await TimeTrackingService.deleteTimeEntry(config: appState.config, id: e.id) { success = true }
        }
        if success { await loadAll(isRefresh: true) }
    }

    private var loadingView: some View {
        VStack(spacing: 16) {
            CloudwrkzSpinner(tint: CloudwrkzColors.primary400)
                .scaleEffect(1.2)
            Text("Loading archive…")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral400)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 44))
                .foregroundStyle(CloudwrkzColors.warning500)
            Text("Couldn't load archive")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral100)
            Text(message)
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral400)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("Retry") { Task { await loadAll(isRefresh: false) } }
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.primary400)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "archivebox.fill")
                .font(.system(size: 48))
                .foregroundStyle(CloudwrkzColors.neutral500)
            Text("No archived items")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral100)
            Text("Archived tickets, todos, time entries, and links will appear here.")
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral500)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyFilteredView: some View {
        let isSearchOnly = !filters.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && filters.type == .all && filters.archivedFrom == nil && filters.archivedTo == nil
        return VStack(spacing: 16) {
            Image(systemName: "archivebox")
                .font(.system(size: 44))
                .foregroundStyle(CloudwrkzColors.neutral500)
            Text(isSearchOnly ? "No matches" : "No \(filters.type.rawValue.lowercased()) in archive")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral200)
            Text(isSearchOnly ? "Try a different search or clear the filter." : "Change the filter above or archive items from their lists.")
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral500)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.top, 40)
    }

    private func refreshErrorBanner(message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(CloudwrkzColors.warning500)
            Text(message)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral100)
            Spacer()
            Button(String(localized: "links.dismiss")) {
                refreshErrorMessage = nil
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(CloudwrkzColors.primary400)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(CloudwrkzColors.neutral800.opacity(0.95))
    }

    private func loadAll(isRefresh: Bool = false) async {
        let hadItems = !items.isEmpty
        if !isRefresh {
            errorMessage = nil
            isLoading = true
        }
        let config = appState.config

        // Safety: if any request hangs, stop showing loading after 25 seconds
        let timeoutTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 25_000_000_000)
            if isLoading {
                isLoading = false
                if items.isEmpty && errorMessage == nil {
                    errorMessage = "Request timed out. Pull down to retry."
                }
            }
        }

        // Run all four fetches concurrently so we wait for the slowest, not the sum
        async let ticketsResult = fetchTicketsArchive(config: config)
        async let todosResult = fetchTodosArchive(config: config)
        async let timeResult = fetchTimeArchive(config: config)
        async let linksResult = fetchLinksArchive(config: config)

        let (ticketItems, ticketErr) = await ticketsResult
        let (todoItems, todoErr) = await todosResult
        let (timeItems, timeErr) = await timeResult
        let (linkItems, linkErr) = await linksResult

        timeoutTask.cancel()

        let firstError = ticketErr ?? todoErr ?? timeErr ?? linkErr
        let all = ticketItems + todoItems + timeItems + linkItems

        await MainActor.run {
            if let err = firstError {
                if isRefresh && hadItems {
                    refreshErrorMessage = err
                } else {
                    errorMessage = err
                    items = []
                }
            } else {
                items = all
                errorMessage = nil
                refreshErrorMessage = nil
            }
            isLoading = false
        }
    }

    private func fetchTicketsArchive(config: ServerConfig) async -> ([ArchiveItem], String?) {
        var f = TicketFilters()
        f.status = .all
        f.archive = .archived
        switch await TicketService.fetchTickets(config: config, filters: f) {
        case .success(let list): return (list.compactMap { t in t.archivedAt != nil ? ArchiveItem.ticket(t) : nil }, nil)
        case .failure(let e): return ([], messageFor(e))
        }
    }

    private func fetchTodosArchive(config: ServerConfig) async -> ([ArchiveItem], String?) {
        var f = TodoFilters()
        f.status = .all
        f.priority = .all
        f.archive = .archived
        f.includeSubtodos = true
        switch await TodoService.fetchTodos(config: config, filters: f) {
        case .success(let list): return (list.compactMap { t in t.archivedAt != nil ? ArchiveItem.todo(t) : nil }, nil)
        case .failure(let e): return ([], messageForTodo(e))
        }
    }

    private func fetchTimeArchive(config: ServerConfig) async -> ([ArchiveItem], String?) {
        var f = TimeTrackingFilters()
        f.status = .all
        f.archive = .archived
        switch await TimeTrackingService.fetchTimeEntries(config: config, filters: f) {
        case .success(let list): return (list.compactMap { e in e.archivedAt != nil ? ArchiveItem.timeEntry(e) : nil }, nil)
        case .failure(let e): return ([], messageForTime(e))
        }
    }

    private func fetchLinksArchive(config: ServerConfig) async -> ([ArchiveItem], String?) {
        var f = LinkFilters()
        f.archived = true
        var allItems: [ArchiveItem] = []
        var firstError: String?
        var page = 1
        let pageSize = 100
        while true {
            switch await LinkService.fetchLinks(config: config, filters: f, page: page, limit: pageSize) {
            case .success(let response):
                let pageItems = response.links.compactMap { l in l.archivedAt != nil ? ArchiveItem.link(l) : nil }
                allItems.append(contentsOf: pageItems)
                if response.links.count < pageSize || page >= response.totalPages {
                    return (allItems, firstError)
                }
                page += 1
            case .failure(let e):
                if firstError == nil { firstError = messageForLink(e) }
                return (allItems, firstError)
            }
        }
    }

    private func messageFor(_ error: TicketServiceError) -> String {
        switch error {
        case .noServerURL: return "No server configured."
        case .noToken: return "Please sign in again."
        case .unauthorized: return "Session expired. Sign in again."
        case .serverError(let m): return m
        case .networkError: return "Could not reach server."
        }
    }

    private func messageForTodo(_ error: TodoServiceError) -> String {
        switch error {
        case .noServerURL: return "No server configured."
        case .noToken: return "Please sign in again."
        case .unauthorized: return "Session expired. Sign in again."
        case .serverError(let m): return m
        case .networkError: return "Could not reach server."
        }
    }

    private func messageForTime(_ error: TimeTrackingServiceError) -> String {
        switch error {
        case .noServerURL: return "No server configured."
        case .noToken: return "Please sign in again."
        case .unauthorized: return "Session expired. Sign in again."
        case .serverError(let m): return m
        case .networkError: return "Could not reach server."
        case .notFound: return "Not found."
        }
    }

    private func messageForLink(_ error: LinkServiceError) -> String {
        switch error {
        case .noServerURL: return "No server configured."
        case .noToken: return "Please sign in again."
        case .unauthorized: return "Session expired. Sign in again."
        case .serverError(let m): return m
        case .networkError: return "Could not reach server."
        }
    }
}

// MARK: - List row (compact liquid-glass bar: type pill, title, subtitle, date)

private struct ArchiveListRowView: View {
    let item: ArchiveItem

    var body: some View {
        HStack(spacing: 12) {
            typePill(item.typeLabel)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .lineLimit(2)
                HStack(spacing: 6) {
                    Text(item.subtitle)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral500)
                        .lineLimit(1)
                    if let date = item.archivedAt {
                        Text("·")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(CloudwrkzColors.neutral500)
                        Text(shortDate(date))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(CloudwrkzColors.neutral500)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral500)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .glassCard(cornerRadius: 12)
    }

    private func typePill(_ label: String) -> some View {
        let (color, bg) = typeStyle(label)
        return Text(label)
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(bg.opacity(0.25), in: Capsule())
    }

    private func typeStyle(_ label: String) -> (Color, Color) {
        switch label {
        case "Ticket": return (CloudwrkzColors.primary400, CloudwrkzColors.primary400)
        case "ToDo": return (Color(red: 168/255, green: 85/255, blue: 247/255), Color(red: 168/255, green: 85/255, blue: 247/255))
        case "Time": return (CloudwrkzColors.success500, CloudwrkzColors.success500)
        case "Link": return (CloudwrkzColors.warning500, CloudwrkzColors.warning500)
        default: return (CloudwrkzColors.neutral400, CloudwrkzColors.neutral400)
        }
    }

    private func shortDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeStyle = .none
        return f.string(from: date)
    }
}

// MARK: - Card row (full glass card, type pill, title, subtitle, archived date)

private struct ArchiveRowView: View {
    let item: ArchiveItem

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    typePill(item.typeLabel)
                    if let date = item.archivedAt {
                        Text(formatted(date))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(CloudwrkzColors.neutral500)
                    }
                    Spacer(minLength: 8)
                }
                Text(item.title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .lineLimit(2)
                Text(item.subtitle)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral400)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral500)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .glassCard(cornerRadius: 16)
    }

    private func typePill(_ label: String) -> some View {
        let (color, bg) = typeStyle(label)
        return Text(label)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(bg.opacity(0.25), in: Capsule())
    }

    private func typeStyle(_ label: String) -> (Color, Color) {
        switch label {
        case "Ticket": return (CloudwrkzColors.primary400, CloudwrkzColors.primary400)
        case "ToDo": return (Color(red: 168/255, green: 85/255, blue: 247/255), Color(red: 168/255, green: 85/255, blue: 247/255))
        case "Time": return (CloudwrkzColors.success500, CloudwrkzColors.success500)
        case "Link": return (CloudwrkzColors.warning500, CloudwrkzColors.warning500)
        default: return (CloudwrkzColors.neutral400, CloudwrkzColors.neutral400)
        }
    }

    private func formatted(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f.string(from: date)
    }
}

#Preview {
    struct PreviewWrapper: View {
        @State private var path = NavigationPath()
        var body: some View {
            NavigationStack(path: $path) {
                ArchiveOverviewView(path: $path)
                    .navigationDestination(for: Ticket.self) { _ in Text("Ticket detail") }
                    .navigationDestination(for: Todo.self) { _ in Text("Todo detail") }
                    .navigationDestination(for: Link.self) { _ in Text("Link detail") }
                    .navigationDestination(for: TimeEntry.self) { _ in Text("Time entry detail") }
            }
        }
    }
    return PreviewWrapper()
}
