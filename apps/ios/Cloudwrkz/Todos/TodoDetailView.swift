//
//  TodoDetailView.swift
//  Cloudwrkz
//
//  Enterprise todo detail with glass panels. Matches cloudwrkz todo detail layout.
//

import SwiftUI

// Human: Subtasks inherit the same optimistic patterns as top-level todos so nested work doesn’t feel “second class” in the UI.
// Agent: TodoDetailView @State todo; subtodos list SubtodoListItem; creatingPlaceholder; sheets add/edit; TodoService mutations appState.

private struct OptimisticPendingSubtodo: Identifiable {
    let id: UUID
    let title: String
    let description: String?
}

private enum SubtodoListItem: Identifiable {
    case completedHeader
    case subtask(Todo.TodoSubtask)
    /// Matches API `ORDER BY "order" ASC, created_at ASC` — new subtodo appears after existing actives.
    case creatingPlaceholder(id: UUID, title: String)

    var id: String {
        switch self {
        case .completedHeader: return "completed-header"
        case .subtask(let s): return s.id
        case .creatingPlaceholder(let cid, _): return "creating-\(cid.uuidString)"
        }
    }
}

struct TodoDetailView: View {
    // Human: Detail keeps its own copy of `todo` in `@State` so optimistic PATCH responses can animate without popping navigation.
    // Agent: @State todo mutations refresh; showAddTodo sheet; sidebar info toggle; scroll sections priority status dates.

    @Environment(\.appState) private var appState
    @State private var todo: Todo
    @State private var showTodoInfoSidebar = false
    @State private var showAddTodo = false
    @State private var addTodoCreateErrorMessage: String?
    /// One row per in-flight POST; supports opening the add sheet again before prior creates finish.
    @State private var optimisticPendingSubtodos: [OptimisticPendingSubtodo] = []
    @State private var mutationTitleCarousel = MutationTitleCarouselState()

