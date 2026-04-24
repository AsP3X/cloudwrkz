//
//  ProfileView.swift
//  Cloudwrkz
//
//  Sheet showing user profile: hero, account health, employment link, quick actions, sign out.
//  Liquid glass, modern enterprise. Opened from profile icon context menu.
//

import SwiftUI

// Human: Profile sheet mirrors the web “account command center”: `/me` for health/badges and `/employees/me` for employment details.
// Agent: ProfileView .task AuthService.fetchCurrentUser + EmployeeService.fetchMyEmployee; sheets ProfileEditView AccountSettingsView EmploymentDetailsView.

struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appState) private var appState

    var firstName: String?
    var lastName: String?
    var username: String?
    var email: String?
    var profileImageData: Data?
    var onLogout: (() -> Void)?
    var onProfileUpdated: (() -> Void)?

    @State private var showEditSheet = false
    @State private var showAccountSettings = false
    @State private var showEmploymentSheet = false
    @State private var linkedEmployee: EmployeeMyRecord?
    @State private var employeeLoading = true
    /// Account command center: extra fields hidden until the user expands this section.
    @State private var isCommandCenterExpanded = false

    private var resolvedFirstName: String { firstName?.trimmingCharacters(in: .whitespaces) ?? UserProfileStorage.firstName?.trimmingCharacters(in: .whitespaces) ?? "" }
    private var resolvedLastName: String { lastName?.trimmingCharacters(in: .whitespaces) ?? UserProfileStorage.lastName?.trimmingCharacters(in: .whitespaces) ?? "" }

    private var displayName: String {
        if !resolvedFirstName.isEmpty || !resolvedLastName.isEmpty {
            return [resolvedFirstName, resolvedLastName].filter { !$0.isEmpty }.joined(separator: " ")
        }
        let trimmed = username?.trimmingCharacters(in: .whitespaces)
            ?? UserProfileStorage.username?.trimmingCharacters(in: .whitespaces)
            ?? ""
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

    private var hasDisplayName: Bool {
        !resolvedFirstName.isEmpty || !resolvedLastName.isEmpty
            || !(UserProfileStorage.username?.trimmingCharacters(in: .whitespaces) ?? "").isEmpty
    }

    private var hasAvatarForCompleteness: Bool {
        profileImageData != nil || UserProfileStorage.profileImageData != nil
            || !(UserProfileStorage.serverAvatarURL ?? "").trimmingCharacters(in: .whitespaces).isEmpty
    }

    private var hasBio: Bool {
        !(UserProfileStorage.bio ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var hasCustomTimezone: Bool {
        let tz = (UserProfileStorage.timezone ?? "UTC").trimmingCharacters(in: .whitespaces)
        return !tz.isEmpty && tz != "UTC"
    }

    private var profileHealthPercent: Int {
        let checks = [
            hasDisplayName,
            hasAvatarForCompleteness,
            UserProfileStorage.emailVerified,
            hasBio,
            hasCustomTimezone,
        ]
        let done = checks.filter(\.self).count
        guard !checks.isEmpty else { return 0 }
        return Int(round(Double(done) / Double(checks.count)) * 100)
    }

    private var showActiveIndicator: Bool {
        (UserProfileStorage.accountStatus ?? "").uppercased() == "ACTIVE"
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
                        commandCenterSection
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
            .sheet(isPresented: $showEmploymentSheet) {
                NavigationStack {
                    EmploymentDetailsView(employee: linkedEmployee)
                        .navigationTitle("profile.employment.sheet_title")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("common.done") { showEmploymentSheet = false }
                                    .foregroundStyle(CloudwrkzColors.primary400)
                            }
                        }
                        .toolbarBackground(CloudwrkzColors.neutral950.opacity(0.95), for: .navigationBar)
                }
            }
            .task {
                await refreshServerProfile()
            }
        }
    }

    // MARK: - Account command center

    private var commandCenterSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.22)) {
                    isCommandCenterExpanded.toggle()
                }
            } label: {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("profile.command_center.kicker")
                            .font(.system(size: 10, weight: .bold))
                            .tracking(1.2)
                            .foregroundStyle(CloudwrkzColors.neutral500)
                        Text(displayName)
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.neutral100)
                            .multilineTextAlignment(.leading)
                        if !isCommandCenterExpanded {
                            Text("profile.command_center.tap_to_expand")
                                .font(.system(size: 12, weight: .regular))
                                .foregroundStyle(CloudwrkzColors.neutral500)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.neutral500)
                        .rotationEffect(.degrees(isCommandCenterExpanded ? 180 : 0))
                        .accessibilityHidden(true)
                }
                .padding(20)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "profile.command_center.a11y_header"))
            .accessibilityHint(
                isCommandCenterExpanded
                    ? String(localized: "profile.command_center.a11y_collapse_hint")
                    : String(localized: "profile.command_center.a11y_expand_hint")
            )

            if isCommandCenterExpanded {
                VStack(alignment: .leading, spacing: 16) {
                    commandCenterExpandedBody
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        // Human: Slide/opacity transitions must not paint outside the rounded glass panel.
        // Agent: clipShape matches glassPanel cornerRadius so expanded body stays visually contained.
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var commandCenterExpandedBody: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                Text("profile.command_center.subtitle")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral400)
                    .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing) {
                    if employeeLoading {
                        Text("profile.employment.checking_link")
                            .font(.system(size: 12, weight: .regular))
                            .foregroundStyle(CloudwrkzColors.neutral500)
                            .multilineTextAlignment(.trailing)
                    } else {
                        Button {
                            showEmploymentSheet = true
                        } label: {
                            Text("profile.employment.view_details")
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .buttonStyle(.bordered)
                        .tint(CloudwrkzColors.primary500)
                    }
                }
            }

            HStack(alignment: .top, spacing: 16) {
                ZStack(alignment: .bottomTrailing) {
                    ProfileAvatarView(
                        firstName: firstName,
                        lastName: lastName,
                        username: username ?? UserProfileStorage.username,
                        profileImageData: profileImageData ?? UserProfileStorage.profileImageData,
                        size: 100
                    )
                    .accessibilityLabel("Profile photo")
                    if showActiveIndicator {
                        Circle()
                            .fill(CloudwrkzColors.success500)
                            .frame(width: 18, height: 18)
                            .overlay(Circle().strokeBorder(CloudwrkzColors.neutral950, lineWidth: 2))
                            .offset(x: 2, y: 2)
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    if let role = UserProfileStorage.userRole, !role.isEmpty {
                        HStack(spacing: 6) {
                            roleBadge(role)
                            if let st = UserProfileStorage.accountStatus, !st.isEmpty {
                                accountStatusBadge(st)
                            }
                        }
                    } else if let st = UserProfileStorage.accountStatus, !st.isEmpty {
                        accountStatusBadge(st)
                    }

                    if let em = email?.trimmingCharacters(in: .whitespaces), !em.isEmpty {
                        Text(em)
                            .font(.system(size: 14, weight: .regular))
                            .foregroundStyle(CloudwrkzColors.neutral400)
                    } else if let em = UserProfileStorage.email?.trimmingCharacters(in: .whitespaces), !em.isEmpty {
                        Text(em)
                            .font(.system(size: 14, weight: .regular))
                            .foregroundStyle(CloudwrkzColors.neutral400)
                    }

                    if let bio = UserProfileStorage.bio?.trimmingCharacters(in: .whitespacesAndNewlines), !bio.isEmpty {
                        Text(bio)
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(CloudwrkzColors.neutral500)
                            .padding(.top, 2)
                    }

                    memberAndLoginChips
                }
            }

            HStack(spacing: 12) {
                statPill(value: "\(profileHealthPercent)%", caption: "profile.command_center.profile_health")
                statPill(
                    value: UserProfileStorage.emailVerified ? String(localized: "profile.command_center.yes") : String(localized: "profile.command_center.no"),
                    caption: "profile.command_center.email_verified"
                )
            }

            VStack(alignment: .leading, spacing: 10) {
                infoRow(title: "profile.command_center.timezone", value: (UserProfileStorage.timezone ?? "UTC").trimmingCharacters(in: .whitespaces))
                infoRow(title: "profile.command_center.member_since", value: formattedMemberSince)
                infoRow(title: "profile.command_center.role", value: localizedRole(UserProfileStorage.userRole))
                infoRow(title: "profile.command_center.status", value: localizedAccountStatus(UserProfileStorage.accountStatus))
                infoRow(title: "profile.command_center.last_login", value: formattedLastLogin)
            }

            Text("profile.command_center.settings_hint")
                .font(.system(size: 11, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral500)
                .padding(.top, 4)
        }
    }

    private var memberAndLoginChips: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let first = UserProfileStorage.firstLoginAt {
                Text(String(format: String(localized: "profile.member_since"), Self.memberSinceFormatter.string(from: first)))
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            if let last = UserProfileStorage.lastSignedInAt {
                Text(String(format: String(localized: "profile.last_signed_in"), Self.lastSignedInString(from: last)))
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
        }
        .padding(.top, 4)
    }

    private var formattedMemberSince: String {
        if let s = UserProfileStorage.serverCreatedAt, let d = parseMeDate(s) {
            return Self.memberSinceFormatter.string(from: d)
        }
        if let first = UserProfileStorage.firstLoginAt {
            return Self.memberSinceFormatter.string(from: first)
        }
        return "—"
    }

    private var formattedLastLogin: String {
        if let s = UserProfileStorage.serverLastLoginAt, let d = parseMeDate(s) {
            return Self.memberSinceFormatter.string(from: d)
        }
        if let last = UserProfileStorage.lastSignedInAt {
            return Self.memberSinceFormatter.string(from: last)
        }
        return "—"
    }

    private func parseMeDate(_ raw: String) -> Date? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return try? ApiTimestampParsing.decode(trimmed)
    }

    private func statPill(value: String, caption: LocalizedStringKey) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(CloudwrkzColors.neutral100)
            Text(caption)
                .font(.system(size: 11, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral500)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .glassCard(cornerRadius: 14)
    }

    private func infoRow(title: LocalizedStringKey, value: String) -> some View {
        HStack(alignment: .top) {
            Text(title)
                .font(.system(size: 10, weight: .bold))
                .tracking(0.6)
                .foregroundStyle(CloudwrkzColors.neutral500)
                .frame(width: 108, alignment: .leading)
            Text(value)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral100)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func roleBadge(_ role: String) -> some View {
        Text(localizedRole(role))
            .font(.system(size: 10, weight: .bold))
            .tracking(0.5)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(roleBadgeBackground(role), in: Capsule())
            .foregroundStyle(roleBadgeForeground(role))
    }

    private func accountStatusBadge(_ status: String) -> some View {
        Text(localizedAccountStatus(status))
            .font(.system(size: 10, weight: .bold))
            .tracking(0.5)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(accountStatusBackground(status), in: Capsule())
            .foregroundStyle(accountStatusForeground(status))
    }

    private func localizedRole(_ raw: String?) -> String {
        guard let r = raw?.trimmingCharacters(in: .whitespaces), !r.isEmpty else { return "—" }
        switch r.uppercased() {
        case "ADMIN": return String(localized: "profile.role.admin")
        case "AGENT": return String(localized: "profile.role.agent")
        case "MODERATOR": return String(localized: "profile.role.moderator")
        default: return String(localized: "profile.role.user")
        }
    }

    private func localizedAccountStatus(_ raw: String?) -> String {
        guard let s = raw?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return "—" }
        switch s.uppercased() {
        case "ACTIVE": return String(localized: "profile.account_status.active")
        case "PENDING": return String(localized: "profile.account_status.pending")
        case "SUSPENDED": return String(localized: "profile.account_status.suspended")
        default: return s.replacingOccurrences(of: "_", with: " ")
        }
    }

    private func roleBadgeBackground(_ raw: String) -> Color {
        switch raw.uppercased() {
        case "ADMIN": return CloudwrkzColors.error500.opacity(0.2)
        case "AGENT": return CloudwrkzColors.primary500.opacity(0.2)
        case "MODERATOR": return CloudwrkzColors.neutral700
        default: return CloudwrkzColors.neutral800
        }
    }

    private func roleBadgeForeground(_ raw: String) -> Color {
        switch raw.uppercased() {
        case "ADMIN": return CloudwrkzColors.error500
        case "AGENT": return CloudwrkzColors.primary400
        case "MODERATOR": return CloudwrkzColors.neutral200
        default: return CloudwrkzColors.neutral400
        }
    }

    private func accountStatusBackground(_ raw: String) -> Color {
        switch raw.uppercased() {
        case "ACTIVE": return CloudwrkzColors.success500.opacity(0.2)
        case "PENDING": return CloudwrkzColors.warning500.opacity(0.2)
        case "SUSPENDED": return CloudwrkzColors.error500.opacity(0.2)
        default: return CloudwrkzColors.neutral800
        }
    }

    private func accountStatusForeground(_ raw: String) -> Color {
        switch raw.uppercased() {
        case "ACTIVE": return CloudwrkzColors.success500
        case "PENDING": return CloudwrkzColors.warning500
        case "SUSPENDED": return CloudwrkzColors.error500
        default: return CloudwrkzColors.neutral400
        }
    }

    @MainActor
    private func refreshServerProfile() async {
        employeeLoading = true
        async let meTask = AuthService.fetchCurrentUser(config: appState.config)
        async let employeeTask = EmployeeService.fetchMyEmployee(config: appState.config)

        let meResult = await meTask
        let employeeResult = await employeeTask

        if case .success(let info) = meResult {
            UserProfileStorage.applyFromMe(info)
            onProfileUpdated?()
        }
        switch employeeResult {
        case .success(let record):
            linkedEmployee = record
        case .failure:
            linkedEmployee = nil
        }
        employeeLoading = false
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
