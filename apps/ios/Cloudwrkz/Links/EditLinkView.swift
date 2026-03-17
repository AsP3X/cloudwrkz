//
//  EditLinkView.swift
//  Cloudwrkz
//
//  Edit link sheet. Liquid glass, modern enterprise. Full edit with metadata refetch,
//  favicon preview, link type, tags, notes, rating, collections, favorite toggle.
//

import SwiftUI

struct EditLinkView: View {
    @Environment(\.dismiss) private var dismiss
    let link: Link
    var collections: [Collection]
    var serverBaseURL: URL?
    var onSaved: () -> Void

    // MARK: - Editable fields

    @State private var urlText: String = ""
    @State private var titleText: String = ""
    @State private var descriptionText: String = ""
    @State private var notesText: String = ""
    @State private var selectedLinkType: String = "WEBSITE"
    @State private var tagsText: String = ""
    @State private var isFavorite: Bool = false
    @State private var rating: Int? = nil
    @State private var faviconValue: String? = nil
    @State private var selectedCollectionIds: Set<String> = []

    // MARK: - UI state

    @State private var isSaving = false
    @State private var isRefetchingMetadata = false
    @State private var errorMessage: String?
    @State private var successMessage: String?
    @State private var showCollectionChooser = false
    @State private var hasChanges = false
    @FocusState private var focusedField: Field?

    @Environment(\.appState) private var appState

    private let linkTypes = ["WEBSITE", "FILE", "DOCUMENT", "VIDEO", "IMAGE", "OTHER"]

