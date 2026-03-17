//
//  CloudwrkzDesign.swift
//  Cloudwrkz
//
//  Liquid glass only. Enterprise-ready. No solid fills on UI chrome.
//  Adaptive: supports both dark and light appearance.
//

import os
import SwiftUI

// MARK: - View switch animations

extension Animation {
    /// Elastic slide used for view switches (auth flow, navigation push/pop).
    /// Spring with visible overshoot/bounce (low damping) for an elastic feel.
    static let elasticSlide = Animation.spring(response: 0.48, dampingFraction: 0.55)
}

// MARK: - Enterprise palette (adaptive dark/light)

enum CloudwrkzColors {

    // MARK: Primary – brand blues (same in both modes)

    static let primary400 = Color(red: 96/255, green: 165/255, blue: 250/255)
    static let primary500 = Color(red: 59/255, green: 130/255, blue: 246/255)
    static let primary600 = Color(red: 37/255, green: 99/255, blue: 235/255)
    static let primary700 = Color(red: 29/255, green: 78/255, blue: 216/255)
    static let primary800 = Color(red: 30/255, green: 64/255, blue: 175/255)
    static let primary900 = Color(red: 30/255, green: 58/255, blue: 138/255)

    // MARK: Background gradient endpoints (adaptive)

    /// Gradient start: deep navy (dark) → soft indigo wash (light)
    static let primary950 = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 23/255, green: 37/255, blue: 84/255, alpha: 1)
            : UIColor(red: 238/255, green: 242/255, blue: 255/255, alpha: 1)
    })

    /// Gradient end: near-black (dark) → warm off-white (light)
    static let neutral950 = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 12/255, green: 10/255, blue: 9/255, alpha: 1)
            : UIColor(red: 250/255, green: 250/255, blue: 249/255, alpha: 1)
    })

    // MARK: Neutrals – text and surfaces (adaptive: reversed in light mode)

    /// Heading text: near-white (dark) → near-black (light)
    static let neutral100 = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 245/255, green: 245/255, blue: 244/255, alpha: 1)
            : UIColor(red: 28/255, green: 25/255, blue: 23/255, alpha: 1)
    })

    /// Secondary text: warm light gray (dark) → warm dark gray (light)
    static let neutral200 = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 231/255, green: 229/255, blue: 228/255, alpha: 1)
            : UIColor(red: 41/255, green: 37/255, blue: 36/255, alpha: 1)
    })

    /// Body text: medium-light (dark) → medium-dark (light)
    static let neutral400 = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 168/255, green: 162/255, blue: 158/255, alpha: 1)
            : UIColor(red: 87/255, green: 83/255, blue: 78/255, alpha: 1)
    })

    /// Subtle text / section labels: stays mid-tone in both modes
    static let neutral500 = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 120/255, green: 113/255, blue: 108/255, alpha: 1)
            : UIColor(red: 120/255, green: 113/255, blue: 108/255, alpha: 1)
    })

    /// Surface accent (dark) → lighter surface (light)
    static let neutral600 = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 87/255, green: 83/255, blue: 78/255, alpha: 1)
            : UIColor(red: 168/255, green: 162/255, blue: 158/255, alpha: 1)
    })

    /// Deep surface (dark) → soft surface (light)
    static let neutral700 = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 68/255, green: 64/255, blue: 60/255, alpha: 1)
            : UIColor(red: 214/255, green: 211/255, blue: 209/255, alpha: 1)
    })

    /// Near-black surface (dark) → light surface (light)
    static let neutral800 = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 41/255, green: 37/255, blue: 36/255, alpha: 1)
            : UIColor(red: 231/255, green: 229/255, blue: 228/255, alpha: 1)
    })

    /// Deepest surface (dark) → lightest surface (light)
    static let neutral900 = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 28/255, green: 25/255, blue: 23/255, alpha: 1)
            : UIColor(red: 245/255, green: 245/255, blue: 244/255, alpha: 1)
    })

    // MARK: Semantic (health status, alerts – same in both modes)

    static let error50  = Color(red: 254/255, green: 242/255, blue: 242/255)
    static let error500 = Color(red: 239/255, green: 68/255, blue: 68/255)
    static let error700 = Color(red: 185/255, green: 28/255, blue: 28/255)
    static let success500 = Color(red: 34/255, green: 197/255, blue: 94/255)
    static let success400 = Color(red: 74/255, green: 222/255, blue: 128/255)
    static let warning500 = Color(red: 234/255, green: 179/255, blue: 8/255)
    static let warning400 = Color(red: 250/255, green: 204/255, blue: 21/255)

    // MARK: Adaptive helpers for glass chrome and dividers

    /// Bold text on gradient: white (dark) → near-black (light)
    static let textOnGradient = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor.white
            : UIColor(red: 28/255, green: 25/255, blue: 23/255, alpha: 1)
    })

    /// Stroke around glass panels
    static let glassStroke = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor.white.withAlphaComponent(0.22)
            : UIColor.black.withAlphaComponent(0.08)
    })

    /// Subtle stroke for cards and rows
    static let glassStrokeSubtle = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor.white.withAlphaComponent(0.12)
            : UIColor.black.withAlphaComponent(0.06)
    })

    /// Subtle fill for glass cards
    static let glassFillSubtle = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor.white.withAlphaComponent(0.04)
            : UIColor.black.withAlphaComponent(0.03)
    })

    /// Selected / highlighted fill for glass cards
    static let glassFillHighlight = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor.white.withAlphaComponent(0.08)
            : UIColor.black.withAlphaComponent(0.05)
    })

    /// Divider line between rows
    static let divider = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor.white.withAlphaComponent(0.12)
            : UIColor.black.withAlphaComponent(0.08)
    })
}

