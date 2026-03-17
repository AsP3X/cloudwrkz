//
//  AccountSettingsView.swift
//  Cloudwrkz
//
//  Account settings: notifications, appearance, security, server, data & privacy.
//  Fancy, liquid glass, modern enterprise. Opened from Profile → Account settings.
//

import SwiftUI

struct AccountSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appState) private var appState

    @State private var showServerConfig = false
    @State private var showChangePassword = false
    @State private var showLanguagePicker = false
    @State private var showRestartAlert = false
    @State private var pendingLanguageRestartAlert = false

    @State private var notificationsEnabled = AccountSettingsStorage.notificationsEnabled
    @State private var emailDigestEnabled = AccountSettingsStorage.emailDigestEnabled
    @State private var appearanceSelection = AccountSettingsStorage.appearance
    @State private var displayLanguageSelection = AccountSettingsStorage.displayLanguage
    @State private var biometricLockEnabled = AccountSettingsStorage.biometricLockEnabled
    @State private var timeTrackingPeriod = AccountSettingsStorage.timeTrackingDefaultPeriod
    @State private var timeTrackingCustomDays = AccountSettingsStorage.timeTrackingCustomDays
    @State private var thirdPartyLocationSuggestionsEnabled = AccountSettingsStorage.thirdPartyLocationSuggestionsEnabled
    @State private var cacheClearedFeedback = false
    @State private var showCacheConfirm = false
    @State private var cacheSizeDisplay: String = ""
    @State private var isComputingCacheSize = false
    @State private var showPrivacyPolicy = false
    @State private var showDeleteAccountConfirm = false
    @State private var showDeleteAccountSent = false
    @State private var showExportDataSent = false

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
                        notificationsSection
                        appearanceSection
                        languageSection
                        timeTrackingSection
                        securitySection
                        serverSection
                        dataPrivacySection
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 32)
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("account_settings.title")
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
            .onAppear {
                loadPreferences()
                refreshCacheSize()
            }
            .onChange(of: notificationsEnabled) { _, v in AccountSettingsStorage.notificationsEnabled = v }
            .onChange(of: emailDigestEnabled) { _, v in AccountSettingsStorage.emailDigestEnabled = v }
            .onChange(of: appearanceSelection) { _, v in AccountSettingsStorage.appearance = v }
            .onChange(of: biometricLockEnabled) { _, v in AccountSettingsStorage.biometricLockEnabled = v }
            .onChange(of: displayLanguageSelection) { _, v in
                AccountSettingsStorage.displayLanguage = v
                Task { await syncDisplayLanguageToServer(v) }
            }
            .onChange(of: timeTrackingPeriod) { _, v in AccountSettingsStorage.timeTrackingDefaultPeriod = v }
            .onChange(of: timeTrackingCustomDays) { _, v in AccountSettingsStorage.timeTrackingCustomDays = v }
            .onChange(of: thirdPartyLocationSuggestionsEnabled) { _, v in
                AccountSettingsStorage.thirdPartyLocationSuggestionsEnabled = v
            }
            .sheet(isPresented: $showServerConfig) {
                ServerConfigView(config: Binding(
                    get: { appState.config },
                    set: { appState.config = $0 }
                ))
            }
            .sheet(isPresented: $showChangePassword) {
                ChangePasswordView(onSuccess: nil)
            }
            .sheet(isPresented: $showLanguagePicker, onDismiss: {
                if pendingLanguageRestartAlert {
                    showRestartAlert = true
                }
                pendingLanguageRestartAlert = false
            }) {
                DisplayLanguageSheet(
                    selection: $displayLanguageSelection,
                    initialSelection: displayLanguageSelection,
                    onDismiss: { didChange in
                        pendingLanguageRestartAlert = didChange
                        if didChange {
                            AccountSettingsStorage.displayLanguage = displayLanguageSelection
                            Task { await syncDisplayLanguageToServer(displayLanguageSelection) }
                        }
                    }
                )
            }
            .alert(String(localized: "account_settings.clear_cache_alert"), isPresented: $showCacheConfirm) {
                Button("common.cancel", role: .cancel) { }
                Button("common.clear", role: .destructive) {
                    LocalCacheService.clearAll()
                    cacheClearedFeedback = true
                    refreshCacheSize()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        cacheClearedFeedback = false
                    }
                }
            } message: {
                Text(String(format: String(localized: "account_settings.clear_cache_message"), cacheSizeDisplay))
            }
            .alert(String(localized: "account_settings.language_restart_required"), isPresented: $showRestartAlert) {
                Button(String(localized: "account_settings.later"), role: .cancel) { }
                Button(String(localized: "account_settings.restart")) {
                    exit(0)
                }
            } message: {
                Text(String(localized: "account_settings.language_restart_message"))
            }
            .sheet(isPresented: $showPrivacyPolicy) {
                PrivacyPolicyView()
            }
            .alert(String(localized: "account_settings.delete_account_alert_title"), isPresented: $showDeleteAccountConfirm) {
                Button(String(localized: "common.cancel"), role: .cancel) { }
                Button(String(localized: "account_settings.delete_account_confirm"), role: .destructive) {
                    handleDeleteAccount()
                }
            } message: {
                Text(String(localized: "account_settings.delete_account_alert_message"))
            }
            .alert(String(localized: "account_settings.delete_account_requested_title"), isPresented: $showDeleteAccountSent) {
                Button("OK") { }
            } message: {
                Text(String(localized: "account_settings.delete_account_requested_message"))
            }
        }
    }

    private func loadPreferences() {
        notificationsEnabled = AccountSettingsStorage.notificationsEnabled
        emailDigestEnabled = AccountSettingsStorage.emailDigestEnabled
        appearanceSelection = AccountSettingsStorage.appearance
        displayLanguageSelection = AccountSettingsStorage.displayLanguage
        biometricLockEnabled = AccountSettingsStorage.biometricLockEnabled
        timeTrackingPeriod = AccountSettingsStorage.timeTrackingDefaultPeriod
        timeTrackingCustomDays = AccountSettingsStorage.timeTrackingCustomDays
        thirdPartyLocationSuggestionsEnabled = AccountSettingsStorage.thirdPartyLocationSuggestionsEnabled
    }

    private func syncDisplayLanguageToServer(_ locale: String) async {
        let effectiveLocale = locale == "system" ? Locale.current.language.languageCode?.identifier ?? "en" : locale
        _ = await ProfileService.updatePreferences(config: appState.config, locale: effectiveLocale)
    }

    // MARK: - Section label

    private func sectionLabel(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.8)
            .foregroundStyle(CloudwrkzColors.neutral500)
            .padding(.bottom, 8)
    }

    // MARK: - Notifications

    private var notificationsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel(String(localized: "account_settings.notifications"))
            VStack(spacing: 0) {
                settingsToggleRow(
                    icon: "bell.fill",
                    title: String(localized: "account_settings.push_notifications"),
                    subtitle: String(localized: "account_settings.push_subtitle")
                ) {
                    Toggle("", isOn: $notificationsEnabled)
                        .labelsHidden()
                        .tint(CloudwrkzColors.primary400)
                }
                settingsDivider
                settingsToggleRow(
                    icon: "envelope.fill",
                    title: String(localized: "account_settings.email_digest"),
                    subtitle: String(localized: "account_settings.email_digest_subtitle")
                ) {
                    Toggle("", isOn: $emailDigestEnabled)
                        .labelsHidden()
                        .tint(CloudwrkzColors.primary400)
                }
            }
            .padding(16)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    // MARK: - Appearance

    private var appearanceSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel(String(localized: "account_settings.appearance"))
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: "paintbrush.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(CloudwrkzColors.neutral500)
                    Text("account_settings.theme")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.neutral400)
                }
                Picker("account_settings.theme", selection: $appearanceSelection) {
                    Text("account_settings.theme_system").tag("system")
                    Text("account_settings.theme_light").tag("light")
                    Text("account_settings.theme_dark").tag("dark")
                }
                .pickerStyle(.segmented)
                .tint(CloudwrkzColors.primary400)
            }
            .padding(20)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    // MARK: - Language

    private var languageSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel(String(localized: "account_settings.language"))
            AccountSettingsRow(
                icon: "globe",
                title: String(localized: "account_settings.language"),
                subtitle: DisplayLanguageSheet.displayName(for: displayLanguageSelection)
            ) {
                showLanguagePicker = true
            }
        }
    }

    // MARK: - Time tracking

    private var timeTrackingSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel(String(localized: "account_settings.time_tracking"))
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Image(systemName: "clock.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(CloudwrkzColors.neutral500)
                        Text("account_settings.time_tracking_default_range")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.neutral400)
                    }
                    Text("account_settings.time_tracking_default_range_subtitle")
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral500)
                        .padding(.leading, 22)
                }
                .padding(.bottom, 12)
                timeTrackingPeriodRow(
                    title: String(localized: "account_settings.time_tracking_period_month"),
                    tag: "month",
                    icon: "calendar"
                )
                settingsDivider
                timeTrackingPeriodRow(
                    title: String(localized: "account_settings.time_tracking_period_week"),
                    tag: "week",
                    icon: "calendar.day.timeline.left"
                )
                settingsDivider
                timeTrackingPeriodRow(
                    title: String(localized: "account_settings.time_tracking_period_quarter"),
                    tag: "quarter",
                    icon: "square.stack.3d.up.fill"
                )
                settingsDivider
                timeTrackingPeriodRow(
                    title: String(localized: "account_settings.time_tracking_period_year"),
                    tag: "year",
                    icon: "calendar.badge.clock"
                )
                settingsDivider
                timeTrackingPeriodRow(
                    title: String(localized: "account_settings.time_tracking_period_custom"),
                    tag: "custom",
                    icon: "slider.horizontal.3"
                )
                if timeTrackingPeriod == "custom" {
                    settingsDivider
                    timeTrackingCustomDaysRow
                }
            }
            .padding(16)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    private func timeTrackingPeriodRow(title: String, tag: String, icon: String) -> some View {
        Button {
            timeTrackingPeriod = tag
        } label: {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundStyle(CloudwrkzColors.primary400)
                    .frame(width: 28, height: 28)
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if timeTrackingPeriod == tag {
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

    private var timeTrackingCustomDaysRow: some View {
        HStack(spacing: 14) {
            Image(systemName: "calendar")
                .font(.system(size: 20))
                .foregroundStyle(CloudwrkzColors.primary400)
                .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text("account_settings.time_tracking_custom_days")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Text("\(timeTrackingCustomDays) \(timeTrackingCustomDays == 1 ? String(localized: "account_settings.time_tracking_day") : String(localized: "account_settings.time_tracking_days"))")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Stepper("", value: $timeTrackingCustomDays, in: 1...366)
                .labelsHidden()
                .tint(CloudwrkzColors.primary400)
            Text("\(timeTrackingCustomDays)")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(CloudwrkzColors.neutral100)
                .frame(minWidth: 28, alignment: .trailing)
        }
        .padding(.vertical, 12)
    }

    // MARK: - Security

    private var securitySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel(String(localized: "account_settings.security"))
            VStack(spacing: 0) {
                settingsActionRow(
                    icon: "lock.rotation",
                    title: String(localized: "account_settings.change_password"),
                    subtitle: String(localized: "account_settings.change_password_subtitle")
                ) {
                    showChangePassword = true
                }
                settingsDivider
                settingsToggleRow(
                    icon: "faceid",
                    title: String(localized: "account_settings.biometric_lock"),
                    subtitle: BiometricService.isAvailable ? String(format: String(localized: "account_settings.biometric_required"), BiometricService.biometricTypeName) : String(localized: "account_settings.biometric_not_available")
                ) {
                    Toggle("", isOn: $biometricLockEnabled)
                        .labelsHidden()
                        .tint(CloudwrkzColors.primary400)
                        .disabled(!BiometricService.isAvailable)
                }
            }
            .padding(16)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    // MARK: - Server

    private var serverSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel(String(localized: "account_settings.server"))
            AccountSettingsRow(
                icon: "server.rack",
                title: String(localized: "account_settings.server_config"),
                subtitle: appState.config.tenant == .official ? "Official Cloudwrkz" : (appState.config.serverDomain.isEmpty ? "On‑prem" : appState.config.serverDomain)
            ) {
                showServerConfig = true
            }
        }
    }

    // MARK: - Data & privacy

    private var dataPrivacySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel(String(localized: "account_settings.data_privacy"))
            VStack(spacing: 0) {
                settingsToggleRow(
                    icon: "location.magnifyingglass",
                    title: String(localized: "account_settings.third_party_location_suggestions"),
                    subtitle: String(localized: "account_settings.third_party_location_suggestions_subtitle")
                ) {
                    Toggle("", isOn: $thirdPartyLocationSuggestionsEnabled)
                        .labelsHidden()
                        .tint(CloudwrkzColors.primary400)
                }
                settingsDivider
                settingsActionRow(
                    icon: "trash",
                    title: String(localized: "account_settings.clear_cache"),
                    subtitle: cacheClearedFeedback
                        ? String(localized: "account_settings.cache_cleared")
                        : (cacheSizeDisplay.isEmpty ? String(localized: "account_settings.free_up_space") : String(format: String(localized: "account_settings.cache_size_on_device"), cacheSizeDisplay))
                ) {
                    handleClearCacheTapped()
                }
                settingsDivider
                settingsActionRow(
                    icon: "hand.raised.fill",
                    title: String(localized: "account_settings.privacy_policy"),
                    subtitle: String(localized: "account_settings.privacy_subtitle")
                ) {
                    showPrivacyPolicy = true
                }
                settingsDivider
                settingsActionRow(
                    icon: "arrow.down.doc.fill",
                    title: String(localized: "account_settings.export_data"),
                    subtitle: showExportDataSent
                        ? String(localized: "account_settings.export_data_sent")
                        : String(localized: "account_settings.export_data_subtitle")
                ) {
                    handleExportData()
                }
                settingsDivider
                settingsActionRow(
                    icon: "person.crop.circle.badge.minus",
                    title: String(localized: "account_settings.delete_account"),
                    subtitle: String(localized: "account_settings.delete_account_subtitle")
                ) {
                    showDeleteAccountConfirm = true
                }
            }
            .padding(16)
            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
        }
    }

    private var settingsDivider: some View {
        Rectangle()
            .fill(CloudwrkzColors.divider)
            .frame(height: 1)
    }

    /// Same layout as settingsToggleRow but tappable with chevron; pairs visually with toggle rows.
    private func settingsActionRow(
        icon: String,
        title: String,
        subtitle: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundStyle(CloudwrkzColors.primary400)
                    .frame(width: 28, height: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.neutral100)
                    Text(subtitle)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(CloudwrkzColors.neutral500)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func settingsToggleRow<Trailing: View>(
        icon: String,
        title: String,
        subtitle: String,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundStyle(CloudwrkzColors.primary400)
                .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Text(subtitle)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing()
        }
        .padding(.vertical, 12)
    }

    // MARK: - Data rights helpers (DSGVO Art. 17, Art. 20)

    private func handleExportData() {
        Task {
            let success = await DataRightsService.requestDataExport(config: appState.config)
            await MainActor.run {
                if success {
                    showExportDataSent = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                        showExportDataSent = false
                    }
                }
            }
        }
    }

    private func handleDeleteAccount() {
        Task {
            let success = await DataRightsService.requestAccountDeletion(config: appState.config)
            await MainActor.run {
                showDeleteAccountSent = success
            }
        }
    }

    // MARK: - Cache helpers

    private func handleClearCacheTapped() {
        Task {
            isComputingCacheSize = true
            cacheSizeDisplay = ""
            let bytes = LocalCacheService.totalCacheSizeBytes()
            await MainActor.run {
                isComputingCacheSize = false
                cacheSizeDisplay = formatBytes(bytes)
                showCacheConfirm = true
            }
        }
    }

    private func refreshCacheSize() {
        Task {
            let bytes = LocalCacheService.totalCacheSizeBytes()
            await MainActor.run {
                cacheSizeDisplay = formatBytes(bytes)
            }
        }
    }

    private func formatBytes(_ bytes: Int64) -> String {
        let kb: Double = 1024
        let mb = kb * 1024
        let gb = mb * 1024
        let b = Double(bytes)

        let formatter = NumberFormatter()
        formatter.maximumFractionDigits = 1
        formatter.minimumFractionDigits = 0

        if b >= gb {
            let value = b / gb
            let s = formatter.string(from: NSNumber(value: value)) ?? String(format: "%.1f", value)
            return "\(s) GB"
        } else if b >= mb {
            let value = b / mb
            let s = formatter.string(from: NSNumber(value: value)) ?? String(format: "%.1f", value)
            return "\(s) MB"
        } else if b >= kb {
            let value = b / kb
            let s = formatter.string(from: NSNumber(value: value)) ?? String(format: "%.0f", value)
            return "\(s) KB"
        } else {
            return "\(Int(bytes)) B"
        }
    }
}