    init(todo: Todo) {
        _todo = State(initialValue: todo)
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()

    // Human: Safe area inset hosts the sticky header/actions so long todo bodies scroll while controls stay reachable on small phones.
    // Agent: ZStack ScrollView headerSection contentGrid; safeAreaInset top toolbar; sheets showAddTodo; subtodos section mutations TodoService.

    var body: some View {
        ZStack {
            background
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    headerSection
                    contentGrid
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
        .scrollContentBackground(.hidden)
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if let msg = addTodoCreateErrorMessage {
                addTodoErrorBanner(message: msg)
            }
        }
        .mutationJobNavigationTitle(LocalizedStringKey(todo.todoNumber ?? todo.title), state: mutationTitleCarousel)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                HStack(spacing: 16) {
                    Button {
                        showAddTodo = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 22))
                    }
                    Button {
                        showTodoInfoSidebar = true
                    } label: {
                        Image(systemName: "info.circle")
                            .font(.system(size: 20))
                    }
                }
            }
        }
        .sheet(isPresented: $showTodoInfoSidebar) {
            TodoInfoSidebarView(todo: todo)
        }
        .sheet(isPresented: $showAddTodo) {
            AddTodoView(
                parentTodoId: todo.id,
                parentTodoTitle: todo.title,
                mutationHooks: todoMutationHooks(),
                onCreateStarted: { correlationId, title, description in
                    optimisticPendingSubtodos.append(
                        OptimisticPendingSubtodo(id: correlationId, title: title, description: description)
                    )
                },
                onSaved: { _, correlationId in
                    Task { await handleSubtodoCreated(completedCorrelationId: correlationId) }
                },
                onCreateFailed: { msg, correlationId in
                    Task { @MainActor in
                        optimisticPendingSubtodos.removeAll { $0.id == correlationId }
                        addTodoCreateErrorMessage = msg
                    }
                }
            )
        }
        .tint(CloudwrkzColors.primary400)
        .task { await loadTodo() }
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

    private func addTodoErrorBanner(message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(CloudwrkzColors.warning500)
            Text(message)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral100)
            Spacer()
            Button(String(localized: "links.dismiss")) {
                addTodoCreateErrorMessage = nil
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(CloudwrkzColors.primary400)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(CloudwrkzColors.neutral800.opacity(0.95))
    }

    private func loadTodo() async {
        let result = await TodoService.fetchTodo(config: appState.config, id: todo.id)
        await MainActor.run {
            if case .success(let updated) = result {
                withAnimation(.easeInOut(duration: 0.25)) {
                    todo = updated
                }
                pruneOptimisticPendingSubtodosAlreadyRepresented(in: updated)
            }
        }
    }

    /// After one subtodo’s create finishes, GET may already include **other** in-flight subtodos. Drop any placeholder
    /// whose title is satisfied by a non-completed subtask in the payload so we never show spinner + real row for the same item.
    private func pruneOptimisticPendingSubtodosAlreadyRepresented(in updated: Todo) {
        guard !optimisticPendingSubtodos.isEmpty else { return }
        var activePool = (updated.subtodos ?? []).filter { $0.status != "COMPLETED" }
        var kept: [OptimisticPendingSubtodo] = []
        for p in optimisticPendingSubtodos {
            let pNorm = Self.normalizedSubtodoTitle(p.title)
            if let idx = activePool.firstIndex(where: { Self.normalizedSubtodoTitle($0.title) == pNorm }) {
                activePool.remove(at: idx)
            } else {
                kept.append(p)
            }
        }
        optimisticPendingSubtodos = kept
    }

    private static func normalizedSubtodoTitle(_ s: String) -> String {
        s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// After creating a subtodo: drop the matching optimistic row, fetch parent, then update `todo` with nil animation
    /// so a placeholder and the new real row never sit in the list together (no crossfaded “duplicate” row).
    private func handleSubtodoCreated(completedCorrelationId: UUID) async {
        let parentId = todo.id
        await MainActor.run {
            optimisticPendingSubtodos.removeAll { $0.id == completedCorrelationId }
        }
        let result = await TodoService.fetchTodo(config: appState.config, id: parentId)
        await MainActor.run {
            if case .success(let updated) = result {
                withAnimation(nil) {
                    todo = updated
                }
                pruneOptimisticPendingSubtodosAlreadyRepresented(in: updated)
            }
        }
    }

    /// Reloads todo after marking complete. When `immediate` is true (e.g. checkmark icon tap), no delay and quick animation.
    private func loadTodoAfterComplete(immediate: Bool = false) async {
        if !immediate {
            try? await Task.sleep(nanoseconds: 400_000_000)
        }
        let result = await TodoService.fetchTodo(config: appState.config, id: todo.id)
        await MainActor.run {
            if case .success(let updated) = result {
                withAnimation(.easeInOut(duration: immediate ? 0.25 : 1.4)) {
                    todo = updated
                }
                pruneOptimisticPendingSubtodosAlreadyRepresented(in: updated)
            }
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

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                if let num = todo.todoNumber, !num.isEmpty {
                    Text(num)
                        .font(.system(size: 14, weight: .semibold, design: .monospaced))
                        .foregroundStyle(CloudwrkzColors.primary400)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(CloudwrkzColors.primary400.opacity(0.15), in: Capsule())
                }
                HStack(spacing: 6) {
                    statusPill(todo.status)
                    priorityPill(todo.priority)
                }
            }
            Text(todo.title)
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(CloudwrkzColors.neutral100)
                .fixedSize(horizontal: false, vertical: true)
            Text(String(format: String(localized: "common.created_date"), Self.dateFormatter.string(from: todo.createdAt)))
                .font(.system(size: 13, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral400)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .glassCard(cornerRadius: 20)
    }

    private var contentGrid: some View {
        mainColumn
    }

    private var mainColumn: some View {
        VStack(alignment: .leading, spacing: 16) {
            descriptionCard
            ticketLinkCard
            subtodosSection
        }
    }

    private var activeSubtodos: [Todo.TodoSubtask] {
        (todo.subtodos ?? []).filter { $0.status != "COMPLETED" }
    }

    private var completedSubtodos: [Todo.TodoSubtask] {
        (todo.subtodos ?? []).filter { $0.status == "COMPLETED" }
    }

    /// Active first (plus optimistic create rows at end, in creation order), then a "Completed" header, then completed.
    private var subtodoListItems: [SubtodoListItem] {
        var active: [SubtodoListItem] = activeSubtodos.map { .subtask($0) }
        for pending in optimisticPendingSubtodos {
            active.append(.creatingPlaceholder(id: pending.id, title: pending.title))
        }
        let header: [SubtodoListItem] = completedSubtodos.isEmpty ? [] : [.completedHeader]
        let completed: [SubtodoListItem] = completedSubtodos.map { .subtask($0) }
        return active + header + completed
    }

    private var descriptionCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "doc.text.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text("common.description")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            if let desc = todo.descriptionPlain ?? todo.description, !desc.isEmpty {
                Text(desc)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral200)
                    .lineSpacing(6)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text("common.no_description")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
                    .italic()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(cornerRadius: 20)
    }

    private var ticketLinkCard: some View {
        Group {
            if let ticket = todo.ticket {
                HStack(spacing: 12) {
                    Image(systemName: "ticket.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(CloudwrkzColors.primary400.opacity(0.8))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("common.linked_ticket")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                        Text("\(ticket.ticketNumber) – \(ticket.title)")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(CloudwrkzColors.neutral400)
                            .lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
                .glassCard(cornerRadius: 20)
            }
        }
    }

    private var subtodosSection: some View {
        // `sectionLabel` applies bottom padding; avoid stacking extra VStack spacing (was overlapping with a forced min height).
        VStack(alignment: .leading, spacing: 0) {
            sectionLabel(String(localized: "common.subtodos"))
            if subtodoListItems.isEmpty {
                subtodoPlaceholderRow
                    .padding(.horizontal, 4)
            } else {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(subtodoListItems) { item in
                        switch item {
                        case .completedHeader:
                            Text("todo.completed_header")
                                .font(.system(size: 11, weight: .bold))
                                .tracking(0.8)
                                .foregroundStyle(CloudwrkzColors.neutral500)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, 12)
                                .padding(.leading, 4)
                                .padding(.bottom, 4)
                        case .creatingPlaceholder(_, let title):
                            SubtodoCreatingPlaceholderRow(title: title)
                                .padding(.horizontal, 4)
                        case .subtask(let subtodo):
                            if subtodo.status == "COMPLETED" {
                                NavigationLink(destination: TodoDetailLoaderView(todoId: subtodo.id)) {
                                    completedSubtodoRow(subtodo)
                                }
                                .buttonStyle(.plain)
                                .padding(.horizontal, 4)
                                .contextMenu {
                                    Button(role: .destructive) {
                                        Task { await deleteSubtodo(subtodo.id) }
                                    } label: {
                                        Label(String(localized: "todo.delete"), systemImage: "trash")
                                    }
                                }
                            } else {
                                NavigationLink(destination: TodoDetailLoaderView(todoId: subtodo.id)) {
                                    subtodoSettingsRow(subtodo)
                                }
                                .buttonStyle(.plain)
                                .padding(.horizontal, 4)
                                .contextMenu {
                                    Button {
                                        Task { await completeSubtodo(subtodo.id) }
                                    } label: {
                                        Label(String(localized: "todo.context_complete"), systemImage: "checkmark.circle")
                                    }
                                    Button(role: .destructive) {
                                        Task { await deleteSubtodo(subtodo.id) }
                                    } label: {
                                        Label(String(localized: "todo.delete"), systemImage: "trash")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Row for a completed subtodo: empty checkmark circle (tappable to uncomplete), strikethrough title, muted. List provides disclosure chevron.
    private func completedSubtodoRow(_ subtodo: Todo.TodoSubtask) -> some View {
        HStack(spacing: 14) {
            Button {
                Task { await uncompleteSubtodo(subtodo.id, immediate: true) }
            } label: {
                Image(systemName: "checkmark.circle")
                    .font(.system(size: 20))
                    .foregroundStyle(CloudwrkzColors.success500)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 2) {
                Text(subtodo.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral400)
                    .strikethrough(true, color: CloudwrkzColors.neutral500)
                    .lineLimit(2)
                Text(subtodoStatusSubtitle(subtodo))
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func completeSubtodo(_ id: String, immediate: Bool = false) async {
        let result = await TodoService.updateTodo(
            config: appState.config,
            id: id,
            status: "COMPLETED",
            mutationHooks: todoMutationHooks()
        )
        guard case .success = result else { return }
        await loadTodoAfterComplete(immediate: immediate)
    }

    private func uncompleteSubtodo(_ id: String, immediate: Bool = false) async {
        let result = await TodoService.updateTodo(
            config: appState.config,
            id: id,
            status: "IN_PROGRESS",
            mutationHooks: todoMutationHooks()
        )
        guard case .success = result else { return }
        await loadTodoAfterComplete(immediate: immediate)
    }

    private func deleteSubtodo(_ id: String) async {
        let result = await TodoService.deleteTodo(
            config: appState.config,
            id: id,
            mutationHooks: todoMutationHooks()
        )
        await MainActor.run {
            if case .failure = result {
                // Optionally show an error
            }
        }
        await loadTodo()
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.8)
            .foregroundStyle(CloudwrkzColors.neutral500)
            .padding(.bottom, 8)
    }

    private var settingsDivider: some View {
        Rectangle()
            .fill(CloudwrkzColors.divider)
            .frame(height: 1)
    }

    /// One subtodo as a row: empty circle icon (tappable to complete), title, subtitle. List provides disclosure chevron.
    private func subtodoSettingsRow(_ subtodo: Todo.TodoSubtask) -> some View {
        HStack(spacing: 14) {
            Button {
                Task { await completeSubtodo(subtodo.id, immediate: true) }
            } label: {
                Image(systemName: "circle")
                    .font(.system(size: 20))
                    .foregroundStyle(CloudwrkzColors.neutral500)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 2) {
                Text(subtodo.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .lineLimit(2)
                Text(subtodoStatusSubtitle(subtodo))
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func subtodoStatusSubtitle(_ subtodo: Todo.TodoSubtask) -> String {
        let status = subtodo.status.replacingOccurrences(of: "_", with: " ").lowercased()
        let priority = subtodo.priority
        return "\(status) · \(priority)"
    }

    private var subtodoPlaceholderRow: some View {
        HStack(spacing: 14) {
            Image(systemName: "checkmark.circle")
                .font(.system(size: 20))
                .foregroundStyle(CloudwrkzColors.neutral500)
                .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text("common.no_subtodos")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Text("common.tap_plus_to_add")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func statusPill(_ status: String) -> some View {
        Text(status.replacingOccurrences(of: "_", with: " "))
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(statusColor(status))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(statusColor(status).opacity(0.2), in: Capsule())
    }

    private func priorityPill(_ priority: String) -> some View {
        Text(priority)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(priorityColor(priority))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
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
}

// MARK: - Optimistic subtodo row (matches `subtodoSettingsRow` + top-trailing spinner)

private struct SubtodoCreatingPlaceholderRow: View {
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
    }
}

// MARK: - Todo info sidebar (sheet)

private struct TodoInfoSidebarView: View {
    @Environment(\.appState) private var appState
    let todo: Todo
    @Environment(\.dismiss) private var dismiss
    @State private var fetchedParentTitle: String?
    @State private var fetchedParentTodoNumber: String?

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        if todo.parentTodoId != nil {
                            parentTodoCard
                        }
                        todoInfoContent
                    }
                    .padding(20)
                    .padding(.bottom, 32)
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("common.todo_info")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("common.done") {
                        dismiss()
                    }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
            .tint(CloudwrkzColors.primary400)
        }
        .task(id: todo.parentTodoId) {
            await loadParentTitleIfNeeded()
        }
    }

    private func loadParentTitleIfNeeded() async {
        guard let parentId = todo.parentTodoId else { return }
        if todo.parentTodo?.title != nil || todo.parentTodo?.todoNumber != nil { return }
        let result = await TodoService.fetchTodo(config: appState.config, id: parentId)
        await MainActor.run {
            if case .success(let parent) = result {
                fetchedParentTitle = parent.title
                fetchedParentTodoNumber = parent.todoNumber
            }
        }
    }

    private var todoInfoContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 8) {
                Image(systemName: "info.circle.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text("common.todo_info")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            VStack(alignment: .leading, spacing: 14) {
                if let num = todo.todoNumber {
                    infoRow(label: String(localized: "common.todo_id"), value: num, mono: true)
                }
                infoRow(label: String(localized: "common.status"), value: todo.status.replacingOccurrences(of: "_", with: " "))
                infoRow(label: String(localized: "common.priority"), value: todo.priority)
                sidebarDivider
                infoRow(label: String(localized: "common.assigned_to"), value: formatAssignedTo())
                sidebarDivider
                infoRow(label: String(localized: "todo.created"), value: Self.dateFormatter.string(from: todo.createdAt))
                if todo.updatedAt != todo.createdAt {
                    infoRow(label: String(localized: "common.last_updated"), value: Self.dateFormatter.string(from: todo.updatedAt))
                }
                if let due = todo.dueDate {
                    sidebarDivider
                    infoRow(label: String(localized: "common.due_date"), value: Self.dateFormatter.string(from: due))
                }
                if let completed = todo.completedDate {
                    infoRow(label: String(localized: "common.completed"), value: Self.dateFormatter.string(from: completed))
                }
                if todo.subtodosDisplayCount > 0 {
                    sidebarDivider
                    HStack(spacing: 6) {
                        Image(systemName: "list.bullet.indent")
                            .font(.system(size: 12))
                            .foregroundStyle(CloudwrkzColors.neutral400)
                        Text(todo.subtodosDisplayCount == 1 ? String(format: String(localized: "common.subtodo_count"), todo.subtodosDisplayCount) : String(format: String(localized: "common.subtodos_count"), todo.subtodosDisplayCount))
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(CloudwrkzColors.neutral200)
                    }
                }
                if todo.ticket != nil {
                    sidebarDivider
                    infoRow(label: String(localized: "common.linked_ticket"), value: todo.ticket!.ticketNumber)
                }
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(cornerRadius: 20)
    }

    private func infoRow(label: String, value: String, mono: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(CloudwrkzColors.neutral500)
            Text(value)
                .font(.system(size: 14, weight: mono ? .semibold : .regular, design: mono ? .monospaced : .default))
                .foregroundStyle(CloudwrkzColors.neutral100)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var parentTodoCard: some View {
        Group {
            if let parentId = todo.parentTodoId {
                parentTodoRow(parentId: parentId)
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(cornerRadius: 20)
    }

    private func parentTodoRow(parentId: String) -> some View {
        let number = todo.parentTodo?.todoNumber ?? fetchedParentTodoNumber
        let name = todo.parentTodo?.title ?? fetchedParentTitle
        let displayText = "\(number ?? "…") - \(name ?? "…")"
        let hasNumber = number != nil
        return NavigationLink(destination: TodoDetailLoaderView(todoId: parentId)) {
            HStack(spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.up.doc")
                        .font(.system(size: 16))
                        .foregroundStyle(CloudwrkzColors.primary400)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("common.parent_todo")
                            .font(.system(size: 10, weight: .semibold))
                            .tracking(0.6)
                            .foregroundStyle(CloudwrkzColors.neutral500)
                        Text(displayText)
                            .font(.system(size: 14, weight: hasNumber ? .semibold : .regular, design: hasNumber ? .monospaced : .default))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
        }
        .buttonStyle(.plain)
    }

    private var sidebarDivider: some View {
        Rectangle()
            .fill(CloudwrkzColors.neutral700.opacity(0.6))
            .frame(height: 1)
    }

    private func formatAssignedTo() -> String {
        guard let assignee = todo.assignedTo else { return String(localized: "todo.unassigned") }
        if let n = assignee.name, !n.isEmpty { return n }
        return String(assignee.email.prefix(upTo: assignee.email.firstIndex(of: "@") ?? assignee.email.endIndex))
    }
}

// MARK: - Todo detail by ID (loads then shows detail; used when navigating from subtodo row)

struct TodoDetailLoaderView: View {
    @Environment(\.appState) private var appState
    let todoId: String
    @State private var todo: Todo?
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let todo = todo {
                TodoDetailView(todo: todo)
            } else if let error = errorMessage {
                errorView(error)
            } else {
                loadingView
            }
        }
        .task { await loadTodo() }
    }

    private func loadTodo() async {
        let result = await TodoService.fetchTodo(config: appState.config, id: todoId)
        await MainActor.run {
            switch result {
            case .success(let loaded):
                todo = loaded
                errorMessage = nil
            case .failure(let err):
                todo = nil
                errorMessage = message(for: err)
            }
        }
    }

    private var loadingView: some View {
        ZStack {
            LinearGradient(
                colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
            VStack(spacing: 16) {
                CloudwrkzSpinner(tint: CloudwrkzColors.primary400)
                    .scaleEffect(1.2)
                Text("common.loading")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral400)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func errorView(_ message: String) -> some View {
        ZStack {
            LinearGradient(
                colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(CloudwrkzColors.warning500)
                Text("common.load_todo_error")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Text(message)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral400)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
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
}

#Preview {
    let json = """
    {"id":"preview-1","todoNumber":"#TDO-000042","title":"Implement todo view for the iOS app","description":"Add overview and detail matching ticket view.","descriptionPlain":"Add overview and detail matching ticket view.","status":"IN_PROGRESS","priority":"HIGH","estimatedHours":null,"startDate":null,"dueDate":null,"completedDate":null,"createdAt":"2025-01-15T12:00:00Z","updatedAt":"2025-01-15T12:00:00Z","parentTodoId":null,"ticketId":null,"assignedToId":"u1","assignedTo":{"id":"u1","name":"Jane Doe","email":"jane@example.com"},"ticket":{"id":"t1","ticketNumber":"TKT-001","title":"Sample ticket"},"subtodos":[{"id":"st1","title":"Design detail layout","status":"COMPLETED","priority":"MEDIUM"},{"id":"st2","title":"Implement glass panels","status":"IN_PROGRESS","priority":"HIGH"}],"_count":{"subtodos":2}}
    """
    let data = Data(json.utf8)
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    guard let todo = try? decoder.decode(Todo.self, from: data) else {
        return Text("preview.unavailable")
    }
    return NavigationStack {
        TodoDetailView(todo: todo)
    }
}
