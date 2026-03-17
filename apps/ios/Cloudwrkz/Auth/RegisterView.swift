//
//  RegisterView.swift
//  Cloudwrkz
//
//  Liquid glass only. Matches root auth (Splash/Login) layout and styling.
//

import SwiftUI

struct RegisterView: View {
    @Environment(\.appState) private var appState
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var privacyAccepted = false
    @State private var showPrivacyPolicy = false
    @FocusState private var focusedField: Field?

    var onSuccess: () -> Void = {}
    var onBack: () -> Void = {}

    enum Field { case name, email, password, confirmPassword }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    Button(action: onBack) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                            .frame(width: 44, height: 44)
                    }
                    Spacer()
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)

                Spacer(minLength: 0)

                VStack(spacing: 24) {
                    Text("splash.create_account")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(CloudwrkzColors.textOnGradient)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    formFields
                }
                .padding(.horizontal, 24)

                Spacer(minLength: 0)

                VStack(spacing: 14) {
                    privacyConsentRow
                    Button(action: submit) {
                        Group {
                            if isLoading {
                                CloudwrkzSpinner(tint: .white)
                            } else {
                                Text("splash.create_account")
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundStyle(CloudwrkzColors.textOnGradient)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                    }
                    .glassButtonPrimary()
                    .disabled(isLoading || !isFormValid)
                }
                .padding(.horizontal, 32)
                .padding(.bottom, 48)
                .padding(.top, 24)
            }
            .sheet(isPresented: $showPrivacyPolicy) {
                PrivacyPolicyView()
            }
        }
    }

    private var privacyConsentRow: some View {
        HStack(alignment: .top, spacing: 10) {
            Button {
                privacyAccepted.toggle()
            } label: {
                Image(systemName: privacyAccepted ? "checkmark.square.fill" : "square")
                    .font(.system(size: 20))
                    .foregroundStyle(privacyAccepted ? CloudwrkzColors.primary400 : CloudwrkzColors.neutral500)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                Text("register.privacy_consent")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral400)
                    .fixedSize(horizontal: false, vertical: true)
                Button {
                    showPrivacyPolicy = true
                } label: {
                    Text("register.view_privacy_policy")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.primary400)
                        .underline()
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var isFormValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !email.isEmpty
            && !password.isEmpty
            && !confirmPassword.isEmpty
            && privacyAccepted
    }

    @ViewBuilder
    private var formFields: some View {
        VStack(spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("register.name_label")
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(0.6)
                    .foregroundStyle(CloudwrkzColors.neutral400)
                TextField("register.name_placeholder", text: $name)
                    .textContentType(.name)
                    .autocapitalization(.words)
                    .focused($focusedField, equals: .name)
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .glassField(cornerRadius: 10)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("auth.email_label")
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(0.6)
                    .foregroundStyle(CloudwrkzColors.neutral400)
                TextField("auth.email_placeholder", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .email)
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .glassField(cornerRadius: 10)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("auth.password_label")
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(0.6)
                    .foregroundStyle(CloudwrkzColors.neutral400)
                SecureField("register.choose_password_placeholder", text: $password)
                    .textContentType(.newPassword)
                    .focused($focusedField, equals: .password)
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .glassField(cornerRadius: 10)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("register.confirm_password_label")
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(0.6)
                    .foregroundStyle(CloudwrkzColors.neutral400)
                SecureField("register.confirm_password_placeholder", text: $confirmPassword)
                    .textContentType(.newPassword)
                    .focused($focusedField, equals: .confirmPassword)
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .glassField(cornerRadius: 10)
            }

            if let error = errorMessage {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(CloudwrkzColors.error500)
                    Text(error)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(CloudwrkzColors.error500)
                        .textSelection(.enabled)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(CloudwrkzColors.error50.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(CloudwrkzColors.error500.opacity(0.35), lineWidth: 1)
                )
            }
        }
    }

    private func submit() {
        errorMessage = nil
        focusedField = nil

        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedName.isEmpty {
            errorMessage = String(localized: "register.please_enter_name")
            return
        }
        if trimmedName.count < 2 {
            errorMessage = String(localized: "register.name_min_length")
            return
        }
        if email.isEmpty {
            errorMessage = String(localized: "register.please_enter_email")
            return
        }
        if password.isEmpty {
            errorMessage = String(localized: "register.please_choose_password")
            return
        }
        if password != confirmPassword {
            errorMessage = String(localized: "register.passwords_do_not_match")
            return
        }
        if password.count < 8 {
            errorMessage = String(localized: "register.password_min_length")
            return
        }
        if !privacyAccepted {
            errorMessage = String(localized: "register.consent_required")
            return
        }

        if appState.config.baseURL == nil {
            errorMessage = String(localized: "auth.configure_server")
            return
        }

        isLoading = true
        Task { @MainActor in
            defer { isLoading = false }
            let result = await AuthService.register(
                name: trimmedName,
                email: email,
                password: password,
                confirmPassword: confirmPassword,
                config: appState.config
            )
            switch result {
            case .success:
                let parts = trimmedName.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
                UserProfileStorage.firstName = parts.first.map(String.init)
                UserProfileStorage.lastName = (parts.count > 1) ? String(parts[1]) : nil
                UserProfileStorage.email = email.trimmingCharacters(in: .whitespaces)
                onSuccess()
            case .failure(let failure):
                errorMessage = message(for: failure)
            }
        }
    }

    private func message(for failure: AuthRegisterFailure) -> String {
        switch failure {
        case .noServerURL:
            return String(localized: "auth.configure_server")
        case .serverError(let message):
            return message
        case .networkError:
            return String(localized: "auth.could_not_reach_server")
        }
    }
}

#Preview {
    RegisterView()
}