    enum Field: Hashable {
        case url, title, description, notes, tags
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ZStack {
                background
                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        headerSection

                        if let err = errorMessage {
                            errorBanner(err)
                        }
                        if let msg = successMessage {
                            successBanner(msg)
                        }

                        faviconSection
                        urlSection
                        titleSection
                        descriptionSection
                        linkTypeSection
                        tagsSection
                        notesSection
                        ratingSection
                        favoriteSection
                        if !collections.isEmpty {
                            collectionsSection
                        }
                        metadataRefetchSection
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 40)
                }
                .overlay {
                    if isSaving {
                        savingOverlay
                    }
                }
            }
            .navigationTitle("Edit Link")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(CloudwrkzColors.neutral950.opacity(0.95), for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(CloudwrkzColors.primary400)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(hasChanges && !isSaving ? CloudwrkzColors.primary400 : CloudwrkzColors.neutral500)
                        .disabled(!hasChanges || isSaving)
                }
            }
            .tint(CloudwrkzColors.primary400)
            .sheet(isPresented: $showCollectionChooser) {
                AddLinkCollectionChooserView(collections: collections, selectedIds: $selectedCollectionIds)
            }
            .onAppear { populateFromLink() }
            .onChange(of: urlText) { _, _ in trackChanges() }
            .onChange(of: titleText) { _, _ in trackChanges() }
            .onChange(of: descriptionText) { _, _ in trackChanges() }
            .onChange(of: notesText) { _, _ in trackChanges() }
            .onChange(of: selectedLinkType) { _, _ in trackChanges() }
            .onChange(of: tagsText) { _, _ in trackChanges() }
            .onChange(of: isFavorite) { _, _ in trackChanges() }
            .onChange(of: rating) { _, _ in trackChanges() }
            .onChange(of: faviconValue) { _, _ in trackChanges() }
            .onChange(of: selectedCollectionIds) { _, _ in trackChanges() }
        }
    }

    // MARK: - Sections

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                Image(systemName: "pencil.and.outline")
                    .font(.system(size: 28))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text("Edit link")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            Text("Modify details, refetch metadata, or update collections.")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral400)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }

    private var faviconSection: some View {
        VStack(spacing: 16) {
            faviconPreview
            HStack(spacing: 12) {
                Button {
                    Task { await refetchFavicon() }
                } label: {
                    HStack(spacing: 6) {
                        if isRefetchingMetadata {
                            CloudwrkzSpinner(tint: CloudwrkzColors.primary400)
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        Text("Refetch Icon")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundStyle(CloudwrkzColors.primary400)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .glassButtonSecondary(cornerRadius: 10)
                }
                .buttonStyle(.plain)
                .disabled(isRefetchingMetadata)

                if faviconValue != nil {
                    Button {
                        faviconValue = nil
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "xmark")
                                .font(.system(size: 12, weight: .semibold))
                            Text("Remove")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundStyle(CloudwrkzColors.error500)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .glassButtonSecondary(cornerRadius: 10)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
    }

    @ViewBuilder
    private var faviconPreview: some View {
        let resolvedURL = resolveFaviconURL(faviconValue)
        ZStack {
            RoundedRectangle(cornerRadius: 14)
                .fill(CloudwrkzColors.primary500.opacity(0.1))
                .frame(width: 72, height: 72)
            if let url = resolvedURL {
                FaviconImageView(url: url, size: 72, cornerRadius: 14)
            } else {
                faviconFallback
            }
        }
        .frame(width: 72, height: 72)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
        )
    }

    private var faviconFallback: some View {
        Image(systemName: "link")
            .font(.system(size: 28))
            .foregroundStyle(CloudwrkzColors.primary400)
    }

    private var urlSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("URL")
            TextField("https://example.com", text: $urlText)
                .textFieldStyle(.plain)
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral100)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focusedField, equals: .url)
                .padding(14)
                .glassField(cornerRadius: 12)
        }
    }

    private var titleSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Title")
            TextField("Link title", text: $titleText)
                .textFieldStyle(.plain)
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral100)
                .focused($focusedField, equals: .title)
                .padding(14)
                .glassField(cornerRadius: 12)
        }
    }

    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Description")
            TextField("Brief description", text: $descriptionText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral100)
                .lineLimit(3...6)
                .focused($focusedField, equals: .description)
                .padding(14)
                .glassField(cornerRadius: 12)
        }
    }

    private var linkTypeSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Link Type")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(linkTypes, id: \.self) { type in
                        linkTypePill(type)
                    }
                }
            }
        }
    }

    private func linkTypePill(_ type: String) -> some View {
        let isSelected = selectedLinkType == type
        return Button {
            selectedLinkType = type
        } label: {
            HStack(spacing: 6) {
                Image(systemName: linkTypeIcon(type))
                    .font(.system(size: 12, weight: .semibold))
                Text(type.replacingOccurrences(of: "_", with: " "))
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundStyle(isSelected ? CloudwrkzColors.neutral950 : CloudwrkzColors.neutral200)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(
                isSelected ? CloudwrkzColors.primary400 : Color.clear,
                in: Capsule()
            )
            .overlay(
                Capsule()
                    .stroke(isSelected ? Color.clear : CloudwrkzColors.glassStroke, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var tagsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Tags")
            VStack(alignment: .leading, spacing: 10) {
                TextField("Comma-separated tags", text: $tagsText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .tags)
                    .padding(14)
                    .glassField(cornerRadius: 12)

                let currentTags = parseTags(tagsText)
                if !currentTags.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(currentTags, id: \.self) { tag in
                                tagChip(tag)
                            }
                        }
                    }
                }
            }
        }
    }

    private func tagChip(_ tag: String) -> some View {
        HStack(spacing: 4) {
            Text(tag)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral100)
            Button {
                removeTag(tag)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral400)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(CloudwrkzColors.neutral700.opacity(0.7), in: Capsule())
    }

    private var notesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Notes")
            TextField("Personal notes…", text: $notesText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral100)
                .lineLimit(3...8)
                .focused($focusedField, equals: .notes)
                .padding(14)
                .glassField(cornerRadius: 12)
        }
    }

    private var ratingSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Rating")
            HStack(spacing: 4) {
                ForEach(1...5, id: \.self) { star in
                    Button {
                        if rating == star {
                            rating = nil
                        } else {
                            rating = star
                        }
                    } label: {
                        Image(systemName: star <= (rating ?? 0) ? "star.fill" : "star")
                            .font(.system(size: 28))
                            .foregroundStyle(star <= (rating ?? 0) ? CloudwrkzColors.warning400 : CloudwrkzColors.neutral600)
                    }
                    .buttonStyle(.plain)
                }

                Spacer()

                if rating != nil {
                    Button {
                        rating = nil
                    } label: {
                        Text("Clear")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(CloudwrkzColors.neutral400)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
            .glassPanel(cornerRadius: 16, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    private var favoriteSection: some View {
        HStack(spacing: 14) {
            Image(systemName: isFavorite ? "star.fill" : "star")
                .font(.system(size: 22))
                .foregroundStyle(isFavorite ? CloudwrkzColors.warning400 : CloudwrkzColors.neutral500)

            VStack(alignment: .leading, spacing: 2) {
                Text("Favorite")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Text("Mark this link as a favorite for quick access.")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral400)
            }

            Spacer()

            Toggle("", isOn: $isFavorite)
                .labelsHidden()
                .tint(CloudwrkzColors.primary400)
        }
        .padding(16)
        .glassPanel(cornerRadius: 16, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
    }

    private var collectionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Collections")
            VStack(alignment: .leading, spacing: 12) {
                selectedCollectionsSummary
                Button {
                    showCollectionChooser = true
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "folder.badge.plus")
                            .font(.system(size: 16))
                        Text(selectedCollectionIds.isEmpty ? "Choose collections…" : "Change collections…")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundStyle(CloudwrkzColors.primary400)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .glassButtonSecondary(cornerRadius: 12)
                }
                .buttonStyle(.plain)
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    @ViewBuilder
    private var selectedCollectionsSummary: some View {
        let selected = collections.filter { selectedCollectionIds.contains($0.id) }
        if selected.isEmpty {
            Text("No collections selected")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral500)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(selected) { collection in
                        collectionChip(collection: collection)
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private func collectionChip(collection: Collection) -> some View {
        let hasColor = collection.color.flatMap { c in c.count == 7 && c.hasPrefix("#") } == true
        return HStack(spacing: 6) {
            if hasColor, let color = collection.color {
                Circle()
                    .fill(Color(hex: color))
                    .frame(width: 8, height: 8)
            }
            Text(collection.name)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral100)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(CloudwrkzColors.neutral800.opacity(0.8), in: Capsule())
    }

    private var metadataRefetchSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Metadata")
            VStack(spacing: 14) {
                HStack(spacing: 12) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 20))
                        .foregroundStyle(CloudwrkzColors.primary400)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Refresh Metadata")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                        Text("Re-extract title, description, and icon from the URL.")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(CloudwrkzColors.neutral400)
                    }
                    Spacer()
                }

                Button {
                    Task { await refetchAllMetadata() }
                } label: {
                    HStack(spacing: 8) {
                        if isRefetchingMetadata {
                            CloudwrkzSpinner(tint: CloudwrkzColors.neutral950)
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        Text(isRefetchingMetadata ? "Fetching…" : "Refetch All Metadata")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundStyle(CloudwrkzColors.neutral950)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .glassButtonPrimary(cornerRadius: 12)
                }
                .buttonStyle(.plain)
                .disabled(isRefetchingMetadata)
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    // MARK: - Helpers

    private var background: some View {
        LinearGradient(
            colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.8)
            .foregroundStyle(CloudwrkzColors.neutral500)
    }

    private var savingOverlay: some View {
        Color.black.opacity(0.4)
            .ignoresSafeArea()
            .overlay {
                VStack(spacing: 16) {
                    CloudwrkzSpinner(tint: CloudwrkzColors.neutral100)
                        .scaleEffect(1.3)
                    Text("Saving changes…")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(CloudwrkzColors.neutral200)
                }
                .padding(28)
                .glassPanel(cornerRadius: 20)
            }
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(CloudwrkzColors.error500)
            Text(message)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral100)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CloudwrkzColors.error500.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
    }

    private func successBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(CloudwrkzColors.success400)
            Text(message)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral100)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CloudwrkzColors.success400.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
    }

    private func linkTypeIcon(_ type: String) -> String {
        switch type.uppercased() {
        case "WEBSITE": return "globe"
        case "VIDEO": return "play.rectangle.fill"
        case "FILE": return "doc.fill"
        case "DOCUMENT": return "doc.text.fill"
        case "IMAGE": return "photo.fill"
        case "OTHER": return "ellipsis.circle.fill"
        default: return "link"
        }
    }

    private func parseTags(_ text: String) -> [String] {
        text.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    private func removeTag(_ tag: String) {
        var current = parseTags(tagsText)
        current.removeAll { $0 == tag }
        tagsText = current.joined(separator: ", ")
    }

    private func resolveFaviconURL(_ favicon: String?) -> URL? {
        let raw = (favicon ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return nil }
        if raw.hasPrefix("//") { return URL(string: "https:" + raw) }
        if raw.hasPrefix("/") {
            let path = raw.replacingOccurrences(of: "/uploads/favicons/", with: "/api/favicons/")
            if let base = serverBaseURL {
                return URL(string: path, relativeTo: base)?.absoluteURL
            }
            return nil
        }
        return URL(string: raw)
    }

    // MARK: - Data flow

    private func populateFromLink() {
        urlText = link.url
        titleText = link.title
        descriptionText = link.description ?? ""
        notesText = link.notes ?? ""
        selectedLinkType = link.linkType
        tagsText = link.tags.joined(separator: ", ")
        isFavorite = link.isFavorite
        rating = link.rating
        faviconValue = link.favicon
        let linkCollections = link.collections ?? []
        selectedCollectionIds = Set(linkCollections.map { $0.collection.id })
        hasChanges = false
    }

    private func trackChanges() {
        let linkCollections = link.collections ?? []
        let originalCollectionIds = Set(linkCollections.map { $0.collection.id })
        let currentTags = parseTags(tagsText)

        hasChanges =
            urlText != link.url ||
            titleText != link.title ||
            descriptionText != (link.description ?? "") ||
            notesText != (link.notes ?? "") ||
            selectedLinkType != link.linkType ||
            currentTags != link.tags ||
            isFavorite != link.isFavorite ||
            rating != link.rating ||
            faviconValue != link.favicon ||
            selectedCollectionIds != originalCollectionIds
    }

    // MARK: - Network

    private func refetchFavicon() async {
        errorMessage = nil
        successMessage = nil
        var url = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !url.isEmpty && !url.hasPrefix("http://") && !url.hasPrefix("https://") {
            url = "https://" + url
        }
        guard !url.isEmpty else { return }

        isRefetchingMetadata = true
        let result = await LinkService.fetchMetadata(config: appState.config, url: url)
        isRefetchingMetadata = false
        switch result {
        case .success(let meta):
            if let f = meta.favicon, !f.isEmpty {
                faviconValue = f
                successMessage = "Icon updated."
            } else {
                errorMessage = "No icon found for this URL."
            }
        case .failure(let err):
            errorMessage = message(for: err)
        }
    }

    private func refetchAllMetadata() async {
        errorMessage = nil
        successMessage = nil
        var url = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !url.isEmpty && !url.hasPrefix("http://") && !url.hasPrefix("https://") {
            url = "https://" + url
        }
        guard !url.isEmpty else { return }

        isRefetchingMetadata = true
        let result = await LinkService.fetchMetadata(config: appState.config, url: url)
        isRefetchingMetadata = false
        switch result {
        case .success(let meta):
            var updated: [String] = []
            if let t = meta.title, !t.isEmpty {
                titleText = t
                updated.append("title")
            }
            if let d = meta.description, !d.isEmpty {
                descriptionText = d
                updated.append("description")
            }
            if let f = meta.favicon, !f.isEmpty {
                faviconValue = f
                updated.append("icon")
            }
            if updated.isEmpty {
                errorMessage = "No metadata found for this URL."
            } else {
                successMessage = "Updated \(updated.joined(separator: ", "))."
            }
        case .failure(let err):
            errorMessage = message(for: err)
        }
    }

    private func save() async {
        errorMessage = nil
        successMessage = nil
        isSaving = true

        // Build the delta – only send fields that actually changed.
        var url: String? = nil
        let trimmedURL = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedURL != link.url {
            var formatted = trimmedURL
            if !formatted.isEmpty && !formatted.hasPrefix("http://") && !formatted.hasPrefix("https://") {
                formatted = "https://" + formatted
            }
            url = formatted
        }

        let title: String? = titleText != link.title ? titleText : nil
        let description: String? = descriptionText != (link.description ?? "") ? descriptionText : nil
        let notes: String? = notesText != (link.notes ?? "") ? notesText : nil
        let linkType: String? = selectedLinkType != link.linkType ? selectedLinkType : nil
        let currentTags = parseTags(tagsText)
        let tags: [String]? = currentTags != link.tags ? currentTags : nil
        let fav: Bool? = isFavorite != link.isFavorite ? isFavorite : nil
        let ratingVal: Int?? = rating != link.rating ? .some(rating) : nil
        let favicon: String? = faviconValue != link.favicon ? (faviconValue ?? "") : nil

        let linkCollections = link.collections ?? []
        let originalCollectionIds = Set(linkCollections.map { $0.collection.id })
        let collectionIds: [String]? = selectedCollectionIds != originalCollectionIds ? Array(selectedCollectionIds) : nil

        let result = await LinkService.updateLink(
            config: appState.config,
            id: link.id,
            url: url,
            title: title,
            description: description,
            favicon: favicon,
            linkType: linkType,
            tags: tags,
            notes: notes,
            isFavorite: fav,
            rating: ratingVal,
            collectionIds: collectionIds
        )

        isSaving = false
        switch result {
        case .success:
            onSaved()
        case .failure(let err):
            errorMessage = message(for: err)
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

#Preview {
    EditLinkView(
        link: Link(
            id: "1",
            title: "Example",
            url: "https://example.com",
            description: "An example link",
            favicon: nil,
            linkType: "WEBSITE",
            tags: ["dev", "reference"],
            notes: "Some notes",
            isFavorite: false,
            rating: 3,
            archivedAt: nil,
            createdAt: Date(),
            updatedAt: Date(),
            collections: nil
        ),
        collections: [],
        serverBaseURL: nil,
        onSaved: {}
    )
}
