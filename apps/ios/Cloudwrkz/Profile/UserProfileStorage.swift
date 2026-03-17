//
//  UserProfileStorage.swift
//  Cloudwrkz
//
//  Persists display name and optional profile image for the dashboard avatar.
//

import Foundation
import UIKit

struct UserProfileStorage {
    private static let firstNameKey = "cloudwrkz.userProfile.firstName"
    private static let lastNameKey = "cloudwrkz.userProfile.lastName"
    private static let emailKey = "cloudwrkz.userProfile.email"
    private static let usernameKey = "cloudwrkz.userProfile.username"
    private static let profileImageKey = "cloudwrkz.userProfile.imageData"
    private static let firstLoginAtKey = "cloudwrkz.userProfile.firstLoginAt"
    private static let lastSignedInAtKey = "cloudwrkz.userProfile.lastSignedInAt"
    private static let allowedModuleIdsKey = "cloudwrkz.userProfile.allowedModuleIds"

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
    }
}

