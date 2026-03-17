//
//  PrivacyPolicyView.swift
//  Cloudwrkz
//
//  DSGVO/GDPR-compliant privacy policy displayed in-app.
//  Covers Art. 13/14 information obligations, data subject rights,
//  third-party disclosures, and data retention.
//

import SwiftUI

struct PrivacyPolicyView: View {
    @Environment(\.dismiss) private var dismiss

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
                        policyHeader
                        controllerSection
                        dataCollectionSection
                        legalBasisSection
                        thirdPartySection
                        dataStorageSection
                        dataRetentionSection
                        userRightsSection
                        securitySection
                        childrenSection
                        changesSection
                        contactSection
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 48)
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("privacy_policy.title")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("common.done") {
                        dismiss()
                    }
                    .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
        }
    }

    // MARK: - Header

    private var policyHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Image(systemName: "hand.raised.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text("privacy_policy.title")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            Text("privacy_policy.last_updated")
                .font(.system(size: 13))
                .foregroundStyle(CloudwrkzColors.neutral500)
        }
    }

    // MARK: - Sections

    private var controllerSection: some View {
        policySection(
            title: "privacy_policy.controller_title",
            icon: "building.2.fill"
        ) {
            policyText("privacy_policy.controller_body")
        }
    }

    private var dataCollectionSection: some View {
        policySection(
            title: "privacy_policy.data_collection_title",
            icon: "doc.text.fill"
        ) {
            policyText("privacy_policy.data_collection_body")
        }
    }

    private var legalBasisSection: some View {
        policySection(
            title: "privacy_policy.legal_basis_title",
            icon: "scalemass.fill"
        ) {
            policyText("privacy_policy.legal_basis_body")
        }
    }

    private var thirdPartySection: some View {
        policySection(
            title: "privacy_policy.third_party_title",
            icon: "arrow.triangle.branch"
        ) {
            policyText("privacy_policy.third_party_body")
        }
    }

    private var dataStorageSection: some View {
        policySection(
            title: "privacy_policy.data_storage_title",
            icon: "lock.shield.fill"
        ) {
            policyText("privacy_policy.data_storage_body")
        }
    }

    private var dataRetentionSection: some View {
        policySection(
            title: "privacy_policy.data_retention_title",
            icon: "clock.fill"
        ) {
            policyText("privacy_policy.data_retention_body")
        }
    }

    private var userRightsSection: some View {
        policySection(
            title: "privacy_policy.your_rights_title",
            icon: "person.crop.circle.badge.checkmark"
        ) {
            policyText("privacy_policy.your_rights_body")
        }
    }

    private var securitySection: some View {
        policySection(
            title: "privacy_policy.security_title",
            icon: "lock.fill"
        ) {
            policyText("privacy_policy.security_body")
        }
    }

    private var childrenSection: some View {
        policySection(
            title: "privacy_policy.children_title",
            icon: "person.2.fill"
        ) {
            policyText("privacy_policy.children_body")
        }
    }

    private var changesSection: some View {
        policySection(
            title: "privacy_policy.changes_title",
            icon: "doc.badge.arrow.up.fill"
        ) {
            policyText("privacy_policy.changes_body")
        }
    }

    private var contactSection: some View {
        policySection(
            title: "privacy_policy.contact_title",
            icon: "envelope.fill"
        ) {
            policyText("privacy_policy.contact_body")
        }
    }

    // MARK: - Helpers

    private func policySection<Content: View>(
        title: LocalizedStringKey,
        icon: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text(title)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassPanel(cornerRadius: 16, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
    }

    private func policyText(_ key: LocalizedStringKey) -> some View {
        Text(key)
            .font(.system(size: 14, weight: .regular))
            .foregroundStyle(CloudwrkzColors.neutral400)
            .fixedSize(horizontal: false, vertical: true)
    }
}

#Preview {
    PrivacyPolicyView()
}
