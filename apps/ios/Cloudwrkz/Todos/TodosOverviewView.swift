//
//  TodosOverviewView.swift
//  Cloudwrkz
//
//  Enterprise todo list with filter sheet. Matches cloudwrkz todo list design.
//

import SwiftUI

// Human: Todos need optimistic create placeholders because POST can return 202—the list should reflect intent before the job finishes.
// Agent: TodosOverviewView TodoService; TodoFilters sheet; @AppStorage todoOverviewViewStyle card|list; optimisticCreatingTodos MutationTitleCarouselState.

enum TodoOverviewViewStyle: String, CaseIterable {
    case card = "card"
    case list = "list"
}

private struct OptimisticCreatingTodo: Identifiable {
    let id: UUID
    let title: String
    let description: String?
}

private enum TodoListRowItem: Identifiable {
    case completedHeader
    case todo(Todo)
    /// New todo being created; shown at the sort position where the API will place it.
    case creatingPlaceholder(id: UUID, title: String)

    var id: String {
        switch self {
        case .completedHeader: return "completed-header"
        case .todo(let t): return t.id
        case .creatingPlaceholder(let cid, _): return "creating-list-\(cid.uuidString)"
        }
    }
}

private enum TodoCardRowItem: Identifiable {
    case creating(id: UUID, title: String, description: String?)
    case row(Todo)

    var id: String {
        switch self {
        case .creating(let cid, _, _): return "creating-card-\(cid.uuidString)"
        case .row(let t): return t.id
        }
    }
}

struct TodosOverviewView: View {
    @State private var todos: [Todo] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var filters = TodoFilters()
    @State private var showFilters = false
    @State private var showAddTodo = false
    @AppStorage("todoOverviewViewStyle") private var viewStyleRaw: String = TodoOverviewViewStyle.card.rawValue
    @State private var pendingArchiveTodo: Todo?
    @State private var pendingDeleteTodo: Todo?
    /// Rows blurred while archive/delete mutation is in flight (202 + poll).
    @State private var todoIdsPendingArchiveOrDelete: Set<String> = []
    @State private var refreshErrorMessage: String?
    @State private var mutationTitleCarousel = MutationTitleCarouselState()
    /// One placeholder per in-flight create (user can open add again before prior requests finish).
    @State private var optimisticCreatingTodos: [OptimisticCreatingTodo] = []

    private var viewStyle: TodoOverviewViewStyle {
        TodoOverviewViewStyle(rawValue: viewStyleRaw) ?? .card
    }

    private var hasActiveFilters: Bool {
        filters.status != .all
            || filters.priority != .all
            || filters.sort != .newestFirst
            || filters.archive != .unarchived
    }

    @Environment(\.appState) private var appState

    // Human: Card vs list toggle is persisted so commuters keep their preferred density across launches.
    // Agent: ZStack branches loading error empty list; viewStyle switches card grid vs list; toolbar add filter.

