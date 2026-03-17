//
//  ProfileEditView.swift
//  Cloudwrkz
//
//  Edit profile: name fields and profile photo. Liquid glass, gradient background.
//  Profile image is downscaled to < 1MB for upload and local storage.
//

import SwiftUI
import PhotosUI

/// Target max size for profile image (under 1MB to stay within API limit and reduce traffic).
private let profileImageMaxBytes = 1000 * 1024 // 1000 KB
/// Max dimension in points; large enough to stay sharp in UI (avatars, profile hero).
private let profileImageMaxDimension: CGFloat = 1024

struct ProfileEditView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appState) private var appState

    var onSave: (() -> Void)?

    @State private var firstName: String = ""
    @State private var lastName: String = ""
    @State private var profileImageData: Data?
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var isSaving = false
    @State private var saveError: String?
    @FocusState private var focusedField: Field?

    private enum Field {
        case firstName, lastName
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
                        if let saveError = saveError {
                            Text(saveError)
                                .font(.system(size: 13, weight: .regular))
                                .foregroundStyle(CloudwrkzColors.error500)
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(CloudwrkzColors.error500.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                        }
                        avatarSection
                        nameSection
                    }
                    .padding(20)
                }
                .overlay {
                    if isSaving {
                        Color.black.opacity(0.4)
                            .ignoresSafeArea()
CloudwrkzSpinner(tint: CloudwrkzColors.neutral100)
                        .scaleEffect(1.2)
                    }
                }
            }
            .navigationTitle("profile.edit_profile_nav")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("add_todo.cancel") {
                        dismiss()
                    }
                    .foregroundStyle(CloudwrkzColors.primary400)
                    .accessibilityLabel("Cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("add_todo.save") {
                        Task { await saveAndDismiss() }
                    }
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(CloudwrkzColors.primary400)
                    .accessibilityLabel("Save")
                    .disabled(isSaving)
                }
            }
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(CloudwrkzColors.neutral950.opacity(0.95), for: .navigationBar)
            .tint(CloudwrkzColors.primary400)
            .onAppear {
                loadFromStorage()
            }
            .onChange(of: selectedPhotoItem) { _, newItem in
                Task {
                    await loadSelectedPhoto(newItem)
                }
            }
        }
    }

    private var avatarSection: some View {
        VStack(spacing: 12) {
            PhotosPicker(
                selection: $selectedPhotoItem,
                matching: .images,
                photoLibrary: .shared()
            ) {
                ProfileAvatarView(
                    firstName: firstName.isEmpty ? nil : firstName,
                    lastName: lastName.isEmpty ? nil : lastName,
                    username: nil,
                    profileImageData: profileImageData,
                    size: 100
                )
                .overlay(
                    Circle()
                        .fill(.black.opacity(0.4))
                        .overlay(
                            Image(systemName: "camera.fill")
                                .font(.system(size: 28))
                                .foregroundStyle(.white)
                        )
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Change profile photo")

            Text("profile.tap_to_change_photo")
                .font(.system(size: 13, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral500)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)
    }

    private var nameSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("profile.name_label")
                .font(.system(size: 11, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(CloudwrkzColors.neutral500)

            TextField("profile.first_name", text: $firstName)
                .textContentType(.givenName)
                .autocapitalization(.words)
                .focused($focusedField, equals: .firstName)
                .foregroundStyle(CloudwrkzColors.neutral100)
                .padding(14)
                .glassField(cornerRadius: 12)

            TextField("profile.last_name", text: $lastName)
                .textContentType(.familyName)
                .autocapitalization(.words)
                .focused($focusedField, equals: .lastName)
                .foregroundStyle(CloudwrkzColors.neutral100)
                .padding(14)
                .glassField(cornerRadius: 12)
        }
    }

    private func loadFromStorage() {
        firstName = UserProfileStorage.firstName ?? ""
        lastName = UserProfileStorage.lastName ?? ""
        profileImageData = UserProfileStorage.profileImageData
    }

    private func loadSelectedPhoto(_ item: PhotosPickerItem?) async {
        guard let item = item else {
            selectedPhotoItem = nil
            return
        }
        do {
            if let data = try await item.loadTransferable(type: Data.self), let uiImage = UIImage(data: data) {
                let resized = ProfileImageResizer.downscaleToUnderMaxBytes(uiImage, maxBytes: profileImageMaxBytes, maxDimension: profileImageMaxDimension)
                await MainActor.run {
                    profileImageData = resized
                }
            }
        } catch {
            // Keep previous image on failure
        }
    }

    private func saveAndDismiss() async {
        saveError = nil
        let first = firstName.trimmingCharacters(in: .whitespaces)
        let last = lastName.trimmingCharacters(in: .whitespaces)
        UserProfileStorage.firstName = first.isEmpty ? nil : first
        UserProfileStorage.lastName = last.isEmpty ? nil : last

        if let imageDataOrig = profileImageData, AuthTokenStorage.getToken() != nil {
            var imageData = imageDataOrig
            if imageData.count > profileImageMaxBytes, let uiImage = UIImage(data: imageData) {
                imageData = ProfileImageResizer.downscaleToUnderMaxBytes(uiImage, maxBytes: profileImageMaxBytes, maxDimension: profileImageMaxDimension) ?? imageData
            }
            await MainActor.run { isSaving = true }
            let config = appState.config
            let result = await ProfileService.uploadAvatar(config: config, imageData: imageData)
            await MainActor.run { isSaving = false }
            switch result {
            case .success:
                break
            case .failure(let error):
                let message: String = switch error {
                case .noServerURL: "Server not configured."
                case .noToken: "Not signed in."
                case .unauthorized: "Session expired. Please sign in again."
                case .serverError(let msg): msg
                case .networkError(let desc): desc
                case .encodingFailed: "Failed to prepare upload."
                }
                await MainActor.run { saveError = message }
                return
            }
        }

        UserProfileStorage.profileImageData = profileImageData
        onSave?()
        dismiss()
    }
}

// MARK: - Profile image resizer (guarantees output < maxBytes, visible size)

enum ProfileImageResizer {
    /// Downscales and compresses the image to JPEG so it is under `maxBytes`, while keeping
    /// a max dimension of `maxDimension` for visibility. No matter how large the source is,
    /// the result stays under the limit.
    static func downscaleToUnderMaxBytes(_ image: UIImage, maxBytes: Int, maxDimension: CGFloat) -> Data? {
        let size = image.size
        guard size.width > 0, size.height > 0 else { return nil }

        let scale = min(maxDimension / size.width, maxDimension / size.height, 1)
        var currentSize = CGSize(width: size.width * scale, height: size.height * scale)
        var quality: CGFloat = 0.85
        let qualitySteps: [CGFloat] = [0.85, 0.7, 0.55, 0.4, 0.25]

        for q in qualitySteps {
            quality = q
            let renderer = UIGraphicsImageRenderer(size: currentSize)
            let resized = renderer.image { _ in
                image.draw(in: CGRect(origin: .zero, size: currentSize))
            }
            if let data = resized.jpegData(compressionQuality: quality), data.count <= maxBytes {
                return data
            }
        }

        var dimension = maxDimension
        while dimension >= 200 {
            let scale = min(dimension / size.width, dimension / size.height, 1)
            currentSize = CGSize(width: size.width * scale, height: size.height * scale)
            let renderer = UIGraphicsImageRenderer(size: currentSize)
            let resized = renderer.image { _ in
                image.draw(in: CGRect(origin: .zero, size: currentSize))
            }
            if let data = resized.jpegData(compressionQuality: 0.5), data.count <= maxBytes {
                return data
            }
            dimension -= 256
        }

        return image.jpegData(compressionQuality: 0.3)
    }
}

#Preview {
    ProfileEditView(onSave: nil)
}