// MARK: - Liquid glass modifiers (adaptive strokes & tints)

private struct GlassPanelModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    var cornerRadius: CGFloat
    var tint: Color?
    var tintOpacity: Double

    @ViewBuilder
    func body(content: Content) -> some View {
        let effectTint = (tint ?? CloudwrkzColors.primary500).opacity(tintOpacity)
        if #available(iOS 26.0, *) {
            content
                .glassEffect(
                    .regular.tint(effectTint),
                    in: RoundedRectangle(cornerRadius: cornerRadius)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .stroke(CloudwrkzColors.glassStroke, lineWidth: 1)
                )
        } else {
            content
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius))
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .stroke(CloudwrkzColors.glassStroke, lineWidth: 1)
                )
        }
    }
}

private struct GlassButtonPrimaryModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    var cornerRadius: CGFloat

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(
                    .regular.tint(CloudwrkzColors.primary500.opacity(0.6)),
                    in: RoundedRectangle(cornerRadius: cornerRadius)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .stroke(Color.white.opacity(colorScheme == .dark ? 0.4 : 0.2), lineWidth: 1)
                )
        } else {
            content
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius))
                .background(
                    CloudwrkzColors.primary600.opacity(colorScheme == .dark ? 0.5 : 0.6),
                    in: RoundedRectangle(cornerRadius: cornerRadius)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .stroke(Color.white.opacity(colorScheme == .dark ? 0.4 : 0.2), lineWidth: 1)
                )
        }
    }
}

private struct GlassButtonSecondaryModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    var cornerRadius: CGFloat

    @ViewBuilder
    func body(content: Content) -> some View {
        let tintColor: Color = colorScheme == .dark ? .white.opacity(0.12) : .black.opacity(0.04)
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.clear.tint(tintColor), in: RoundedRectangle(cornerRadius: cornerRadius))
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .stroke(CloudwrkzColors.primary400.opacity(0.7), lineWidth: 1.5)
                )
        } else {
            content
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius))
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .stroke(CloudwrkzColors.primary400.opacity(0.7), lineWidth: 1.5)
                )
        }
    }
}

