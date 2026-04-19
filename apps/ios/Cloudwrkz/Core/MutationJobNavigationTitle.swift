//
//  MutationJobNavigationTitle.swift
//  Cloudwrkz
//
//  Animated navigation bar title swap when background mutation jobs are queued/completed.
//

import SwiftUI

// MARK: - Hooks (passed into API services; optional)

/// Optional UI callbacks when the API returns 202 and after the mutation job finishes.
struct MutationJobTitleHooks: Sendable {
    var onQueued: (@Sendable () async -> Void)?
    var onCompleted: (@Sendable () async -> Void)?

    init(
        onQueued: (@Sendable () async -> Void)? = nil,
        onCompleted: (@Sendable () async -> Void)? = nil
    ) {
        self.onQueued = onQueued
        self.onCompleted = onCompleted
    }
}

// MARK: - Carousel state

/// Visual style for the mutation status pill (queued vs completed).
enum MutationJobBannerKind: Sendable {
    case queued
    case completed
}

@MainActor
@Observable
final class MutationTitleCarouselState {
    private static let slideDuration: TimeInterval = 0.28
    private static let messageHold: TimeInterval = 1.5

    var message: String = ""
    var bannerKind: MutationJobBannerKind = .queued
    var titleOffset: CGFloat = 0
    var titleOpacity: Double = 1
    var infoOffset: CGFloat = 18
    var infoOpacity: Double = 0
    /// When true, the info label participates in layout (needed mid-transition).
    var showInfoLayer: Bool = false

    /// Title out → message in (1.5s) → message out → title in from top.
    func playCycle(message: String, bannerKind: MutationJobBannerKind) async {
        self.message = message
        self.bannerKind = bannerKind
        let slideNs = UInt64(Self.slideDuration * 1_000_000_000)
        let holdNs = UInt64(Self.messageHold * 1_000_000_000)

        // 1. Title animates out (up)
        withAnimation(.easeInOut(duration: Self.slideDuration)) {
            titleOffset = -22
            titleOpacity = 0
        }
        try? await Task.sleep(nanoseconds: slideNs + 15_000_000)

        // 2. Info animates in (from below)
        showInfoLayer = true
        infoOffset = 18
        infoOpacity = 0
        withAnimation(.easeInOut(duration: Self.slideDuration)) {
            infoOffset = 0
            infoOpacity = 1
        }
        try? await Task.sleep(nanoseconds: slideNs + 15_000_000)

        try? await Task.sleep(nanoseconds: holdNs)

        // 3. Info animates out (up)
        withAnimation(.easeInOut(duration: Self.slideDuration)) {
            infoOffset = -20
            infoOpacity = 0
        }
        try? await Task.sleep(nanoseconds: slideNs + 15_000_000)
        showInfoLayer = false

        // 4. Title animates back in from top
        titleOffset = -22
        titleOpacity = 0
        withAnimation(.easeInOut(duration: Self.slideDuration)) {
            titleOffset = 0
            titleOpacity = 1
        }
        try? await Task.sleep(nanoseconds: slideNs + 15_000_000)
    }
}

// MARK: - Principal title view

private struct MutationTitlePrincipalView: View {
    let baseTitle: LocalizedStringKey
    @Bindable var state: MutationTitleCarouselState

    var body: some View {
        ZStack {
            Text(baseTitle)
                .font(.headline)
                .foregroundStyle(.primary)
                .offset(y: state.titleOffset)
                .opacity(state.titleOpacity)

            if state.showInfoLayer || state.infoOpacity > 0.01 {
                Text(state.message)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(mutationBannerBackground(for: state.bannerKind))
                    )
                    .offset(y: state.infoOffset)
                    .opacity(state.infoOpacity)
                    .accessibilityLabel(state.message)
            }
        }
        .frame(minHeight: 22)
        .frame(maxWidth: .infinity)
        .multilineTextAlignment(.center)
        .clipped()
    }

    private func mutationBannerBackground(for kind: MutationJobBannerKind) -> Color {
        switch kind {
        case .queued:
            return Color(red: 234/255, green: 88/255, blue: 12/255)
        case .completed:
            return CloudwrkzColors.success500
        }
    }
}

// MARK: - View extension

extension View {
    /// Replaces the inline navigation title with a carousel-capable principal title. Use with `MutationTitleCarouselState.playCycle` driven by `MutationJobTitleHooks` from services.
    func mutationJobNavigationTitle(_ baseTitle: LocalizedStringKey, state: MutationTitleCarouselState) -> some View {
        self
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    MutationTitlePrincipalView(baseTitle: baseTitle, state: state)
                }
            }
    }

}
