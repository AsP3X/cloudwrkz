//
//  LinksOverviewView.swift
//  Cloudwrkz
//
//  Enterprise links list with filter sheet. Liquid glass, modern enterprise. Matches cloudwrkz links design.
//

import SwiftUI

struct LinksOverviewView: View {
    @State private var links: [Link] = []
    @State private var collections: [Collection] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    /// Shown as banner when pull-to-refresh fails but we keep the current list.
    @State private var refreshErrorMessage: String?
    @State private var filters = LinkFilters()
    @State private var showFilters = false

    private var hasActiveFilters: Bool {
        filters.collectionId != nil
            || filters.isFavorite != .all
            || filters.sort != .newestFirst
    }
    @State private var showAddLink = false
    /// When true, tapping rows toggles selection instead of navigating. Driven by bulk "Select" action.
    @State private var selectionMode = false
    /// Link ids currently selected for bulk actions.
    @State private var selectedLinkIds: Set<String> = []
    /// Link pending deletion confirmation from the context menu.
    @State private var pendingDeleteLink: Link?
    /// Link being edited from the context menu.
    @State private var editingLink: Link?
    /// When true the bulk-delete confirmation dialog is visible.
    @State private var showBulkDeleteConfirm = false
    /// When true the bulk collection assignment sheet is visible.
    @State private var showBulkCollectionPicker = false
    /// When true a bulk action is running – shows a loading overlay.
    @State private var bulkActionInProgress = false
    /// Collection ids chosen in the bulk collection picker.
    @State private var bulkCollectionIds: Set<String> = []
    /// Progress tracking for bulk actions (completed, total).
    @State private var bulkProgress: (completed: Int, total: Int) = (0, 0)

    @Environment(\.appState) private var appState

    var body: some View {
        ZStack {
            background
            if isLoading && links.isEmpty {
                loadingView
            } else if let error = errorMessage {
                errorView(error)
            } else if links.isEmpty {
                emptyView
            } else {
                linkList
                    .safeAreaInset(edge: .top, spacing: 0) {
                        VStack(spacing: 0) {
                            if let refreshErr = refreshErrorMessage {
                                refreshErrorBanner(message: refreshErr)
                            }
                            if !collections.isEmpty || filters.collectionId != nil {
                                collectionPicker
                            }
                        }
                    }
            }
        }
        .navigationTitle("links.nav_title")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .overlay(alignment: .bottomTrailing) {
            if !selectionMode && (!isLoading || !links.isEmpty) {
                addLinkButton
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                if selectionMode {
                    Button("common.done") {
                        selectionMode = false
                        selectedLinkIds.removeAll()
                    }
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                if selectionMode {
                    Button(selectedLinkIds.count == links.count ? String(localized: "links.deselect_all") : String(localized: "links.select_all")) {
                        if selectedLinkIds.count == links.count {
                            selectedLinkIds.removeAll()
                            selectionMode = false
                        } else {
                            selectedLinkIds = Set(links.map(\.id))
                        }
                    }
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.primary400)
                } else {
                    Button {
                        showFilters = true
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(hasActiveFilters ? CloudwrkzColors.warning500 : CloudwrkzColors.primary400)
                    }
                }
            }
        }
        .tint(CloudwrkzColors.primary400)
        .sheet(isPresented: $showFilters) {
            LinkFiltersView(filters: $filters, collections: collections)
                .onDisappear { Task { await loadLinks() } }
        }
        .sheet(isPresented: $showAddLink) {
            AddLinkView(
                collections: collections,
                currentCollectionId: filters.collectionId,
                onSaved: {
                    Task {
                        await loadCollections()
                        await loadLinks()
                    }
                }
            )
        }
        .sheet(item: $editingLink) { link in
            EditLinkView(
                link: link,
                collections: collections,
                serverBaseURL: appState.config.baseURL,
                onSaved: {
                    editingLink = nil
                    Task {
                        await loadCollections()
                        await loadLinks()
                    }
                }
            )
        }
        .sheet(isPresented: $showBulkCollectionPicker) {
            BulkCollectionChooserView(
                collections: collections,
                selectedIds: $bulkCollectionIds,
                linkCount: selectedLinkIds.count,
                onApply: { ids in
                    Task { await performBulkCollectionAssignment(collectionIds: Array(ids)) }
                }
            )
        }
        .onChange(of: showFilters) { _, isOpen in
            if isOpen { Task { await loadCollections() } }
        }
        .onAppear {
            Task { await loadCollections() }
            Task { await loadLinks() }
        }
        .overlay {
            if showBulkDeleteConfirm {
                bulkDeleteConfirmationDialog
            } else if let link = pendingDeleteLink {
                deleteConfirmationDialog(for: link)
            }
        }
        .overlay {
            if bulkActionInProgress {
                bulkActionLoadingOverlay
            }
        }
    }