    var body: some View {
        ZStack {
            background
            if isLoading && todos.isEmpty && optimisticCreatingTodos.isEmpty {
                loadingView
            } else if let error = errorMessage {
                errorView(error)
            } else if todos.isEmpty && optimisticCreatingTodos.isEmpty {
                emptyView
            } else {
                Group {
                    switch viewStyle {
                    case .card: cardView
                    case .list: listView
                    }
                }
                .safeAreaInset(edge: .top, spacing: 0) {
                    if let refreshErr = refreshErrorMessage {
                        refreshErrorBanner(message: refreshErr)
                    }
                }
            }
        }
        .mutationJobNavigationTitle("todo.nav_title", state: mutationTitleCarousel)
        .toolbarBackground(.hidden, for: .navigationBar)
        .overlay(alignment: .bottomTrailing) {
            if !isLoading || !todos.isEmpty || !optimisticCreatingTodos.isEmpty {
                addTodoButton
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Button {
                        viewStyleRaw = TodoOverviewViewStyle.card.rawValue
                    } label: {
                        Label("todo.card_view", systemImage: "square.grid.2x2")
                    }
                    Button {
                        viewStyleRaw = TodoOverviewViewStyle.list.rawValue
                    } label: {
                        Label("todo.list_view", systemImage: "list.bullet")
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
        .tint(CloudwrkzColors.primary400)
        .sheet(isPresented: $showFilters) {
            TodoFiltersView(filters: $filters)
                .onDisappear { Task { await loadTodos() } }
        }
        .sheet(isPresented: $showAddTodo) {
            AddTodoView(
                parentTodoId: nil,
                parentTodoTitle: nil,
                mutationHooks: todoMutationHooks(),
                onCreateStarted: { correlationId, title, description in
                    optimisticCreatingTodos.append(
                        OptimisticCreatingTodo(id: correlationId, title: title, description: description)
                    )
                },
                onSaved: { newId, correlationId in
                    Task { await handleTodoCreated(newTodoId: newId, completedCorrelationId: correlationId) }
                },
                onCreateFailed: { msg, correlationId in
                    Task { @MainActor in
                        optimisticCreatingTodos.removeAll { $0.id == correlationId }
                        refreshErrorMessage = msg
                    }
                }
            )
        }
        .onAppear { Task { await loadTodos() } }
        .overlay {
            if let todo = pendingArchiveTodo {
                archiveConfirmationDialog(for: todo)
            } else if let todo = pendingDeleteTodo {
                deleteConfirmationDialog(for: todo)
            }
        }
    }

    /// Floating add-todo button, bottom right. Liquid glass style (matches Links).
    private var addTodoButton: some View {
        Button {
            showAddTodo = true
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral950)
                .frame(width: 56, height: 56)
                .background(CloudwrkzColors.primary400, in: Circle())
                .overlay(
                    Circle()
                        .stroke(.white.opacity(0.3), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.25), radius: 8, x: 0, y: 4)
        }
        .buttonStyle(.plain)
        .padding(.trailing, 20)
        .padding(.bottom, 24)
    }

    private var background: some View {
        LinearGradient(
            colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    private var loadingView: some View {
        VStack(spacing: 16) {
CloudwrkzSpinner(tint: CloudwrkzColors.primary400)
            .scaleEffect(1.2)
            Text("todo.loading")
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
            Text("todo.load_error")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral100)
            Text(message)
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral400)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("todo.retry") { Task { await loadTodos(isRefresh: false) } }
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.primary400)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "checklist")
                .font(.system(size: 48))
                .foregroundStyle(CloudwrkzColors.neutral500)
            Text("todo.no_todos")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral100)
            Text("todo.empty_hint")
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral500)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var cardView: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                ForEach(cardRowItems) { item in
                    switch item {
                    case .creating(_, let title, let description):
                        TodoCreatingPlaceholderCard(title: title, description: description)
                    case .row(let todo):
                        NavigationLink(value: todo) {
                            TodoRowView(
                                todo: todo,
                                isMutationPending: todoIdsPendingArchiveOrDelete.contains(todo.id)
                            )
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            if todo.status == "COMPLETED" {
                                Button {
                                    Task { await uncompleteTodo(todo.id) }
                                } label: {
                                    Label(String(localized: "todo.context_uncomplete"), systemImage: "arrow.uturn.backward.circle")
                                }
                            } else {
                                Button {
                                    Task { await completeTodo(todo.id) }
                                } label: {
                                    Label(String(localized: "todo.context_complete"), systemImage: "checkmark.circle")
                                }
                            }
                            Divider()
                            Button {
                                pendingArchiveTodo = todo
                            } label: {
                                Label(String(localized: "todo.archive"), systemImage: "archivebox")
                            }
                            Button(role: .destructive) {
                                pendingDeleteTodo = todo
                            } label: {
                                Label(String(localized: "todo.delete"), systemImage: "trash")
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 32)
        }
        .refreshable {
            refreshErrorMessage = nil
            await loadTodos(isRefresh: true)
        }
        .scrollContentBackground(.hidden)
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

    private var activeTodos: [Todo] {
        todos.filter { $0.status != "COMPLETED" }
    }

    private var completedTodos: [Todo] {
        todos.filter { $0.status == "COMPLETED" }
    }

    /// Main overview only lists root tasks. Subtodos are shown on the parent’s detail screen only.
    private func applyRootOnlyFilter(_ list: [Todo]) -> [Todo] {
        list.filter { $0.parentTodoId == nil }
    }

    /// Query params for this screen: always exclude subtodos from the flat list (matches product rule).
    private func filtersForMainList(_ base: TodoFilters) -> TodoFilters {
        var f = base
        f.includeSubtodos = false
        return f
    }

    /// Where to show the optimistic row so it matches GET `/todos` ordering.
    ///
    /// The API currently ignores the `sort` query param and uses `ORDER BY "order" ASC, created_at ASC`.
    /// New todos are inserted with `order = 0` and the latest `created_at`, so they appear **after**
    /// existing peers — typically at the **end** of the returned list, not the top (even when the UI
    /// filter says “newest first”).
    private func insertionIndexForNewTodo() -> Int {
        todos.count
    }

    /// Same as ``insertionIndexForNewTodo()`` but within the **active** slice used by list view.
    private func insertionIndexForNewTodoAmongActives() -> Int {
        activeTodos.count
    }

    private var cardRowItems: [TodoCardRowItem] {
        var rows = todos.map { TodoCardRowItem.row($0) }
        let baseIdx = insertionIndexForNewTodo()
        for (i, draft) in optimisticCreatingTodos.enumerated() {
            let idx = min(max(0, baseIdx + i), rows.count)
            rows.insert(
                .creating(id: draft.id, title: draft.title, description: draft.description),
                at: idx
            )
        }
        return rows
    }

    private var todoListRowItems: [TodoListRowItem] {
        var activeItems: [TodoListRowItem] = activeTodos.map { .todo($0) }
        let baseIdx = insertionIndexForNewTodoAmongActives()
        for (i, draft) in optimisticCreatingTodos.enumerated() {
            let idx = min(max(0, baseIdx + i), activeItems.count)
            activeItems.insert(.creatingPlaceholder(id: draft.id, title: draft.title), at: idx)
        }
        let header: [TodoListRowItem] = completedTodos.isEmpty ? [] : [.completedHeader]
        let completed: [TodoListRowItem] = completedTodos.map { .todo($0) }
        return activeItems + header + completed
    }

    private var listView: some View {
        List {
            ForEach(todoListRowItems) { item in
                switch item {
                case .creatingPlaceholder(_, let title):
                    TodoCreatingListPlaceholder(title: title)
                        .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 20))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                case .completedHeader:
                    Text("todo.completed_header")
                        .font(.system(size: 11, weight: .bold))
                        .tracking(0.8)
                        .foregroundStyle(CloudwrkzColors.neutral500)
                        .listRowInsets(EdgeInsets(top: 12, leading: 20, bottom: 4, trailing: 20))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                case .todo(let todo):
                    if todo.status == "COMPLETED" {
                        NavigationLink(value: todo) {
                            overviewCompletedRow(todo)
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 20))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                pendingDeleteTodo = todo
                            } label: { Image(systemName: "trash") }
                            .tint(.red)
                        }
                        .contextMenu {
                            Button {
                                Task { await uncompleteTodo(todo.id) }
                            } label: {
                                Label(String(localized: "todo.context_uncomplete"), systemImage: "arrow.uturn.backward.circle")
                            }
                            Divider()
                            Button {
                                pendingArchiveTodo = todo
                            } label: {
                                Label(String(localized: "todo.archive"), systemImage: "archivebox")
                            }
                            Button(role: .destructive) {
                                pendingDeleteTodo = todo
                            } label: {
                                Label(String(localized: "todo.delete"), systemImage: "trash")
                            }
                        }
                    } else {
                        NavigationLink(value: todo) {
                            overviewActiveRow(todo)
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 20))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                pendingDeleteTodo = todo
                            } label: { Image(systemName: "trash") }
                            .tint(.red)
                            Button {
                                Task { await completeTodo(todo.id) }
                            } label: { Image(systemName: "checkmark") }
                            .tint(CloudwrkzColors.success500)
                        }
                        .contextMenu {
                            Button {
                                Task { await completeTodo(todo.id) }
                            } label: {
                                Label(String(localized: "todo.context_complete"), systemImage: "checkmark.circle")
                            }
                            Divider()
                            Button {
                                pendingArchiveTodo = todo
                            } label: {
                                Label(String(localized: "todo.archive"), systemImage: "archivebox")
                            }
                            Button(role: .destructive) {
                                pendingDeleteTodo = todo
                            } label: {
                                Label(String(localized: "todo.delete"), systemImage: "trash")
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .refreshable {
            refreshErrorMessage = nil
            await loadTodos(isRefresh: true)
        }
        .animation(.easeInOut(duration: 0.25), value: todoListRowItems.map(\.id))
    }

    private func overviewActiveRow(_ todo: Todo) -> some View {
        let pending = todoIdsPendingArchiveOrDelete.contains(todo.id)
        return HStack(spacing: 14) {
            Button {
                Task { await completeTodo(todo.id) }
            } label: {
                Image(systemName: "circle")
                    .font(.system(size: 20))
                    .foregroundStyle(CloudwrkzColors.neutral500)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .disabled(pending)
            VStack(alignment: .leading, spacing: 2) {
                Text(todo.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .lineLimit(2)
                Text(overviewTodoSubtitle(todo))
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .blur(radius: pending ? 4 : 0)
        .allowsHitTesting(!pending)
        .animation(.easeInOut(duration: 0.22), value: pending)
    }

    private func overviewCompletedRow(_ todo: Todo) -> some View {
        let pending = todoIdsPendingArchiveOrDelete.contains(todo.id)
        return HStack(spacing: 14) {
            Button {
                Task { await uncompleteTodo(todo.id) }
            } label: {
                Image(systemName: "checkmark.circle")
                    .font(.system(size: 20))
                    .foregroundStyle(CloudwrkzColors.success500)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .disabled(pending)
            VStack(alignment: .leading, spacing: 2) {
                Text(todo.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral400)
                    .strikethrough(true, color: CloudwrkzColors.neutral500)
                    .lineLimit(2)
                Text(overviewTodoSubtitle(todo))
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .blur(radius: pending ? 4 : 0)
        .allowsHitTesting(!pending)
        .animation(.easeInOut(duration: 0.22), value: pending)
    }

    private func overviewTodoSubtitle(_ todo: Todo) -> String {
        let status = todo.status.replacingOccurrences(of: "_", with: " ").lowercased()
        return "\(status) · \(todo.priority)"
    }

    private func todoMutationHooks() -> MutationJobTitleHooks {
        MutationJobTitleHooks(
            onQueued: {
                await mutationTitleCarousel.playCycle(
                    message: String(localized: "mutation.job_queued"),
                    bannerKind: .queued
                )
            },
            onCompleted: {
                await mutationTitleCarousel.playCycle(
                    message: String(localized: "mutation.job_completed"),
                    bannerKind: .completed
                )
            }
        )
    }

    private func completeTodo(_ id: String) async {
        let result = await TodoService.updateTodo(
            config: appState.config,
            id: id,
            status: "COMPLETED",
            mutationHooks: todoMutationHooks()
        )
        guard case .success = result else { return }
        await loadTodos()
    }

    private func uncompleteTodo(_ id: String) async {
        let result = await TodoService.updateTodo(
            config: appState.config,
            id: id,
            status: "IN_PROGRESS",
            mutationHooks: todoMutationHooks()
        )
        guard case .success = result else { return }
        await loadTodos()
    }

    private func deleteTodo(_ id: String) async {
        await MainActor.run { todoIdsPendingArchiveOrDelete.insert(id) }
        _ = await TodoService.deleteTodo(config: appState.config, id: id, mutationHooks: todoMutationHooks())
        await loadTodos(isRefresh: true)
        await MainActor.run { todoIdsPendingArchiveOrDelete.remove(id) }
    }

    /// Refresh after create: fetch single todo and full list **in parallel** so the new item appears as soon as either response wins (same pattern as `loadTodos` for errors).
    private func handleTodoCreated(newTodoId: String, completedCorrelationId: UUID) async {
        let hadContent = await MainActor.run { !todos.isEmpty || !optimisticCreatingTodos.isEmpty }
        async let fetched = TodoService.fetchTodo(config: appState.config, id: newTodoId)
        async let listResult = TodoService.fetchTodos(config: appState.config, filters: filtersForMainList(filters))
        let (todoResult, listRes) = await (fetched, listResult)
        await MainActor.run {
            optimisticCreatingTodos.removeAll { $0.id == completedCorrelationId }
            switch listRes {
            case .success(let list):
                todos = applyRootOnlyFilter(list)
                errorMessage = nil
                refreshErrorMessage = nil
            case .failure(let err):
                let errText = message(for: err)
                if case .success(let t) = todoResult,
                   t.parentTodoId == nil,
                   !todos.contains(where: { $0.id == t.id })
                {
                    let idx = min(insertionIndexForNewTodo(), todos.count)
                    todos.insert(t, at: idx)
                }
                if hadContent || !todos.isEmpty {
                    refreshErrorMessage = errText
                } else {
                    todos = []
                    errorMessage = errText
                }
            }
            isLoading = false
        }
    }

    /// Load todos; when isRefresh and we already have todos, failure shows a banner instead of full-screen error.
    private func loadTodos(isRefresh: Bool = false) async {
        let hadTodos = !todos.isEmpty
        if !isRefresh {
            errorMessage = nil
            isLoading = true
        }
        let result = await TodoService.fetchTodos(config: appState.config, filters: filtersForMainList(filters))
        await MainActor.run {
            switch result {
            case .success(let list):
                todos = applyRootOnlyFilter(list)
                errorMessage = nil
                refreshErrorMessage = nil
            case .failure(let err):
                let errText = message(for: err)
                if isRefresh && hadTodos {
                    refreshErrorMessage = errText
                } else {
                    todos = []
                    errorMessage = errText
                }
            }
            isLoading = false
        }
    }

    private func message(for error: TodoServiceError) -> String {
        switch error {
        case .noServerURL: return String(localized: "todo.no_server")
        case .noToken: return String(localized: "todo.please_sign_in")
        case .unauthorized: return String(localized: "todo.session_expired")
        case .serverError(let m): return m
        case .networkError: return String(localized: "auth.could_not_reach_server")
        }
    }

    private func performArchive(_ todo: Todo) async {
        let id = todo.id
        await MainActor.run { todoIdsPendingArchiveOrDelete.insert(id) }
        let result = await TodoService.archiveTodo(
            config: appState.config,
            id: id,
            mutationHooks: todoMutationHooks()
        )
        await MainActor.run {
            switch result {
            case .success:
                refreshErrorMessage = nil
            case .failure(let err):
                refreshErrorMessage = message(for: err)
            }
        }
        if case .success = result {
            await loadTodos(isRefresh: true)
        }
        await MainActor.run { todoIdsPendingArchiveOrDelete.remove(id) }
    }

    private func performDelete(_ todo: Todo) async {
        await deleteTodo(todo.id)
    }

    @ViewBuilder
    private func archiveConfirmationDialog(for todo: Todo) -> some View {
        ZStack {
            Color.black.opacity(0.4)
                .ignoresSafeArea()

            VStack(spacing: 20) {
                VStack(spacing: 12) {
                    HStack(spacing: 10) {
                        Image(systemName: "archivebox")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.warning500)
                        Text("todo.archive_todo")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                    }
                    Text(String(format: String(localized: "todo.archive_todo_message"), todo.title))
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral400)
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: 12) {
                    Button {
                        pendingArchiveTodo = nil
                    } label: {
                        Text("common.cancel")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .background(
                        Group {
                            if #available(iOS 26.0, *) {
                                RoundedRectangle(cornerRadius: 14)
                                    .fill(.clear)
                                    .glassEffect(.regular.tint(CloudwrkzColors.glassFillSubtle), in: RoundedRectangle(cornerRadius: 14))
                            } else {
                                Color.clear
                                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
                            }
                        }
                    )

                    Button {
                        let t = todo
                        pendingArchiveTodo = nil
                        Task { await performArchive(t) }
                    } label: {
                        Text("todo.archive")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.neutral950)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(CloudwrkzColors.warning500)
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(CloudwrkzColors.glassStroke, lineWidth: 1)
                            )
                    )
                }
            }
            .padding(20)
            .frame(maxWidth: 360)
            .background(
                Group {
                    if #available(iOS 26.0, *) {
                        RoundedRectangle(cornerRadius: 22)
                            .fill(.clear)
                            .glassEffect(.regular.tint(CloudwrkzColors.glassFillHighlight), in: RoundedRectangle(cornerRadius: 22))
                            .overlay(
                                RoundedRectangle(cornerRadius: 22)
                                    .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                            )
                    } else {
                        Color.clear
                            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 22))
                            .overlay(
                                RoundedRectangle(cornerRadius: 22)
                                    .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                            )
                    }
                }
            )
            .padding(.horizontal, 24)
        }
    }

    @ViewBuilder
    private func deleteConfirmationDialog(for todo: Todo) -> some View {
        ZStack {
            Color.black.opacity(0.4)
                .ignoresSafeArea()

            VStack(spacing: 20) {
                VStack(spacing: 12) {
                    HStack(spacing: 10) {
                        Image(systemName: "trash")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.error500)
                        Text("todo.delete_todo")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                    }
                    Text(String(format: String(localized: "todo.delete_todo_message"), todo.title))
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral400)
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: 12) {
                    Button {
                        pendingDeleteTodo = nil
                    } label: {
                        Text("common.cancel")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .background(
                        Group {
                            if #available(iOS 26.0, *) {
                                RoundedRectangle(cornerRadius: 14)
                                    .fill(.clear)
                                    .glassEffect(.regular.tint(CloudwrkzColors.glassFillSubtle), in: RoundedRectangle(cornerRadius: 14))
                            } else {
                                Color.clear
                                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
                            }
                        }
                    )

                    Button {
                        let t = todo
                        pendingDeleteTodo = nil
                        Task { await performDelete(t) }
                    } label: {
                        Text("todo.delete")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.neutral950)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(CloudwrkzColors.error500)
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(CloudwrkzColors.glassStroke, lineWidth: 1)
                            )
                    )
                }
            }
            .padding(20)
            .frame(maxWidth: 360)
            .background(
                Group {
                    if #available(iOS 26.0, *) {
                        RoundedRectangle(cornerRadius: 22)
                            .fill(.clear)
                            .glassEffect(.regular.tint(CloudwrkzColors.glassFillHighlight), in: RoundedRectangle(cornerRadius: 22))
                            .overlay(
                                RoundedRectangle(cornerRadius: 22)
                                    .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                            )
                    } else {
                        Color.clear
                            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 22))
                            .overlay(
                                RoundedRectangle(cornerRadius: 22)
                                    .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                            )
                    }
                }
            )
            .padding(.horizontal, 24)
        }
    }
}