// MARK: - Glass row (liquid glass, matches ProfileView / ProfileMenuPopoverView)

private struct AccountSettingsRow: View {
    var icon: String
    var title: String
    var subtitle: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundStyle(CloudwrkzColors.primary400)
                    .frame(width: 28, height: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.neutral100)
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
        .buttonStyle(AccountSettingsRowButtonStyle())
    }
}

private struct AccountSettingsRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - Display language picker sheet (transparent toolbar, liquid glass)

private struct DisplayLanguageSheet: View {
    @Binding var selection: String
    var initialSelection: String
    var onDismiss: (Bool) -> Void
    @Environment(\.dismiss) private var dismiss

    private static let options: [(id: String, titleKey: String)] = [
        ("system", "account_settings.language_system"),
        ("en", "account_settings.language_english"),
        ("de", "account_settings.language_german"),
        ("ru", "account_settings.language_russian")
    ]

    static func displayName(for localeId: String) -> String {
        options.first(where: { $0.id == localeId }).map { String(localized: String.LocalizationValue($0.titleKey)) }
            ?? (localeId.isEmpty ? String(localized: String.LocalizationValue("account_settings.language_system")) : localeId)
    }

    private var background: some View {
        LinearGradient(
            colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                Image(systemName: "globe")
                    .font(.system(size: 28))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text("account_settings.language")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            Text("account_settings.language_restart_hint")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral400)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                background
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        headerSection
                        VStack(spacing: 10) {
                            ForEach(Self.options, id: \.id) { option in
                                languageRow(
                                    title: String(localized: String.LocalizationValue(option.titleKey)),
                                    isSelected: selection == option.id
                                ) {
                                    selection = option.id
                                }
                            }
                        }
                        .padding(20)
                        .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
                .scrollContentBackground(.hidden)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("common.done") {
                        let didChange = selection != initialSelection
                        onDismiss(didChange)
                        dismiss()
                    }
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
        }
    }

    private func languageRow(title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Text(title)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? CloudwrkzColors.glassFillHighlight : CloudwrkzColors.glassFillSubtle)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(
                                isSelected ? CloudwrkzColors.primary400.opacity(0.5) : CloudwrkzColors.glassStrokeSubtle,
                                lineWidth: isSelected ? 1.5 : 1
                            )
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    AccountSettingsView()
}
