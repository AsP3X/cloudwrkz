//
//  ChangePasswordView.swift
//  Cloudwrkz
//
//  Change password: current, new, confirm. Liquid glass, gradient background.
//  Calls AuthService.changePassword; dismisses on success.
//

import SwiftUI

struct ChangePasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appState) private var appState

    var onSuccess: (() -> Void)?

    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?

    private enum Field {
        case currentPassword, newPassword, confirmPassword
    }

    private var canSave: Bool {
        !currentPassword.isEmpty && !newPassword.isEmpty && !confirmPassword.isEmpty && newPassword == confirmPassword && newPassword.count >= 8
    }

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
                    VStack(alignment: .leading, spacing: 24) {
                        if let error = errorMessage {
                            Text(error)
                                .font(.system(size: 13, weight: .regular))
                                .foregroundStyle(CloudwrkzColors.error500)
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(CloudwrkzColors.error500.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                        }
                        passwordSection
                    }
                    .padding(20)
                }
                .overlay {
                    if isSaving {
                        Color.black.opacity(0.4)
                            .ignoresSafeArea()
                        CloudwrkzSpinner(tint: CloudwrkzColors.neutral100)
                            .scaleEffect(1.2)
                    }
                }
            }
            .navigationTitle("Change Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundStyle(CloudwrkzColors.primary400)
                    .accessibilityLabel("Cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await saveAndDismiss() }
                    }
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.primary400)
                    .accessibilityLabel("Save")
                    .disabled(isSaving || !canSave)
                }
            }
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(CloudwrkzColors.neutral950.opacity(0.95), for: .navigationBar)
            .tint(CloudwrkzColors.primary400)
        }
    }

    private var passwordSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("PASSWORD")
                .font(.system(size: 11, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(CloudwrkzColors.neutral500)

            SecureField("Current password", text: $currentPassword)
                .textContentType(.password)
                .focused($focusedField, equals: .currentPassword)
                .foregroundStyle(CloudwrkzColors.neutral100)
                .padding(14)
                .glassField(cornerRadius: 12)

            SecureField("New password", text: $newPassword)
                .textContentType(.newPassword)
                .focused($focusedField, equals: .newPassword)
                .foregroundStyle(CloudwrkzColors.neutral100)
                .padding(14)
                .glassField(cornerRadius: 12)

            SecureField("Confirm new password", text: $confirmPassword)
                .textContentType(.newPassword)
                .focused($focusedField, equals: .confirmPassword)
                .foregroundStyle(CloudwrkzColors.neutral100)
                .padding(14)
                .glassField(cornerRadius: 12)

            if !newPassword.isEmpty && newPassword.count < 8 {
                Text("Password must be at least 8 characters")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.warning500)
            }
            Text("Use at least 8 characters with uppercase, lowercase, and a number")
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral500)
            if !confirmPassword.isEmpty && newPassword != confirmPassword {
                Text("Passwords don't match")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.error500)
            }
        }
    }

    private func saveAndDismiss() async {
        errorMessage = nil
        guard canSave else { return }
        let current = currentPassword.trimmingCharacters(in: .whitespaces)
        let new = newPassword.trimmingCharacters(in: .whitespaces)
        guard !current.isEmpty, !new.isEmpty, new.count >= 8, new == confirmPassword.trimmingCharacters(in: .whitespaces) else {
            await MainActor.run { errorMessage = "Please fill all fields and ensure the new password is at least 8 characters and matches confirmation." }
            return
        }
        await MainActor.run { isSaving = true }
        let config = appState.config
        let confirm = confirmPassword.trimmingCharacters(in: .whitespaces)
        let result = await AuthService.changePassword(currentPassword: current, newPassword: new, confirmPassword: confirm, config: config)
        await MainActor.run { isSaving = false }
        switch result {
        case .success:
            onSuccess?()
            dismiss()
        case .failure(let error):
            let message: String = switch error {
            case .noServerURL: "Server not configured."
            case .noToken: "Session expired. Please sign in again."
            case .invalidCurrentPassword: "Current password is incorrect."
            case .serverError(let msg): msg
            case .networkError(let desc): desc
            }
            await MainActor.run { errorMessage = message }
        }
    }
}

#Preview {
    ChangePasswordView(onSuccess: nil)
}
