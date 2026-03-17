//
//  AddLinkCollectionChooserView.swift
//  Cloudwrkz
//
//  Multi-select collection chooser for Add Link. Liquid glass, matches AddLinkView.
//

import SwiftUI

struct AddLinkCollectionChooserView: View {
    @Environment(\.dismiss) private var dismiss
    var collections: [Collection]
    @Binding var selectedIds: Set<String>

    private var background: some View {
        LinearGradient(
            colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.8)
            .foregroundStyle(CloudwrkzColors.neutral500)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                background
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        sectionLabel("Add link to one or more collections")
                        if collections.isEmpty {
                            Text("No collections yet. Create one from the Links screen.")
                                .font(.system(size: 15, weight: .regular))
                                .foregroundStyle(CloudwrkzColors.neutral400)
                                .padding(20)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
                        } else {
                            VStack(spacing: 0) {
                                ForEach(collections) { collection in
                                    chooserRow(collection: collection)
                                }
                            }
                            .padding(20)
                            .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
            }
            .navigationTitle("Choose Collections")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(CloudwrkzColors.neutral950.opacity(0.95), for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
            .tint(CloudwrkzColors.primary400)
        }
    }

    private func chooserRow(collection: Collection) -> some View {
        let isSelected = selectedIds.contains(collection.id)
        let hasColor = collection.color.flatMap { c in c.count == 7 && c.hasPrefix("#") } == true
        return Button {
            var next = selectedIds
            if isSelected {
                next.remove(collection.id)
            } else {
                next.insert(collection.id)
            }
            selectedIds = next
        } label: {
            HStack(spacing: 12) {
                if hasColor, let color = collection.color {
                    Circle()
                        .fill(Color(hex: color))
                        .frame(width: 12, height: 12)
                }
                Text(collection.name)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                Spacer()
                if isSelected {
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
}

#Preview {
    AddLinkCollectionChooserView(
        collections: [
            Collection(id: "1", name: "Work", description: nil, color: "#3B82F6", _count: nil),
            Collection(id: "2", name: "Reading", description: nil, color: "#10B981", _count: nil),
        ],
        selectedIds: .constant(["1"])
    )
}
