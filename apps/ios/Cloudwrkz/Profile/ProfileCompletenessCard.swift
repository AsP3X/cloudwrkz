//
//  ProfileCompletenessCard.swift
//  Cloudwrkz
//
//  Inline checklist matching the web profile completeness widget (hidden when 100% complete).
//

import SwiftUI

// Human: Same five checks as the web dashboard so mobile users get the same “finish your profile” guidance.
// Agent: ProfileCompletenessCard READS five booleans; RENDERS progress + rows; onEditProfile vs onOpenAccountSettings per item.

struct ProfileCompletenessCard: View {
    var hasName: Bool
    var hasAvatar: Bool
    var emailVerified: Bool
    var hasBio: Bool
    var hasCustomTimezone: Bool
    var onEditProfile: () -> Void
    var onOpenAccountSettings: () -> Void

    private enum ItemKind: String, CaseIterable, Identifiable {
        case name, avatar, email, bio, timezone
        var id: String { rawValue }
    }

    private struct ItemRow {
        let kind: ItemKind
        let title: LocalizedStringKey
        let hint: LocalizedStringKey
        let done: Bool
        let action: () -> Void
    }

    private var items: [ItemRow] {
        [
            ItemRow(kind: .name, title: "profile.completeness.name", hint: "profile.completeness.name_hint", done: hasName, action: onEditProfile),
            ItemRow(kind: .avatar, title: "profile.completeness.avatar", hint: "profile.completeness.avatar_hint", done: hasAvatar, action: onEditProfile),
            ItemRow(kind: .email, title: "profile.completeness.email", hint: "profile.completeness.email_hint", done: emailVerified, action: onOpenAccountSettings),
            ItemRow(kind: .bio, title: "profile.completeness.bio", hint: "profile.completeness.bio_hint", done: hasBio, action: onEditProfile),
            ItemRow(kind: .timezone, title: "profile.completeness.timezone", hint: "profile.completeness.timezone_hint", done: hasCustomTimezone, action: onOpenAccountSettings),
        ]
    }

    private var completedCount: Int { items.filter(\.done).count }
    private var total: Int { items.count }
    private var percent: Int {
        guard total > 0 else { return 0 }
        return Int(round(Double(completedCount) / Double(total)) * 100)
    }

    private var isComplete: Bool { completedCount == total }

    var body: some View {
        Group {
            if !isComplete {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    Divider().overlay(CloudwrkzColors.divider)
                    ForEach(Array(items.enumerated()), id: \.element.kind.id) { index, item in
                        row(for: item)
                        if index < items.count - 1 {
                            Divider().overlay(CloudwrkzColors.divider.opacity(0.6))
                        }
                    }
                }
                .padding(.vertical, 4)
                .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("profile.completeness.title")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Spacer()
                Text("\(completedCount)/\(total)")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(CloudwrkzColors.neutral800)
                        .frame(height: 6)
                    Capsule()
                        .fill(CloudwrkzColors.primary500)
                        .frame(width: max(8, geo.size.width * CGFloat(percent) / 100), height: 6)
                }
            }
            .frame(height: 6)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(format: String(localized: "profile.completeness.a11y_progress_format"), locale: .current, percent))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    private func row(for item: ItemRow) -> some View {
        Group {
            if item.done {
                HStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(CloudwrkzColors.success500)
                    Text(item.title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(CloudwrkzColors.neutral500)
                        .strikethrough(true, color: CloudwrkzColors.neutral600)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .opacity(0.55)
            } else {
                Button {
                    item.action()
                } label: {
                    HStack(spacing: 12) {
                        Circle()
                            .strokeBorder(CloudwrkzColors.neutral600, lineWidth: 2)
                            .frame(width: 18, height: 18)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(CloudwrkzColors.neutral100)
                            Text(item.hint)
                                .font(.system(size: 12, weight: .regular))
                                .foregroundStyle(CloudwrkzColors.neutral500)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.neutral500)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}
