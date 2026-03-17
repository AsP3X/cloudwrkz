//
//  ProfileAvatarView.swift
//  Cloudwrkz
//
//  Profile icon: profile image in a circle, or initials (e.g. "NV" for Niklas Vorberg) when no image.
//

import SwiftUI

struct ProfileAvatarView: View {
    var firstName: String?
    var lastName: String?
    /// Display name from API (e.g. "Niklas Vorberg"). Used for initials when first/last name are not set.
    var username: String?
    var profileImageData: Data?
    var size: CGFloat = 36

    /// Initials: first letter of first + last name, or from username (first letter of first two words), e.g. "NV" for "Niklas Vorberg".
    /// Uses UserProfileStorage.username when no name is passed so initials show without interaction (e.g. after async fetch).
    private var initials: String {
        let first = (firstName?.trimmingCharacters(in: .whitespaces).first.map(String.init) ?? "").uppercased()
        let last = (lastName?.trimmingCharacters(in: .whitespaces).first.map(String.init) ?? "").uppercased()
        if !first.isEmpty || !last.isEmpty {
            return first + last
        }
        let nameForInitials = username?.trimmingCharacters(in: .whitespaces)
            ?? UserProfileStorage.username?.trimmingCharacters(in: .whitespaces)
        return initialsFromUsername(nameForInitials)
    }

    private func initialsFromUsername(_ name: String?) -> String {
        guard let name = name, !name.isEmpty else { return "?" }
        let words = name.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
        if words.isEmpty { return "?" }
        let first = String(words[0].prefix(1)).uppercased()
        if words.count >= 2 {
            let last = String(words[1].prefix(1)).uppercased()
            return first + last
        }
        return first
    }

    var body: some View {
        Group {
            if let data = profileImageData, let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                Text(initials)
                    .font(.system(size: size * 0.44, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(
            Circle()
                .stroke(CloudwrkzColors.primary400.opacity(0.6), lineWidth: 1.5)
        )
        .contentShape(Circle())
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        let firstLast = [firstName, lastName].compactMap { $0?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: " ")
        let name = !firstLast.isEmpty ? firstLast : (username?.trimmingCharacters(in: .whitespaces) ?? "")
        if !name.isEmpty {
            return "Profile photo for \(name)"
        }
        return "Profile photo"
    }
}

#Preview("Initials") {
    ZStack {
        Color.gray
        ProfileAvatarView(firstName: "Jane", lastName: "Doe", size: 44)
    }
}

#Preview("Fallback") {
    ZStack {
        Color.gray
        ProfileAvatarView(firstName: nil, lastName: nil, size: 44)
    }
}

#Preview("From username") {
    ZStack {
        Color.gray
        ProfileAvatarView(firstName: nil, lastName: nil, username: "Niklas Vorberg", size: 44)
    }
}
