//
//  UserProfileStorage.swift
//  Cloudwrkz
//
//  Persists display name and optional profile image for the dashboard avatar.
//

import Foundation
import UIKit

// Human: Snapshot from GET `/me` used for profile health, completeness, and badges—kept beside cached display fields.
// Agent: CurrentUserInfo CARRY name email modules emailVerified bio timezone avatar role status createdAt lastLoginAt; UserProfileStorage.applyFromMe.

struct CurrentUserInfo: Sendable {
    let name: String?
    let email: String?
    let modules: [String]?
    let emailVerified: Bool
    let bio: String?
    let timezone: String?
    let avatar: String?
    let role: String?
    let status: String?
    let createdAt: String?
    let lastLoginAt: String?
}

// Human: Cached profile fields let the dashboard show a name/avatar immediately on cold start without waiting on `/me` again.
// Agent: UserDefaults keys cloudwrkz.userProfile.*; firstName lastName email username profileImageData JPEG Data; firstLoginAt lastSignedInAt allowedModuleIds.

struct UserProfileStorage {
    private static let firstNameKey = "cloudwrkz.userProfile.firstName"
    private static let lastNameKey = "cloudwrkz.userProfile.lastName"
    private static let emailKey = "cloudwrkz.userProfile.email"
    private static let usernameKey = "cloudwrkz.userProfile.username"
    private static let profileImageKey = "cloudwrkz.userProfile.imageData"
    private static let firstLoginAtKey = "cloudwrkz.userProfile.firstLoginAt"
    private static let lastSignedInAtKey = "cloudwrkz.userProfile.lastSignedInAt"
    private static let allowedModuleIdsKey = "cloudwrkz.userProfile.allowedModuleIds"
    private static let emailVerifiedKey = "cloudwrkz.userProfile.emailVerified"
    private static let bioKey = "cloudwrkz.userProfile.bio"
    private static let timezoneKey = "cloudwrkz.userProfile.timezone"
    private static let serverAvatarURLKey = "cloudwrkz.userProfile.serverAvatarURL"
    private static let userRoleKey = "cloudwrkz.userProfile.userRole"
    private static let accountStatusKey = "cloudwrkz.userProfile.accountStatus"
    private static let serverCreatedAtKey = "cloudwrkz.userProfile.serverCreatedAt"
    private static let serverLastLoginAtKey = "cloudwrkz.userProfile.serverLastLoginAt"

    static var firstName: String? {
        get { UserDefaults.standard.string(forKey: firstNameKey) }
        set { UserDefaults.standard.set(newValue, forKey: firstNameKey) }
    }

    static var lastName: String? {
        get { UserDefaults.standard.string(forKey: lastNameKey) }
        set { UserDefaults.standard.set(newValue, forKey: lastNameKey) }
    }

    /// Email used to sign in. Fallback for display when name/username are not set.
    static var email: String? {
        get { UserDefaults.standard.string(forKey: emailKey) }
        set { UserDefaults.standard.set(newValue, forKey: emailKey) }
    }

    /// Display name from login API (user.name). Shown in profile menu when set.
    static var username: String? {
        get { UserDefaults.standard.string(forKey: usernameKey) }
        set { UserDefaults.standard.set(newValue, forKey: usernameKey) }
    }

    /// JPEG/PNG data for the profile image. Nil = use initials.
    static var profileImageData: Data? {
        get { UserDefaults.standard.data(forKey: profileImageKey) }
        set { UserDefaults.standard.set(newValue, forKey: profileImageKey) }
    }

    /// Set once on first successful login. Shown as "Member since" in profile.
    static var firstLoginAt: Date? {
        get {
            let t = UserDefaults.standard.double(forKey: firstLoginAtKey)
            return t > 0 ? Date(timeIntervalSince1970: t) : nil
        }
        set { UserDefaults.standard.set(newValue?.timeIntervalSince1970 ?? 0, forKey: firstLoginAtKey) }
    }

    /// Updated on every successful login. Shown as "Last signed in" in profile.
    static var lastSignedInAt: Date? {
        get {
            let t = UserDefaults.standard.double(forKey: lastSignedInAtKey)
            return t > 0 ? Date(timeIntervalSince1970: t) : nil
        }
        set { UserDefaults.standard.set(newValue?.timeIntervalSince1970 ?? 0, forKey: lastSignedInAtKey) }
    }

    /// From GET `/me` after successful login or profile refresh.
    static var emailVerified: Bool {
        get { UserDefaults.standard.bool(forKey: emailVerifiedKey) }
        set { UserDefaults.standard.set(newValue, forKey: emailVerifiedKey) }
    }

    /// Account bio from `/me` (may be empty).
    static var bio: String? {
        get { UserDefaults.standard.string(forKey: bioKey) }
        set {
            if let newValue {
                UserDefaults.standard.set(newValue, forKey: bioKey)
            } else {
                UserDefaults.standard.removeObject(forKey: bioKey)
            }
        }
    }