private struct GlassFieldModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    var cornerRadius: CGFloat

    @ViewBuilder
    func body(content: Content) -> some View {
        let tintColor: Color = colorScheme == .dark ? .white.opacity(0.06) : .black.opacity(0.03)
        let strokeColor: Color = colorScheme == .dark ? .white.opacity(0.18) : .black.opacity(0.08)
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.clear.tint(tintColor), in: RoundedRectangle(cornerRadius: cornerRadius))
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .stroke(strokeColor, lineWidth: 1)
                )
        } else {
            content
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius))
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .stroke(strokeColor, lineWidth: 1)
                )
        }
    }
}

extension View {
    /// Pure liquid glass panel. Translucent only; optional minimal tint.
    func glassPanel(cornerRadius: CGFloat = 24, tint: Color? = nil, tintOpacity: Double = 0.06) -> some View {
        modifier(GlassPanelModifier(cornerRadius: cornerRadius, tint: tint, tintOpacity: tintOpacity))
    }

    /// Primary CTA: glass with blue tint for clear visibility.
    func glassButtonPrimary(cornerRadius: CGFloat = 14) -> some View {
        modifier(GlassButtonPrimaryModifier(cornerRadius: cornerRadius))
    }

    /// Secondary action: glass with visible border for contrast.
    func glassButtonSecondary(cornerRadius: CGFloat = 14) -> some View {
        modifier(GlassButtonSecondaryModifier(cornerRadius: cornerRadius))
    }

    /// Input field: pure glass.
    func glassField(cornerRadius: CGFloat = 12) -> some View {
        modifier(GlassFieldModifier(cornerRadius: cornerRadius))
    }

    /// Reusable glass card background (replaces per-view menuCardGlass, profileRowGlass, etc.)
    func glassCard(cornerRadius: CGFloat = 16) -> some View {
        modifier(GlassCardModifier(cornerRadius: cornerRadius))
    }
}

// MARK: - Reusable glass card background modifier

private struct GlassCardModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    var cornerRadius: CGFloat

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .background {
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .fill(.clear)
                        .glassEffect(
                            .regular.tint(CloudwrkzColors.glassFillSubtle),
                            in: RoundedRectangle(cornerRadius: cornerRadius)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: cornerRadius)
                                .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                        )
                }
        } else {
            content
                .background {
                    Color.clear
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius))
                        .overlay(
                            RoundedRectangle(cornerRadius: cornerRadius)
                                .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                        )
                }
        }
    }
}

// MARK: - Pure SwiftUI spinner (avoids UIKit CircularUIKitProgressView / PlatformViewRepresentableAdaptor)

/// Circular loading indicator implemented in pure SwiftUI. Use instead of `ProgressView()` to avoid
/// "Unable to render flattened version of PlatformViewRepresentableAdaptor<CircularUIKitProgressView>" in Previews and elsewhere.
struct CloudwrkzSpinner: View {
    var tint: Color = CloudwrkzColors.primary400
    @State private var isAnimating = false

    var body: some View {
        Circle()
            .trim(from: 0.2, to: 1)
            .stroke(tint, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
            .rotationEffect(.degrees(isAnimating ? 360 : 0))
            .frame(width: 20, height: 20)
            .onAppear { withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: false)) { isAnimating = true } }
    }
}

// MARK: - Favicon image (bypasses AsyncImage cache, always fetches fresh)

/// Loads a remote image with explicit `reloadIgnoringLocalCacheData` policy so favicons
/// are always fresh after edits. SwiftUI's built-in `AsyncImage` uses an opaque URL cache
/// that can return stale (or previously-404) responses even when the server file has changed.
///
/// Includes the stored Bearer token in requests so that favicons load correctly even when
/// the server sits behind a reverse proxy that requires authentication.
struct FaviconImageView: View {
    let url: URL
    var size: CGFloat = 40
    var cornerRadius: CGFloat = 10
    var fallbackIcon: String = "link"
    var fallbackColor: Color = CloudwrkzColors.primary400

    @State private var uiImage: UIImage?
    @State private var failed = false
    @State private var loadTask: Task<Void, Never>?
    #if DEBUG
    @State private var debugInfo: String = ""
    @State private var showDebug = false
    #endif

