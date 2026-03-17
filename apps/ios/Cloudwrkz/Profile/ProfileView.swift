//
//  ProfileView.swift
//  Cloudwrkz
//
//  Sheet showing user profile: hero (avatar, name, email), member since, quick actions, sign out.
//  Liquid glass, modern enterprise. Opened from profile icon context menu.
//

import SwiftUI

struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss

    var firstName: String?
    var lastName: String?
    var username: String?
    var email: String?
    var profileImageData: Data?
    var onLogout: (() -> Void)?
    var onProfileUpdated: (() -> Void)?

    @State private var showEditSheet = false
    @State private var showAccountSettings = false

    private var displayName: String {
        let first = firstName?.trimmingCharacters(in: .whitespaces) ?? ""
        let last = lastName?.trimmingCharacters(in: .whitespaces) ?? ""
        if !first.isEmpty || !last.isEmpty {
            return [first, last].filter { !$0.isEmpty }.joined(separator: " ")
        }
        let trimmed = username?.trimmingCharacters(in: .whitespaces) ?? ""
        if !trimmed.isEmpty { return trimmed }
        return String(localized: "profile.title")
    }

    private static let memberSinceFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        return f
    }()

    private static func lastSignedInString(from date: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .full
        return f.localizedString(for: date, relativeTo: Date())
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
                        heroSection
                        accountSection
                        sessionSection
                        versionSection
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 32)
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("profile.title")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("common.done") {
                        dismiss()
                    }
                    .foregroundStyle(CloudwrkzColors.primary400)
                    .accessibilityLabel("Done")
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
            .tint(CloudwrkzColors.primary400)
            .sheet(isPresented: $showEditSheet, onDismiss: {
                onProfileUpdated?()
            }) {
                ProfileEditView(onSave: {
                    showEditSheet = false
                    onProfileUpdated?()
                })
            }
            .sheet(isPresented: $showAccountSettings) {
                AccountSettingsView()
            }
        }
    }

    // MARK: - Hero (avatar + name + email + member since)

    private var heroSection: some View {
        VStack(spacing: 16) {
            ProfileAvatarView(
                firstName: firstName,
                lastName: lastName,
                username: username,
                profileImageData: profileImageData,
                size: 100
            )
            .accessibilityLabel("Profile photo")

            Text(displayName)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral100)

            if let email = email?.trimmingCharacters(in: .whitespaces), !email.isEmpty {
                Text(email)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral400)
            }

            if let username = username?.trimmingCharacters(in: .whitespaces), !username.isEmpty, username != displayName {
                Text(username)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }

            if let first = UserProfileStorage.firstLoginAt {
                Text(String(format: String(localized: "profile.member_since"), Self.memberSinceFormatter.string(from: first)))
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }

            if let last = UserProfileStorage.lastSignedInAt {
                Text(String(format: String(localized: "profile.last_signed_in"), Self.lastSignedInString(from: last)))
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
    }

    // MARK: - Account section (quick actions)

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("profile.account")
                .font(.system(size: 11, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(CloudwrkzColors.neutral500)
                .padding(.bottom, 4)

            ProfileGlassRowButton(
                icon: "pencil.circle.fill",
                title: String(localized: "profile.edit_profile"),
                subtitle: String(localized: "profile.edit_profile_subtitle"),
                isDestructive: false
            ) {
                showEditSheet = true
            }
            .accessibilityLabel("Edit profile")
            .accessibilityHint("Opens edit profile screen")

            ProfileGlassRowButton(
                icon: "gearshape.fill",
                title: String(localized: "profile.account_settings"),
                subtitle: String(localized: "profile.account_settings_subtitle"),
                isDestructive: false
            ) {
                showAccountSettings = true
            }
            .accessibilityLabel("Account settings")
            .accessibilityHint("Opens account settings")

            ProfileGlassRowButton(
                icon: "bell.fill",
                title: String(localized: "profile.notifications"),
                subtitle: String(localized: "profile.notifications_subtitle"),
                isDestructive: false
            ) {
                // Placeholder: future NotificationSettingsView
            }

            ProfileGlassRowButton(
                icon: "questionmark.circle.fill",
                title: String(localized: "profile.help"),
                subtitle: String(localized: "profile.help_subtitle"),
                isDestructive: false
            ) {
                // Placeholder: open help URL
            }
        }
    }

    // MARK: - Session (sign out)

    private var sessionSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("profile.session")
                .font(.system(size: 11, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(CloudwrkzColors.neutral500)
                .padding(.bottom, 4)

            ProfileGlassRowButton(
                icon: "rectangle.portrait.and.arrow.right",
                title: String(localized: "profile.log_out"),
                subtitle: String(localized: "profile.log_out_subtitle"),
                isDestructive: true
            ) {
                dismiss()
                onLogout?()
            }
            .accessibilityLabel("Log out")
            .accessibilityHint("Signs out of your account")
        }
    }

    // MARK: - App version

    private var versionSection: some View {
        Text(String(format: String(localized: "profile.app_version"), appVersion))
            .font(.system(size: 12, weight: .regular))
            .foregroundStyle(CloudwrkzColors.neutral500)
            .frame(maxWidth: .infinity)
            .padding(.top, 8)
    }

    private var appVersion: String {
        (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "1.0"
    }
}

// MARK: - Glass row (liquid glass, matches ProfileMenuPopoverView)

private struct ProfileGlassRowButton: View {
    var icon: String
    var title: String
    var subtitle: String
    var isDestructive: Bool = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundStyle(isDestructive ? CloudwrkzColors.error500 : CloudwrkzColors.primary400)
                    .frame(width: 28, height: 28)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(isDestructive ? CloudwrkzColors.error500 : CloudwrkzColors.neutral100)
                    Text(subtitle)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral500)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .glassCard(cornerRadius: 12)
        }
        .buttonStyle(ProfileGlassRowButtonStyle())
    }
}

private struct ProfileGlassRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

#Preview {
    ProfileView(
        firstName: "Jane",
        lastName: "Doe",
        username: nil,
        email: "jane@company.com",
        profileImageData: nil,
        onLogout: nil,
        onProfileUpdated: nil
    )
}