    /// IANA timezone from `/me` (e.g. `Europe/Berlin`); used for completeness vs UTC.
    static var timezone: String? {
        get { UserDefaults.standard.string(forKey: timezoneKey) }
        set {
            if let newValue, !newValue.isEmpty { UserDefaults.standard.set(newValue, forKey: timezoneKey) }
            else { UserDefaults.standard.removeObject(forKey: timezoneKey) }
        }
    }

    /// Server-side avatar path/URL when present (complements locally cached `profileImageData`).
    static var serverAvatarURL: String? {
        get { UserDefaults.standard.string(forKey: serverAvatarURLKey) }
        set {
            if let newValue, !newValue.isEmpty { UserDefaults.standard.set(newValue, forKey: serverAvatarURLKey) }
            else { UserDefaults.standard.removeObject(forKey: serverAvatarURLKey) }
        }
    }

    /// User role from `/me` (e.g. ADMIN, AGENT).
    static var userRole: String? {
        get { UserDefaults.standard.string(forKey: userRoleKey) }
        set {
            if let newValue, !newValue.isEmpty { UserDefaults.standard.set(newValue, forKey: userRoleKey) }
            else { UserDefaults.standard.removeObject(forKey: userRoleKey) }
        }
    }

    /// Account status from `/me` (e.g. ACTIVE, PENDING).
    static var accountStatus: String? {
        get { UserDefaults.standard.string(forKey: accountStatusKey) }
        set {
            if let newValue, !newValue.isEmpty { UserDefaults.standard.set(newValue, forKey: accountStatusKey) }
            else { UserDefaults.standard.removeObject(forKey: accountStatusKey) }
        }
    }

    /// ISO-like timestamp string from `/me` `createdAt`.
    static var serverCreatedAt: String? {
        get { UserDefaults.standard.string(forKey: serverCreatedAtKey) }
        set {
            if let newValue, !newValue.isEmpty { UserDefaults.standard.set(newValue, forKey: serverCreatedAtKey) }
            else { UserDefaults.standard.removeObject(forKey: serverCreatedAtKey) }
        }
    }

    /// ISO-like timestamp string from `/me` `lastLoginAt`.
    static var serverLastLoginAt: String? {
        get { UserDefaults.standard.string(forKey: serverLastLoginAtKey) }
        set {
            if let newValue, !newValue.isEmpty { UserDefaults.standard.set(newValue, forKey: serverLastLoginAtKey) }
            else { UserDefaults.standard.removeObject(forKey: serverLastLoginAtKey) }
        }
    }

    /// Module IDs the user is allowed to access (e.g. from /api/me). Nil = not yet loaded; [] = no modules; non-empty = those modules.
    static var allowedModuleIds: [String]? {
        get {
            guard let data = UserDefaults.standard.data(forKey: allowedModuleIdsKey),
                  let ids = try? JSONDecoder().decode([String].self, from: data) else { return nil }
            return ids
        }
        set {
            if newValue == nil {
                UserDefaults.standard.removeObject(forKey: allowedModuleIdsKey)
            } else if let data = try? JSONEncoder().encode(newValue) {
                UserDefaults.standard.set(data, forKey: allowedModuleIdsKey)
            }
        }
    }

    /// Clears profile when user logs out so the next account doesn’t show previous avatar.
    static func clear() {
        firstName = nil
        lastName = nil
        email = nil
        username = nil
        profileImageData = nil
        firstLoginAt = nil
        lastSignedInAt = nil
        allowedModuleIds = nil
        emailVerified = false
        bio = nil
        timezone = nil
        serverAvatarURL = nil
        userRole = nil
        accountStatus = nil
        serverCreatedAt = nil
        serverLastLoginAt = nil
    }

    /// Persists fields returned by `AuthService.fetchCurrentUser` for profile UI and completeness.
    static func applyFromMe(_ info: CurrentUserInfo) {
        if let n = info.name?.trimmingCharacters(in: .whitespacesAndNewlines), !n.isEmpty {
            username = n
        }
        if let e = info.email?.trimmingCharacters(in: .whitespacesAndNewlines), !e.isEmpty {
            email = e
        }
        allowedModuleIds = info.modules
        emailVerified = info.emailVerified
        let trimmedBio = info.bio?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        bio = trimmedBio.isEmpty ? nil : trimmedBio
        let trimmedTz = info.timezone?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        timezone = trimmedTz.isEmpty ? nil : trimmedTz
        let trimmedAvatar = info.avatar?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        serverAvatarURL = trimmedAvatar.isEmpty ? nil : trimmedAvatar
        let roleTrim = info.role?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        userRole = roleTrim.isEmpty ? nil : roleTrim
        let statusTrim = info.status?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        accountStatus = statusTrim.isEmpty ? nil : statusTrim
        serverCreatedAt = info.createdAt
        serverLastLoginAt = info.lastLoginAt
    }
}

