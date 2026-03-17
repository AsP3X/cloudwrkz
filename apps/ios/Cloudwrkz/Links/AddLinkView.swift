//
//  AddLinkView.swift
//  Cloudwrkz
//
//  Add link sheet. Liquid glass, modern enterprise. Matches Links design language.
//

import SwiftUI

struct AddLinkView: View {
    @Environment(\.dismiss) private var dismiss
    var collections: [Collection]
    var currentCollectionId: String?
    var onSaved: () -> Void

    @State private var urlText = ""
    @State private var titleText = ""
    @State private var descriptionText = ""
    @State private var fetchedFavicon: String?
    @State private var selectedCollectionIds: Set<String> = []
    @State private var showCollectionChooser = false
    @State private var isSaving = false
    @State private var isExtractingMetadata = false
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?
    /// Cancellable task for debounced auto-fetch when URL is pasted or edited.
    @State private var fetchMetadataTask: Task<Void, Never>?

    @Environment(\.appState) private var appState
    private let fetchMetadataDebounceSeconds: UInt64 = 600_000_000 // 0.6s in nanoseconds

    enum Field {
        case url, title, description
    }

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

    private var canSave: Bool {
        let trimmed = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && (trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") || trimmed.contains("."))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                background
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
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
                            .onChange(of: urlText) { _, newValue in
                                scheduleFetchMetadataIfValid(url: newValue)
                            }

                        if isExtractingMetadata {
                            HStack(spacing: 8) {
                                CloudwrkzSpinner(tint: CloudwrkzColors.neutral100)
                                    .scaleEffect(0.9)
                                Text("Extracting title & description…")
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(CloudwrkzColors.neutral400)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                        }

                        sectionLabel("Title (optional)")
                        TextField("Title", text: $titleText)
                            .textFieldStyle(.plain)
                            .font(.system(size: 16, weight: .regular))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                            .focused($focusedField, equals: .title)
                            .padding(14)
                            .glassField(cornerRadius: 12)

                        sectionLabel("Description (optional)")
                        TextField("Description", text: $descriptionText)
                            .textFieldStyle(.plain)
                            .font(.system(size: 16, weight: .regular))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                            .focused($focusedField, equals: .description)
                            .padding(14)
                            .glassField(cornerRadius: 12)

                        if !collections.isEmpty {
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

                        if let err = errorMessage {
                            HStack(spacing: 8) {
                                Image(systemName: "exclamationmark.circle.fill")
                                    .foregroundStyle(CloudwrkzColors.error500)
                                Text(err)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(CloudwrkzColors.neutral100)
                            }
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(CloudwrkzColors.error500.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
            }
            .navigationTitle("Add Link")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundStyle(CloudwrkzColors.primary400)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await save() }
                    }
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(canSave && !isSaving ? CloudwrkzColors.primary400 : CloudwrkzColors.neutral500)
                    .disabled(!canSave || isSaving)
                }
            }
            .tint(CloudwrkzColors.primary400)
            .sheet(isPresented: $showCollectionChooser) {
                AddLinkCollectionChooserView(collections: collections, selectedIds: $selectedCollectionIds)
            }
            .onAppear {
                if let current = currentCollectionId {
                    selectedCollectionIds = [current]
                }
                if urlText.isEmpty {
                    focusedField = .url
                }
            }
        }
    }

    /// Selected collections only, as chips; empty state when none selected.
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

    /// Schedules a single metadata fetch after a short delay when the URL looks valid (e.g. after paste).
    private func scheduleFetchMetadataIfValid(url: String) {
        fetchMetadataTask?.cancel()
        let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            fetchedFavicon = nil
            return
        }
        guard trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") || trimmed.contains("."),
              !isExtractingMetadata else { return }
        fetchMetadataTask = Task {
            try? await Task.sleep(nanoseconds: fetchMetadataDebounceSeconds)
            guard !Task.isCancelled else { return }
            await fetchMetadata()
        }
    }

    private func fetchMetadata() async {
        errorMessage = nil
        var url = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !url.isEmpty && !url.hasPrefix("http://") && !url.hasPrefix("https://") {
            url = "https://" + url
        }
        guard !url.isEmpty else { return }
        isExtractingMetadata = true
        let result = await LinkService.fetchMetadata(config: appState.config, url: url)
        await MainActor.run {
            isExtractingMetadata = false
            switch result {
            case .success(let meta):
                if titleText.isEmpty, let t = meta.title, !t.isEmpty {
                    titleText = t
                }
                if descriptionText.isEmpty, let d = meta.description, !d.isEmpty {
                    descriptionText = d
                }
                fetchedFavicon = meta.favicon
            case .failure(let err):
                errorMessage = message(for: err)
            }
        }
    }

    private func save() async {
        errorMessage = nil
        // Ensure any pending debounced metadata task doesn't race with save.
        fetchMetadataTask?.cancel()

        var url = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !url.isEmpty && !url.hasPrefix("http://") && !url.hasPrefix("https://") {
            url = "https://" + url
        }

        // If we don't have a favicon yet, try one last synchronous metadata fetch
        // so the server can cache and persist favicons like the web app.
        if fetchedFavicon == nil, !url.isEmpty {
            await fetchMetadata()
        }

        isSaving = true
        let collectionIds: [String]? = selectedCollectionIds.isEmpty ? nil : Array(selectedCollectionIds)
        let result = await LinkService.createLink(
            config: appState.config,
            url: url,
            title: titleText.isEmpty ? nil : titleText,
            description: descriptionText.isEmpty ? nil : descriptionText,
            favicon: fetchedFavicon,
            collectionIds: collectionIds
        )
        await MainActor.run {
            isSaving = false
            switch result {
            case .success:
                onSaved()
                dismiss()
            case .failure(let err):
                errorMessage = message(for: err)
            }
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
    AddLinkView(
        collections: [],
        currentCollectionId: nil,
        onSaved: {}
    )
}