    /// Floating add-link button, bottom right. Liquid glass style.
    private var addLinkButton: some View {
        Button {
            showAddLink = true
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral950)
                .frame(width: 56, height: 56)
                .background(CloudwrkzColors.primary400, in: Circle())
                .overlay(
                    Circle()
                        .stroke(CloudwrkzColors.glassStroke, lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.25), radius: 8, x: 0, y: 4)
        }
        .buttonStyle(.plain)
        .padding(.trailing, 20)
        .padding(.bottom, 24)
    }

    /// Horizontal scroll of "All" + collection chips. Liquid glass style.
    private var collectionPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                collectionChip(name: "All", id: nil)
                ForEach(collections) { collection in
                    collectionChip(name: collection.name, id: collection.id)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .background(CloudwrkzColors.neutral950.opacity(0.6))
    }

    private func collectionChip(name: String, id: String?) -> some View {
        let isSelected = (filters.collectionId == nil && id == nil) || (filters.collectionId == id)
        return Button {
            filters.collectionId = id
            Task { await loadLinks() }
        } label: {
            Text(name)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(isSelected ? CloudwrkzColors.neutral950 : CloudwrkzColors.neutral100)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    isSelected
                        ? CloudwrkzColors.primary400
                        : Color.clear,
                    in: Capsule()
                )
                .overlay(
                    Capsule()
                        .stroke(isSelected ? Color.clear : CloudwrkzColors.glassStroke, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
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
            Text("links.loading")
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
            Text("links.load_error")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral100)
            Text(message)
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral400)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("todo.retry") { Task { await loadLinks() } }
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.primary400)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "link")
                .font(.system(size: 48))
                .foregroundStyle(CloudwrkzColors.neutral500)
            Text("links.no_links")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral100)
            Text(filters.collectionId != nil
                 ? String(localized: "links.no_links_in_collection")
                 : String(localized: "links.empty_web_hint"))
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral500)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var linkList: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                ForEach(links) { link in
                    let isSelected = selectedLinkIds.contains(link.id)
                    LinkRowView(
                        link: link,
                        serverBaseURL: appState.config.baseURL,
                        isSelected: isSelected,
                        selectionMode: selectionMode
                    )
                    .contentShape(Rectangle())
                    .onTapGesture {
                        if selectionMode {
                            toggleSelection(for: link)
                        }
                    }
                    .contextMenu {
                        Button {
                            toggleSelection(for: link)
                        } label: {
                            Label(isSelected ? String(localized: "links.deselect") : String(localized: "links.select"), systemImage: isSelected ? "minus.circle" : "checkmark.circle")
                        }
                        if !selectionMode {
                            Button {
                                editingLink = link
                            } label: {
                                Label("links.edit", systemImage: "pencil")
                            }
                            Button(role: .destructive) {
                                pendingDeleteLink = link
                            } label: {
                                Label("links.delete", systemImage: "trash")
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
            await withTaskGroup(of: Void.self) { group in
                group.addTask { await loadCollections() }
                group.addTask { await loadLinks(isRefresh: true) }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if selectionMode {
                bulkActionBar
            }
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
            Button("links.dismiss") {
                refreshErrorMessage = nil
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(CloudwrkzColors.primary400)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(CloudwrkzColors.neutral800.opacity(0.95))
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundStyle(CloudwrkzColors.divider),
            alignment: .bottom
        )
    }

    private func loadCollections() async {
        let result = await CollectionService.fetchCollections(config: appState.config, archived: false)
        await MainActor.run {
            if case .success(let list) = result {
                collections = list
            }
        }
    }

    /// When `isRefresh` is true and we already have links, failure shows a banner instead of clearing the list.
    private func loadLinks(isRefresh: Bool = false) async {
        let hadLinks = !links.isEmpty
        if !isRefresh {
            errorMessage = nil
            isLoading = true
        }
        let result = await LinkService.fetchLinks(config: appState.config, filters: filters, page: 1, limit: 100)
        await MainActor.run {
            switch result {
            case .success(let response):
                links = response.links
                errorMessage = nil
                refreshErrorMessage = nil
            case .failure(let err):
                let errText = message(for: err)
                if isRefresh && hadLinks {
                    refreshErrorMessage = errText
                    // Keep existing links
                } else {
                    links = []
                    errorMessage = errText
                }
            }
            isLoading = false
        }
    }

    // MARK: - Link actions for long-press menu / bulk selection

    /// Toggle selection for bulk actions. First selection enables selection mode; clearing all exits it.
    private func toggleSelection(for link: Link) {
        if selectedLinkIds.contains(link.id) {
            selectedLinkIds.remove(link.id)
            if selectedLinkIds.isEmpty {
                selectionMode = false
            }
        } else {
            selectedLinkIds.insert(link.id)
            if !selectionMode {
                selectionMode = true
            }
        }
    }

    // MARK: - Single & bulk link actions

    private func performSingleDelete(id: String) async {
        let result = await LinkService.deleteLink(config: appState.config, id: id)
        await MainActor.run {
            switch result {
            case .success:
                links.removeAll { $0.id == id }
            case .failure:
                refreshErrorMessage = "Failed to delete link."
            }
        }
    }

    private func performBulkDelete() async {
        await MainActor.run { bulkActionInProgress = true }
        let ids = Array(selectedLinkIds)
        var succeededIds: Set<String> = []
        await withTaskGroup(of: (String, Bool).self) { group in
            for id in ids {
                group.addTask {
                    let result = await LinkService.deleteLink(config: appState.config, id: id)
                    switch result {
                    case .success: return (id, true)
                    case .failure: return (id, false)
                    }
                }
            }
            for await (id, success) in group {
                if success { succeededIds.insert(id) }
            }
        }
        let failCount = ids.count - succeededIds.count
        await MainActor.run {
            links.removeAll { succeededIds.contains($0.id) }
            selectedLinkIds.subtract(succeededIds)
            if selectedLinkIds.isEmpty { selectionMode = false }
            bulkActionInProgress = false
            if failCount > 0 {
                refreshErrorMessage = String(format: String(localized: "links.failed_delete"), failCount)
            }
        }
        if !succeededIds.isEmpty {
            await loadCollections()
        }
    }

    private func performBulkCollectionAssignment(collectionIds: [String]) async {
        await MainActor.run { bulkActionInProgress = true }
        let ids = Array(selectedLinkIds)
        var failCount = 0
        await withTaskGroup(of: Bool.self) { group in
            for id in ids {
                group.addTask {
                    let result = await LinkService.updateLink(config: appState.config, id: id, collectionIds: collectionIds)
                    switch result {
                    case .success: return true
                    case .failure: return false
                    }
                }
            }
            for await success in group {
                if !success { failCount += 1 }
            }
        }
        await MainActor.run {
            selectedLinkIds.removeAll()
            selectionMode = false
            bulkActionInProgress = false
            if failCount > 0 {
                refreshErrorMessage = String(format: String(localized: "links.failed_update"), failCount)
            }
        }
        await loadLinks()
        await loadCollections()
    }

    private func performBulkFetchIcons() async {
        let ids = Array(selectedLinkIds)
        await MainActor.run {
            bulkProgress = (0, ids.count)
            bulkActionInProgress = true
        }
        var failCount = 0
        await withTaskGroup(of: Bool.self) { group in
            for id in ids {
                group.addTask {
                    let result = await LinkService.updateLink(config: appState.config, id: id, extractMetadata: true)
                    switch result {
                    case .success: return true
                    case .failure: return false
                    }
                }
            }
            for await success in group {
                if !success { failCount += 1 }
                await MainActor.run {
                    bulkProgress.completed += 1
                }
            }
        }
        await MainActor.run {
            selectedLinkIds.removeAll()
            selectionMode = false
            bulkActionInProgress = false
            bulkProgress = (0, 0)
            if failCount > 0 {
                refreshErrorMessage = String(format: String(localized: "links.failed_refresh"), failCount)
            }
        }
        await loadLinks()
    }

    // MARK: - Bulk action bar (full-width liquid glass dock)

    private var bulkActionBar: some View {
        VStack(spacing: 14) {
            // Selection count badge
            HStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text(String(format: String(localized: "links.selected_count"), selectedLinkIds.count))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(
                Capsule()
                    .fill(CloudwrkzColors.primary500.opacity(0.12))
                    .overlay(
                        Capsule()
                            .stroke(CloudwrkzColors.primary400.opacity(0.25), lineWidth: 1)
                    )
            )
            .frame(maxWidth: .infinity, alignment: .leading)

            // Action buttons
            HStack(spacing: 10) {
                bulkActionButton(
                    icon: "trash",
                    label: "Delete",
                    tint: CloudwrkzColors.error500,
                    glassTint: CloudwrkzColors.error500,
                    glassTintOpacity: 0.1,
                    strokeColor: CloudwrkzColors.error500.opacity(0.3)
                ) {
                    showBulkDeleteConfirm = true
                }
                bulkActionButton(
                    icon: "folder.badge.plus",
                    label: "Assign",
                    tint: CloudwrkzColors.primary400,
                    glassTint: CloudwrkzColors.primary500,
                    glassTintOpacity: 0.08,
                    strokeColor: CloudwrkzColors.primary400.opacity(0.35)
                ) {
                    bulkCollectionIds = []
                    showBulkCollectionPicker = true
                }
                bulkActionButton(
                    icon: "arrow.triangle.2.circlepath",
                    label: "Refresh",
                    tint: CloudwrkzColors.primary400,
                    glassTint: CloudwrkzColors.primary500,
                    glassTintOpacity: 0.08,
                    strokeColor: CloudwrkzColors.primary400.opacity(0.35)
                ) {
                    Task { await performBulkFetchIcons() }
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 12)
        .background(CloudwrkzColors.neutral950.opacity(0.95))
        .overlay(alignment: .top) {
            Rectangle()
                .frame(height: 1)
                .foregroundStyle(CloudwrkzColors.divider)
        }
    }

    private func bulkActionButton(
        icon: String,
        label: String,
        tint: Color,
        glassTint: Color,
        glassTintOpacity: Double,
        strokeColor: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                Text(label)
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundStyle(selectedLinkIds.isEmpty ? CloudwrkzColors.neutral600 : tint)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .background(
                Group {
                    if #available(iOS 26.0, *) {
                        RoundedRectangle(cornerRadius: 14)
                            .fill(.clear)
                            .glassEffect(
                                .regular.tint(glassTint.opacity(glassTintOpacity)),
                                in: RoundedRectangle(cornerRadius: 14)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(strokeColor, lineWidth: 1)
                            )
                    } else {
                        Color.clear
                            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
                            .background(
                                glassTint.opacity(glassTintOpacity * 0.5),
                                in: RoundedRectangle(cornerRadius: 14)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(strokeColor, lineWidth: 1)
                            )
                    }
                }
            )
        }
        .disabled(selectedLinkIds.isEmpty)
        .buttonStyle(.plain)
    }

    // MARK: - Bulk delete confirmation dialog

    private var bulkDeleteConfirmationDialog: some View {
        ZStack {
            Color.black.opacity(0.4)
                .ignoresSafeArea()

            VStack(spacing: 20) {
                VStack(spacing: 12) {
                    HStack(spacing: 10) {
                        Image(systemName: "trash")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.error500)
                        Text(String(format: String(localized: "links.delete_n_links"), selectedLinkIds.count))
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                    }
                    Text("links.delete_links_message")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral400)
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: 12) {
                    Button {
                        showBulkDeleteConfirm = false
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
                        showBulkDeleteConfirm = false
                        Task { await performBulkDelete() }
                    } label: {
                        Text("links.delete")
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

    // MARK: - Bulk action loading overlay

    private var bulkActionLoadingOverlay: some View {
        let hasProgress = bulkProgress.total > 0
        let fraction: CGFloat = hasProgress
            ? CGFloat(bulkProgress.completed) / CGFloat(bulkProgress.total)
            : 0

        return ZStack {
            Color.black.opacity(0.4)
                .ignoresSafeArea()

            VStack(spacing: 18) {
                if hasProgress {
                    // Circular progress ring
                    ZStack {
                        Circle()
                            .stroke(CloudwrkzColors.neutral700, lineWidth: 4)
                        Circle()
                            .trim(from: 0, to: fraction)
                            .stroke(CloudwrkzColors.primary400, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                            .animation(.easeInOut(duration: 0.3), value: bulkProgress.completed)
                        Text("\(bulkProgress.completed)/\(bulkProgress.total)")
                            .font(.system(size: 15, weight: .bold, design: .rounded))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                    }
                    .frame(width: 56, height: 56)
                } else {
                    CloudwrkzSpinner(tint: CloudwrkzColors.primary400)
                        .scaleEffect(1.4)
                }

                Text(hasProgress ? String(localized: "links.refreshing_icons") : String(localized: "links.processing"))
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral400)
            }
            .padding(32)
            .background(
                Group {
                    if #available(iOS 26.0, *) {
                        RoundedRectangle(cornerRadius: 20)
                            .fill(.clear)
                            .glassEffect(.regular.tint(CloudwrkzColors.glassFillHighlight), in: RoundedRectangle(cornerRadius: 20))
                            .overlay(
                                RoundedRectangle(cornerRadius: 20)
                                    .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                            )
                    } else {
                        Color.clear
                            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20))
                            .overlay(
                                RoundedRectangle(cornerRadius: 20)
                                    .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                            )
                    }
                }
            )
        }
    }

    /// Centered liquid-glass confirmation dialog for deleting a link.
    @ViewBuilder
    private func deleteConfirmationDialog(for link: Link) -> some View {
        ZStack {
            // Dimmed backdrop
            Color.black.opacity(0.4)
                .ignoresSafeArea()

            VStack(spacing: 20) {
                VStack(spacing: 12) {
                    HStack(spacing: 10) {
                        Image(systemName: "trash")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.error500)
                        Text("links.delete_link")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                    }
                    Text(String(format: String(localized: "links.delete_link_message"), link.title))
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral400)
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: 12) {
                    Button {
                        pendingDeleteLink = nil
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
                        let linkId = link.id
                        pendingDeleteLink = nil
                        Task { await performSingleDelete(id: linkId) }
                    } label: {
                        Text("links.delete")
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

    private func message(for error: LinkServiceError) -> String {
        switch error {
        case .noServerURL: return "No server configured."
        case .noToken: return "Please sign in again."
        case .unauthorized: return "Session expired. Sign in again."
        case .serverError(let m): return m
        case .networkError: return "Could not reach server."
        }
    }
}

// MARK: - Link row (liquid glass card, type badge; tap opens link detail)

private struct LinkRowView: View {
    let link: Link
    /// Server base URL (e.g. https://cloudwrkz.com). Used to resolve relative favicon paths from the API.
    var serverBaseURL: URL?
    /// When true, shows a subtle selected state for bulk actions.
    var isSelected: Bool = false
    /// When true, the list is in selection mode (driven from parent). Used only for visuals here.
    var selectionMode: Bool = false

    var body: some View {
        Group {
            if selectionMode {
                rowContent
            } else {
                NavigationLink(value: link) {
                    rowContent
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var rowContent: some View {
        ZStack {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    if selectionMode {
                        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 22))
                            .foregroundStyle(isSelected ? CloudwrkzColors.primary400 : CloudwrkzColors.neutral500)
                            .padding(.top, 2)
                    }
                    linkIcon
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            typePill(link.linkType)
                            if link.isFavorite {
                                Image(systemName: "star.fill")
                                    .font(.system(size: 12))
                                    .foregroundStyle(CloudwrkzColors.warning400)
                            }
                        }
                        Text(link.title)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                            .lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if !selectionMode {
                        Image(systemName: "arrow.up.forward")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.primary400)
                    }
                }

                if let desc = link.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral400)
                        .lineLimit(2)
                }

                HStack(spacing: 12) {
                    Text(domainLabel(link.url))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(CloudwrkzColors.primary400)
                        .lineLimit(1)
                    let linkCollections = link.collections ?? []
                    if !linkCollections.isEmpty {
                        let names = linkCollections.prefix(2).map { $0.collection.name }
                        Text(names.joined(separator: ", "))
                            .font(.system(size: 12, weight: .regular))
                            .foregroundStyle(CloudwrkzColors.neutral500)
                            .lineLimit(1)
                    }
                    Text(formatted(link.createdAt))
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral500)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .background(linkRowGlass)
        }
    }

    private var linkIcon: some View {
        let faviconURL = link.faviconURL(serverBaseURL: serverBaseURL)
        return ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(CloudwrkzColors.primary500.opacity(0.15))
                .frame(width: 40, height: 40)
            if let url = faviconURL {
                FaviconImageView(url: url, size: 40, cornerRadius: 10)
            } else {
                defaultLinkFallback
            }
        }
        .frame(width: 40, height: 40)
    }

    /// Default chain-link icon shown when favicon is missing or fails to load.
    private var defaultLinkFallback: some View {
        Image(systemName: "link")
            .font(.system(size: 18))
            .foregroundStyle(CloudwrkzColors.primary400)
    }

    private var linkRowGlass: some View {
        Group {
            if #available(iOS 26.0, *) {
                RoundedRectangle(cornerRadius: 16)
                    .fill(.clear)
                    .glassEffect(.regular.tint(CloudwrkzColors.glassFillHighlight), in: RoundedRectangle(cornerRadius: 16))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(
                                isSelected ? CloudwrkzColors.primary400 : CloudwrkzColors.glassStroke,
                                lineWidth: isSelected ? 2 : 1
                            )
                    )
            } else {
                Color.clear
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(
                                isSelected ? CloudwrkzColors.primary400 : CloudwrkzColors.glassStroke,
                                lineWidth: isSelected ? 2 : 1
                            )
                    )
            }
        }
    }

    private func typePill(_ type: String) -> some View {
        Text(type.replacingOccurrences(of: "_", with: " "))
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(CloudwrkzColors.neutral200)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(CloudwrkzColors.neutral700.opacity(0.8), in: Capsule())
    }

    private func linkTypeIcon(_ type: String) -> String {
        switch type.uppercased() {
        case "VIDEO": return "play.rectangle.fill"
        case "FILE": return "doc.fill"
        case "DOCUMENT": return "doc.text.fill"
        case "IMAGE": return "photo.fill"
        default: return "link"
        }
    }

    private func domainLabel(_ urlString: String) -> String {
        guard let url = URL(string: urlString),
              let host = url.host else { return urlString }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    private func formatted(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeStyle = .short
        return f.string(from: date)
    }
}