// MARK: - Creating placeholder (matches `TodoRowView` / list row geometry for in-place swap)

/// Mirrors `TodoRowView`: same pills/title/footer layout; spinner in the **top-trailing** corner of the card (inside padding).
private struct TodoCreatingPlaceholderCard: View {
    let title: String
    let description: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Text("NOT_STARTED".replacingOccurrences(of: "_", with: " "))
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.neutral400)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(CloudwrkzColors.neutral400.opacity(0.2), in: Capsule())
                        Text("MEDIUM")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.warning400)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(CloudwrkzColors.warning400.opacity(0.2), in: Capsule())
                    }
                }
                Spacer(minLength: 8)
                CloudwrkzSpinner(tint: CloudwrkzColors.primary400)
                    .scaleEffect(0.72)
                    .frame(width: 22, height: 22)
                    .accessibilityLabel(String(localized: "todo.creating"))
            }

            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral100)
                .lineLimit(2)

            if let description, !description.isEmpty {
                Text(description)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral400)
                    .lineLimit(2)
            }

            HStack(spacing: 16) {
                creatingCardLabelValue(String(localized: "todo.assigned"), String(localized: "todo.unassigned"))
                creatingCardLabelValue(String(localized: "todo.created"), "—")
            }
            .font(.system(size: 12, weight: .regular))
            .foregroundStyle(CloudwrkzColors.neutral400)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .glassCard(cornerRadius: 16)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(title))
    }

    private func creatingCardLabelValue(_ label: String, _ value: String) -> some View {
        HStack(spacing: 4) {
            Text("\(label):")
                .foregroundStyle(CloudwrkzColors.neutral400)
            Text(value)
                .foregroundStyle(CloudwrkzColors.neutral100)
        }
    }
}

