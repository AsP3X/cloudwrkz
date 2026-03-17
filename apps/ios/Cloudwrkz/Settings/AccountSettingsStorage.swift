//
//  AccountSettingsStorage.swift
//  Cloudwrkz
//
//  Persists account-level preferences: notifications, appearance, etc.
//

import Foundation

struct AccountSettingsStorage {
    private static let notificationsEnabledKey = "cloudwrkz.account.notificationsEnabled"
    private static let emailDigestKey = "cloudwrkz.account.emailDigest"
    private static let appearanceKey = "cloudwrkz.account.appearance"
    private static let biometricLockKey = "cloudwrkz.account.biometricLock"
    private static let displayLanguageKey = "cloudwrkz.account.displayLanguage"
    private static let timeTrackingDefaultPeriodKey = "cloudwrkz.account.timeTrackingDefaultPeriod"
    private static let timeTrackingCustomDaysKey = "cloudwrkz.account.timeTrackingCustomDays"
    private static let thirdPartyLocationSuggestionsEnabledKey = "cloudwrkz.account.thirdPartyLocationSuggestionsEnabled"

    /// Master switch for push notifications.
    static var notificationsEnabled: Bool {
        get {
            if UserDefaults.standard.object(forKey: notificationsEnabledKey) == nil {
                return true
            }
            return UserDefaults.standard.bool(forKey: notificationsEnabledKey)
        }
        set { UserDefaults.standard.set(newValue, forKey: notificationsEnabledKey) }
    }

    /// Email digest (daily/weekly summary). Off by default.
    static var emailDigestEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: emailDigestKey) }
        set { UserDefaults.standard.set(newValue, forKey: emailDigestKey) }
    }

    /// Appearance: "system", "light", "dark". Applied when app supports it.
    static var appearance: String {
        get { UserDefaults.standard.string(forKey: appearanceKey) ?? "system" }
        set { UserDefaults.standard.set(newValue, forKey: appearanceKey) }
    }

    /// Use Face ID / Touch ID to unlock app. Off by default.
    static var biometricLockEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: biometricLockKey) }
        set { UserDefaults.standard.set(newValue, forKey: biometricLockKey) }
    }

    /// Display language: "system" (follow device), or a locale identifier e.g. "en", "de".
    /// Applied at app launch via AppleLanguages; change takes effect after restart.
    static var displayLanguage: String {
        get { UserDefaults.standard.string(forKey: displayLanguageKey) ?? "system" }
        set { UserDefaults.standard.set(newValue, forKey: displayLanguageKey) }
    }

    /// Time tracking overview default period: "month", "quarter", "year", or "custom".
    static var timeTrackingDefaultPeriod: String {
        get { UserDefaults.standard.string(forKey: timeTrackingDefaultPeriodKey) ?? "month" }
        set { UserDefaults.standard.set(newValue, forKey: timeTrackingDefaultPeriodKey) }
    }

    /// When timeTrackingDefaultPeriod is "custom", number of days to show (e.g. 30).
    static var timeTrackingCustomDays: Int {
        get {
            let v = UserDefaults.standard.integer(forKey: timeTrackingCustomDaysKey)
            return v > 0 ? v : 30
        }
        set { UserDefaults.standard.set(max(1, min(366, newValue)), forKey: timeTrackingCustomDaysKey) }
    }

    /// Allows sending typed location queries to OpenStreetMap (Nominatim) for address autocomplete.
    /// Disabled by default (privacy by default).
    static var thirdPartyLocationSuggestionsEnabled: Bool {
        get {
            if UserDefaults.standard.object(forKey: thirdPartyLocationSuggestionsEnabledKey) == nil {
                return false
            }
            return UserDefaults.standard.bool(forKey: thirdPartyLocationSuggestionsEnabledKey)
        }
        set { UserDefaults.standard.set(newValue, forKey: thirdPartyLocationSuggestionsEnabledKey) }
    }

    /// Clears all account settings on logout so the next user gets defaults.
    static func clear() {
        UserDefaults.standard.removeObject(forKey: notificationsEnabledKey)
        UserDefaults.standard.removeObject(forKey: emailDigestKey)
        UserDefaults.standard.removeObject(forKey: appearanceKey)
        UserDefaults.standard.removeObject(forKey: biometricLockKey)
        UserDefaults.standard.removeObject(forKey: displayLanguageKey)
        UserDefaults.standard.removeObject(forKey: timeTrackingDefaultPeriodKey)
        UserDefaults.standard.removeObject(forKey: timeTrackingCustomDaysKey)
        UserDefaults.standard.removeObject(forKey: thirdPartyLocationSuggestionsEnabledKey)
    }
}