// MARK: - Link filters sheet

struct LinkFiltersView: View {
    @Binding var filters: LinkFilters
    var collections: [Collection] = []
    @Environment(\.dismiss) private var dismiss

    private var background: some View {
        LinearGradient(
            colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    private func sectionHeader(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.8)
            .foregroundStyle(CloudwrkzColors.neutral500)
    }

    private func filterRow(title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(title)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Spacer()
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

    var body: some View {
        NavigationStack {
            ZStack {
                background
                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 12) {
                                Image(systemName: "line.3.horizontal.decrease.circle.fill")
                                    .font(.system(size: 28))
                                    .foregroundStyle(CloudwrkzColors.primary400)
                                Text("links.filter_links")
                                    .font(.system(size: 22, weight: .bold))
                                    .foregroundStyle(CloudwrkzColors.neutral100)
                            }
                            Text("links.filter_subtitle")
                                .font(.system(size: 15, weight: .regular))
                                .foregroundStyle(CloudwrkzColors.neutral400)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 4)

                        if !collections.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                sectionHeader(String(localized: "links.collection"))
                                VStack(spacing: 10) {
                                    filterRow(
                                        title: String(localized: "links.all_links"),
                                        isSelected: filters.collectionId == nil
                                    ) {
                                        filters.collectionId = nil
                                    }
                                    ForEach(collections) { collection in
                                        filterRow(
                                            title: collection.name,
                                            isSelected: filters.collectionId == collection.id
                                        ) {
                                            filters.collectionId = collection.id
                                        }
                                    }
                                }
                                .padding(20)
                                .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
                            }
                        }

                        VStack(alignment: .leading, spacing: 12) {
                            sectionHeader(String(localized: "filter_todos.show"))
                            VStack(spacing: 10) {
                                ForEach(LinkFilters.LinkFavoriteFilter.allCases) { option in
                                    filterRow(
                                        title: option.displayName,
                                        isSelected: filters.isFavorite == option
                                    ) {
                                        filters.isFavorite = option
                                    }
                                }
                            }
                            .padding(20)
                            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
                        }

                        VStack(alignment: .leading, spacing: 12) {
                            sectionHeader(String(localized: "filter_todos.sort_by"))
                            VStack(spacing: 10) {
                                ForEach(LinkFilters.LinkSortOption.allCases) { option in
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
}

// MARK: - Bulk collection chooser (presented as sheet)

private struct BulkCollectionChooserView: View {
    @Environment(\.dismiss) private var dismiss
    var collections: [Collection]
    @Binding var selectedIds: Set<String>
    let linkCount: Int
    let onApply: (Set<String>) -> Void

    private var background: some View {
        LinearGradient(
            colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    var body: some View {
        NavigationStack {
            ZStack {
                background
                VStack(spacing: 0) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            Text(String(format: String(localized: "links.choose_collections"), linkCount))
                                .font(.system(size: 15, weight: .regular))
                                .foregroundStyle(CloudwrkzColors.neutral400)

                            if collections.isEmpty {
                                Text("links.no_collections")
                                    .font(.system(size: 15, weight: .regular))
                                    .foregroundStyle(CloudwrkzColors.neutral500)
                                    .padding(20)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
                            } else {
                                VStack(spacing: 0) {
                                    ForEach(collections) { collection in
                                        collectionRow(collection: collection)
                                    }
                                }
                                .padding(20)
                                .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 8)
                        .padding(.bottom, 120)
                    }

                    VStack(spacing: 0) {
                        Rectangle()
                            .frame(height: 1)
                            .foregroundStyle(CloudwrkzColors.divider)

                        Button {
                            onApply(selectedIds)
                            dismiss()
                        } label: {
                            Text(String(format: String(localized: "links.apply_to_links"), linkCount))
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(CloudwrkzColors.neutral950)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(CloudwrkzColors.primary400, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14)
                                        .stroke(CloudwrkzColors.glassStroke, lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 16)
                    }
                    .background(CloudwrkzColors.neutral950.opacity(0.95))
                }
            }
            .navigationTitle("links.assign_collections")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(CloudwrkzColors.neutral950.opacity(0.95), for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("add_todo.cancel") { dismiss() }
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(CloudwrkzColors.neutral400)
                }
            }
            .tint(CloudwrkzColors.primary400)
        }
    }

    private func collectionRow(collection: Collection) -> some View {
        let isSelected = selectedIds.contains(collection.id)
        let hasColor = collection.color.flatMap { c in c.count == 7 && c.hasPrefix("#") } == true
        return Button {
            if isSelected {
                selectedIds.remove(collection.id)
            } else {
                selectedIds.insert(collection.id)
            }
        } label: {
            HStack(spacing: 12) {
                if hasColor, let color = collection.color {
                    Circle()
                        .fill(Color(hex: color))
                        .frame(width: 12, height: 12)
                }
                Text(collection.name)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    NavigationStack {
        LinksOverviewView()
    }
}