/// Mirrors `overviewActiveRow` with the same subtitle shape as `overviewTodoSubtitle` for a typical new todo (`NOT_STARTED`, `MEDIUM`). Spinner top-trailing inside the row.
private struct TodoCreatingListPlaceholder: View {
    let title: String

    private var subtitleLine: String {
        let status = "NOT_STARTED".replacingOccurrences(of: "_", with: " ").lowercased()
        return "\(status) · MEDIUM"
    }

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: "circle")
                .font(.system(size: 20))
                .foregroundStyle(CloudwrkzColors.neutral500)
                .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .lineLimit(2)
                Text(subtitleLine)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            CloudwrkzSpinner(tint: CloudwrkzColors.primary400)
                .scaleEffect(0.72)
                .frame(width: 22, height: 22)
                .accessibilityLabel(String(localized: "todo.creating"))
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(title))
    }
}

// MARK: - Todo row (glass card, status/priority badges)

private struct TodoRowView: View {
    let todo: Todo
    var isMutationPending: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                    if let num = todo.todoNumber, !num.isEmpty {
                        Text(num)
                            .font(.system(size: 13, weight: .semibold, design: .monospaced))
                            .foregroundStyle(CloudwrkzColors.primary400)
                    }
                    HStack(spacing: 6) {
                        statusPill(todo.status)
                        priorityPill(todo.priority)
                    }
                }
                Spacer(minLength: 8)
            }

            Text(todo.title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral100)
                .lineLimit(2)

            if let desc = todo.descriptionPlain ?? todo.description, !desc.isEmpty {
                Text(desc)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral400)
                    .lineLimit(2)
            }

            HStack(spacing: 16) {
                if let assignee = todo.assignedTo {
                    labelValue(String(localized: "todo.assigned"), formatUser(assignee))
                } else {
                    labelValue(String(localized: "todo.assigned"), String(localized: "todo.unassigned"))
                }
                labelValue(String(localized: "todo.created"), formatted(todo.createdAt))
                if let ticket = todo.ticket {
                    HStack(spacing: 4) {
                        Image(systemName: "ticket")
                            .font(.system(size: 12))
                        Text(ticket.ticketNumber)
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(CloudwrkzColors.neutral200)
                }
                if todo.subtodosDisplayCount > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "list.bullet.indent")
                            .font(.system(size: 12))
                        Text("\(todo.subtodosDisplayCount)")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(CloudwrkzColors.neutral200)
                }
            }
            .font(.system(size: 12, weight: .regular))
            .foregroundStyle(CloudwrkzColors.neutral400)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .glassCard(cornerRadius: 16)
        .blur(radius: isMutationPending ? 4 : 0)
        .allowsHitTesting(!isMutationPending)
        .animation(.easeInOut(duration: 0.22), value: isMutationPending)
    }

    private func statusPill(_ status: String) -> some View {
        Text(status.replacingOccurrences(of: "_", with: " "))
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(statusColor(status))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(statusColor(status).opacity(0.2), in: Capsule())
    }

    private func priorityPill(_ priority: String) -> some View {
        Text(priority)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(priorityColor(priority))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(priorityColor(priority).opacity(0.2), in: Capsule())
    }

    private func statusColor(_ status: String) -> Color {
        switch status.uppercased() {
        case "NOT_STARTED": return CloudwrkzColors.neutral400
        case "IN_PROGRESS": return CloudwrkzColors.primary400
        case "BLOCKED": return CloudwrkzColors.warning500
        case "COMPLETED": return CloudwrkzColors.success500
        case "CANCELLED": return CloudwrkzColors.neutral500
        default: return CloudwrkzColors.neutral400
        }
    }

    private func priorityColor(_ priority: String) -> Color {
        switch priority.uppercased() {
        case "URGENT": return CloudwrkzColors.error500
        case "HIGH": return CloudwrkzColors.warning500
        case "MEDIUM": return CloudwrkzColors.warning400
        default: return CloudwrkzColors.neutral400
        }
    }

    private func labelValue(_ label: String, _ value: String) -> some View {
        HStack(spacing: 4) {
            Text("\(label):")
                .foregroundStyle(CloudwrkzColors.neutral400)
            Text(value)
                .foregroundStyle(CloudwrkzColors.neutral100)
        }
    }

    private func formatUser(_ u: Todo.TodoUser) -> String {
        if let n = u.name, !n.isEmpty { return n }
        return String(u.email.prefix(upTo: u.email.firstIndex(of: "@") ?? u.email.endIndex))
    }

    private func formatted(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeStyle = .short
        return f.string(from: date)
    }
}

#Preview {
    NavigationStack {
        TodosOverviewView()
    }
}
