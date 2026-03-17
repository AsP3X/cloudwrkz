//
//  AddTodoView.swift
//  Cloudwrkz
//
//  Add todo (or subtodo) sheet. Liquid glass, modern enterprise. Matches todo design language.
//

import SwiftUI

struct AddTodoView: View {
    @Environment(\.dismiss) private var dismiss
    /// When set, creates a subtodo under this parent.
    var parentTodoId: String?
    var parentTodoTitle: String?
    var onSaved: () -> Void

    @State private var titleText = ""
    @State private var descriptionText = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?

    @Environment(\.appState) private var appState

    enum Field {
        case title, description
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
        !titleText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var navigationTitle: String {
        parentTodoId != nil ? String(localized: "add_todo.subtodo_title") : String(localized: "add_todo.title")
    }

    var body: some View {
        NavigationStack {
            ZStack {
                background
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        if parentTodoId != nil, let parentTitle = parentTodoTitle, !parentTitle.isEmpty {
                            sectionLabel(String(localized: "add_todo.parent_label"))
                            HStack(spacing: 8) {
                                Image(systemName: "list.bullet.indent")
                                    .font(.system(size: 14))
                                    .foregroundStyle(CloudwrkzColors.primary400)
                                Text(parentTitle)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(CloudwrkzColors.neutral200)
                                    .lineLimit(2)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .glassPanel(cornerRadius: 12, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
                        }

                        sectionLabel(String(localized: "add_todo.title_label"))
                        TextField("add_todo.title_placeholder", text: $titleText)
                            .textFieldStyle(.plain)
                            .font(.system(size: 16, weight: .regular))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                            .focused($focusedField, equals: .title)
                            .padding(14)
                            .glassField(cornerRadius: 12)

                        sectionLabel(String(localized: "add_todo.description_optional"))
                        TextField("add_todo.description_placeholder", text: $descriptionText)
                            .textFieldStyle(.plain)
                            .font(.system(size: 16, weight: .regular))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                            .focused($focusedField, equals: .description)
                            .padding(14)
                            .glassField(cornerRadius: 12)

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
            .navigationTitle(navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("add_todo.cancel") {
                        dismiss()
                    }
                    .foregroundStyle(CloudwrkzColors.primary400)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("add_todo.save") {
                        Task { await save() }
                    }
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(canSave && !isSaving ? CloudwrkzColors.primary400 : CloudwrkzColors.neutral500)
                    .disabled(!canSave || isSaving)
                }
            }
            .tint(CloudwrkzColors.primary400)
            .onAppear {
                if titleText.isEmpty {
                    focusedField = .title
                }
            }
        }
    }

    private func save() async {
        errorMessage = nil
        isSaving = true
        let title = titleText.trimmingCharacters(in: .whitespacesAndNewlines)
        let description = descriptionText.trimmingCharacters(in: .whitespacesAndNewlines)
        let descriptionOpt = description.isEmpty ? nil : description
        let result = await TodoService.createTodo(
            config: appState.config,
            title: title,
            description: descriptionOpt,
            parentTodoId: parentTodoId
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

#Preview("New todo") {
    AddTodoView(
        parentTodoId: nil,
        parentTodoTitle: nil,
        onSaved: {}
    )
}

#Preview("Subtodo") {
    AddTodoView(
        parentTodoId: "parent-1",
        parentTodoTitle: "Implement todo view for the iOS app",
        onSaved: {}
    )
}
