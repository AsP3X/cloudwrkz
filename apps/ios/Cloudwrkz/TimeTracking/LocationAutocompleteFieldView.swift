//
//  LocationAutocompleteFieldView.swift
//  Cloudwrkz
//
//  Location text field with address suggestions (Nominatim + location history).
//  Matches web LocationAutocompleteInput: min 3 chars, debounce, dropdown selection.
//

import SwiftUI

struct LocationAutocompleteFieldView: View {
    @Binding var text: String
    var placeholder: String = "e.g. Office, Remote"
    @Environment(\.appState) private var appState

    @State private var suggestions: [LocationSuggestion] = []
    @State private var isLoading = false
    @State private var showSuggestions = false
    @State private var task: Task<Void, Never>?
    private let debounceNanoseconds: UInt64 = 400_000_000
    private let minQueryLength = 3

    private var trimmedQuery: String {
        text.trimmingCharacters(in: .whitespaces)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "mappin.and.ellipse")
                    .font(.system(size: 16))
                    .foregroundStyle(CloudwrkzColors.neutral400)
                TextField(placeholder, text: $text)
                    .textFieldStyle(.plain)
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .onChange(of: text) { _, newValue in
                        runDebounced(query: newValue)
                    }
                if isLoading {
                    CloudwrkzSpinner(tint: CloudwrkzColors.neutral500)
                        .scaleEffect(0.7)
                }
            }
            .padding(14)
            .glassField(cornerRadius: 12)

            if showSuggestions, !suggestions.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(suggestions) { suggestion in
                        Button {
                            select(suggestion)
                        } label: {
                            Text(suggestion.displayLabel)
                                .font(.system(size: 15, weight: .regular))
                                .foregroundStyle(CloudwrkzColors.neutral100)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 12)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(CloudwrkzColors.neutral900.opacity(0.95))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(CloudwrkzColors.neutral700, lineWidth: 1)
                )
                .padding(.top, 4)
            }
        }
    }

    private func runDebounced(query: String) {
        task?.cancel()
        let t = query.trimmingCharacters(in: .whitespaces)
        if t.count < minQueryLength {
            suggestions = []
            showSuggestions = false
            return
        }
        task = Task {
            try? await Task.sleep(nanoseconds: debounceNanoseconds)
            guard !Task.isCancelled else { return }
            await loadSuggestions(query: t)
        }
    }

    @MainActor
    private func loadSuggestions(query: String) async {
        isLoading = true
        defer { isLoading = false }
        let config = appState.config
        let includeThirdPartySuggestions = AccountSettingsStorage.thirdPartyLocationSuggestionsEnabled
        let result = await LocationAutocompleteService.fetchSuggestions(
            config: config,
            query: query,
            includeThirdPartySuggestions: includeThirdPartySuggestions
        )
        guard !Task.isCancelled else { return }
        suggestions = result
        showSuggestions = !result.isEmpty
    }

    private func select(_ suggestion: LocationSuggestion) {
        let typed = trimmedQuery
        let label = suggestion.displayLabel
        if typed.isEmpty {
            text = label
        } else if label.lowercased().hasPrefix(typed.lowercased()) && label.count > typed.count {
            text = label
        } else {
            text = typed
        }
        showSuggestions = false
        suggestions = []
    }
}