    private static let logger = Logger(subsystem: "Cloudwrkz", category: "Favicon")
    private static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: config)
    }()

    var body: some View {
        ZStack {
            if let uiImage {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: size, height: size)
                    .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            } else if failed {
                fallbackView
            } else {
                CloudwrkzSpinner(tint: fallbackColor)
                    .scaleEffect(size > 30 ? 0.8 : 0.6)
            }
        }
        .frame(width: size, height: size)
        #if DEBUG
        .onTapGesture(count: 2) { showDebug.toggle() }
        .popover(isPresented: $showDebug) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Favicon Debug").font(.headline)
                Text("URL: \(url.absoluteString)")
                    .font(.system(size: 11, design: .monospaced))
                Text(debugInfo)
                    .font(.system(size: 11, design: .monospaced))
                Button("Retry") { startLoad() }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
            }
            .padding()
            .frame(minWidth: 300)
        }
        #endif
        .onAppear { startLoad() }
        .onChange(of: url) { _, _ in startLoad() }
        .onDisappear { loadTask?.cancel() }
    }

    private var fallbackView: some View {
        Image(systemName: fallbackIcon)
            .font(.system(size: size * 0.45))
            .foregroundStyle(fallbackColor)
    }

    private func startLoad() {
        loadTask?.cancel()
        uiImage = nil
        failed = false
        #if DEBUG
        debugInfo = "[favicon] loading \(url.absoluteString)"
        #endif
        Self.logger.debug("startLoad url=\(url.absoluteString)")
        loadTask = Task {
            do {
                var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
                let hasToken: Bool
                if let token = AuthTokenStorage.getToken(), !token.isEmpty {
                    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                    hasToken = true
                } else {
                    hasToken = false
                }
                AppIdentity.apply(to: &request)
                Self.logger.debug("fetching hasToken=\(hasToken) url=\(url.absoluteString)")
                let (data, response) = try await Self.session.data(for: request)
                guard !Task.isCancelled else {
                    Self.logger.debug("CANCELLED url=\(url.absoluteString)")
                    return
                }
                if let http = response as? HTTPURLResponse {
                    let contentType = http.value(forHTTPHeaderField: "Content-Type") ?? "nil"
                    Self.logger.debug("status=\(http.statusCode) contentType=\(contentType) bytes=\(data.count) finalURL=\(http.url?.absoluteString ?? "nil")")
                    #if DEBUG
                    debugInfo = "[favicon] \(http.statusCode) \(contentType) \(data.count)B url=\(http.url?.absoluteString ?? "?")"
                    #endif
                    guard (200...299).contains(http.statusCode) else {
                        failed = true
                        return
                    }
                } else {
                    Self.logger.debug("non-HTTP response url=\(url.absoluteString)")
                    #if DEBUG
                    debugInfo = "[favicon] non-HTTP response"
                    #endif
                    failed = true
                    return
                }
                if let image = UIImage(data: data) {
                    Self.logger.debug("SUCCESS \(Int(image.size.width))x\(Int(image.size.height)) url=\(url.absoluteString)")
                    #if DEBUG
                    debugInfo = "[favicon] OK \(data.count)B"
                    #endif
                    uiImage = image
                } else {
                    Self.logger.debug("UIImage DECODE FAILED bytes=\(data.count) url=\(url.absoluteString)")
                    #if DEBUG
                    debugInfo = "[favicon] decode fail \(data.count)B"
                    #endif
                    failed = true
                }
            } catch {
                Self.logger.error("ERROR \(error.localizedDescription) url=\(url.absoluteString)")
                #if DEBUG
                debugInfo = "[favicon] error: \(error.localizedDescription)"
                #endif
                if !Task.isCancelled {
                    failed = true
                }
            }
        }
    }
}

// MARK: - Color hex (for collection chips etc.)

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r, g, b: UInt64
        switch hex.count {
        case 6:
            r = (int >> 16) & 0xFF
            g = (int >> 8) & 0xFF
            b = int & 0xFF
            self.init(.sRGB, red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, opacity: 1)
        default:
            self.init(.sRGB, red: 0, green: 0, blue: 0, opacity: 1)
        }
    }
}
