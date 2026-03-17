//
//  StartTimerSheet.swift
//  Cloudwrkz
//
//  Sheet to start a new running timer. Liquid glass enterprise design.
//  Auto-generates timer name if not provided. Matches web StartTimerDialog.
//

import SwiftUI

struct StartTimerSheet: View {
    var onCreated: (() -> Void)?
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var description = ""
    @State private var location = ""
    @State private var tagInput = ""
    @State private var tags: [String] = []
    @State private var billable = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    @Environment(\.appState) private var appState

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
                    VStack(alignment: .leading, spacing: 20) {
                        headerSection
                        formSection
                        if let error = errorMessage {
                            errorBanner(error)
                        }
                    }
                    .padding(20)
                    .padding(.bottom, 32)
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Start Timer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(CloudwrkzColors.neutral400)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task { await startTimer() }
                    } label: {
                        HStack(spacing: 6) {
                            if isSubmitting {
                                CloudwrkzSpinner(tint: .white)
                                    .scaleEffect(0.7)
                            }
                            Image(systemName: "play.fill")
                                .font(.system(size: 12))
                            Text("Start")
                                .font(.system(size: 17, weight: .semibold))
                        }
                    }
                    .foregroundStyle(CloudwrkzColors.primary400)
                    .disabled(isSubmitting)
                }
            }
            .tint(CloudwrkzColors.primary400)
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack(spacing: 14) {
            Image(systemName: "play.circle.fill")
                .font(.system(size: 36))
                .foregroundStyle(CloudwrkzColors.success500)
            VStack(alignment: .leading, spacing: 4) {
                Text("Start a new timer")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Text("Leave the name blank for an auto-generated ID.")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Form

    private var formSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            fieldGroup("Name (optional)") {
                TextField("Auto-generated if empty", text: $name)
                    .font(.system(size: 15))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .padding(14)
                    .glassField()
            }

            fieldGroup("Description") {
                TextField("What are you working on?", text: $description, axis: .vertical)
                    .font(.system(size: 15))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .lineLimit(3...6)
                    .padding(14)
                    .glassField()
            }

            fieldGroup("Location") {
                LocationAutocompleteFieldView(text: $location, placeholder: "e.g. Office, Remote")
            }

            fieldGroup("Tags") {
                HStack(spacing: 8) {
                    TextField("Add tag…", text: $tagInput)
                        .font(.system(size: 15))
                        .foregroundStyle(CloudwrkzColors.neutral100)
                        .onSubmit { addTag() }

                    if !tagInput.isEmpty {
                        Button { addTag() } label: {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 20))
                                .foregroundStyle(CloudwrkzColors.primary400)
                        }
                    }
                }
                .padding(14)
                .glassField()

                if !tags.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(tags, id: \.self) { tag in
                                HStack(spacing: 4) {
                                    Text(tag)
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(CloudwrkzColors.primary400)
                                    Button {
                                        tags.removeAll { $0 == tag }
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .font(.system(size: 12))
                                            .foregroundStyle(CloudwrkzColors.neutral500)
                                    }
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(CloudwrkzColors.primary400.opacity(0.15), in: Capsule())
                            }
                        }
                    }
                    .padding(.top, 4)
                }
            }

            Toggle(isOn: $billable) {
                HStack(spacing: 8) {
                    Image(systemName: "dollarsign.circle.fill")
                        .foregroundStyle(CloudwrkzColors.success400)
                    Text("Billable")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(CloudwrkzColors.neutral100)
                }
            }
            .tint(CloudwrkzColors.primary500)
            .padding(14)
            .glassField()
        }
        .padding(20)
        .background(formGlass)
    }

    // MARK: - Helpers

    private func fieldGroup<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(CloudwrkzColors.neutral500)
            content()
        }
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(CloudwrkzColors.error500)
            Text(message)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CloudwrkzColors.error500)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CloudwrkzColors.error500.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
    }

    private func addTag() {
        let tag = tagInput.trimmingCharacters(in: .whitespaces)
        if !tag.isEmpty && !tags.contains(tag) {
            tags.append(tag)
        }
        tagInput = ""
    }

    private func startTimer() async {
        isSubmitting = true
        errorMessage = nil

        let input = TimeTrackingService.CreateInput(
            name: name.isEmpty ? nil : name.trimmingCharacters(in: .whitespaces),
            description: description.isEmpty ? nil : description.trimmingCharacters(in: .whitespaces),
            tags: tags.isEmpty ? nil : tags,
            location: location.isEmpty ? nil : location.trimmingCharacters(in: .whitespaces),
            billable: billable ? true : nil
        )

        let result = await TimeTrackingService.createTimeEntry(config: appState.config, input: input)

        await MainActor.run {
            switch result {
            case .success:
                onCreated?()
                dismiss()
            case .failure(let error):
                errorMessage = errorText(error)
            }
            isSubmitting = false
        }
    }

    private func errorText(_ error: TimeTrackingServiceError) -> String {
        switch error {
        case .noServerURL: return "No server configured."
        case .noToken: return "Please sign in again."
        case .unauthorized: return "Session expired."
        case .notFound: return "Time tracking not available."
        case .serverError(let m): return m
        case .networkError: return "Could not reach server."
        }
    }

    private var formGlass: some View {
        Group {
            if #available(iOS 26.0, *) {
                RoundedRectangle(cornerRadius: 20)
                    .fill(.clear)
                    .glassEffect(.regular.tint(CloudwrkzColors.glassFillSubtle), in: RoundedRectangle(cornerRadius: 20))
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
    }
}

#Preview {
    StartTimerSheet()
}
