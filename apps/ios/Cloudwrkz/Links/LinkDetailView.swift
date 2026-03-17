//
//  LinkDetailView.swift
//  Cloudwrkz
//
//  Link detail page: title, URL, description, type, collections, tags. YouTube embed and GitHub card like website. Liquid glass, modern enterprise.
//

import SwiftUI

struct LinkDetailView: View {
    @Environment(\.appState) private var appState
    let link: Link
    /// Server base URL (e.g. https://cloudwrkz.com). Used to resolve relative favicon paths from the API. Defaults to app state.
    var serverBaseURL: URL?

    /// Cached so body doesn't re-run regex/URL parsing on every re-evaluation.
    @State private var cachedYouTubeVideoId: String?
    @State private var cachedGitHubParsed: GitHubParsed?

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()

    var body: some View {
        ZStack {
            background
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    headerSection
                    if let desc = link.description, !desc.isEmpty {
                        descriptionCard(desc)
                    }
                    if let videoId = cachedYouTubeVideoId {
                        YouTubeThumbnailCardView(videoId: videoId, onOpen: { openInSafari(link.url) })
                    }
                    if let gh = cachedGitHubParsed {
                        githubCard(parsed: gh, fullUrl: link.url)
                    }
                    linkInfoCard
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
        .scrollContentBackground(.hidden)
        }
        .onAppear {
            if cachedYouTubeVideoId == nil { cachedYouTubeVideoId = Self.youtubeVideoId(from: link.url) }
            if cachedGitHubParsed == nil { cachedGitHubParsed = Self.parseGitHubUrl(link.url) }
        }
        .navigationTitle(link.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    openInSafari(link.url)
                } label: {
                    Image(systemName: "safari")
                        .font(.system(size: 18))
                    Text("Open")
                        .font(.system(size: 15, weight: .medium))
                }
            }
        }
        .tint(CloudwrkzColors.primary400)
    }

    private var background: some View {
        LinearGradient(
            colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                linkIcon
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        typePill(link.linkType)
                        if link.isFavorite {
                            Image(systemName: "star.fill")
                                .font(.system(size: 14))
                                .foregroundStyle(CloudwrkzColors.warning400)
                        }
                    }
                    Text(link.title)
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(CloudwrkzColors.neutral100)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button {
                openInSafari(link.url)
            } label: {
                HStack(spacing: 6) {
                    Text(domainLabel(link.url))
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(CloudwrkzColors.primary400)
                    Image(systemName: "arrow.up.forward")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.primary400)
                }
            }
            .buttonStyle(.plain)

            Text("Created \(Self.dateFormatter.string(from: link.createdAt))")
                .font(.system(size: 13, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral400)

            if let rating = link.rating, rating > 0 {
                HStack(spacing: 4) {
                    ForEach(1...5, id: \.self) { star in
                        Image(systemName: star <= rating ? "star.fill" : "star")
                            .font(.system(size: 14))
                            .foregroundStyle(star <= rating ? CloudwrkzColors.warning400 : CloudwrkzColors.neutral500)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .glassCard(cornerRadius: 20)
    }

    private var linkIcon: some View {
        let faviconURL = link.faviconURL(serverBaseURL: serverBaseURL ?? appState.config.baseURL)
        return ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(CloudwrkzColors.primary500.opacity(0.15))
                .frame(width: 48, height: 48)
            if let url = faviconURL {
                FaviconImageView(url: url, size: 48, cornerRadius: 12)
            } else {
                defaultLinkFallback
            }
        }
    }

    /// Default chain-link icon shown when favicon is missing or fails to load.
    private var defaultLinkFallback: some View {
        Image(systemName: "link")
            .font(.system(size: 22))
            .foregroundStyle(CloudwrkzColors.primary400)
    }

    private func descriptionCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "doc.text.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text("Description")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }
            Text(text)
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral200)
                .lineSpacing(6)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(cornerRadius: 20)
    }

    private var linkInfoCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                Image(systemName: "info.circle.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(CloudwrkzColors.primary400)
                Text("Link information")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(CloudwrkzColors.neutral100)
            }

            VStack(alignment: .leading, spacing: 14) {
                infoRow(label: "Type", value: linkTypeLabel(link.linkType))
                infoRow(label: "Domain", value: domainLabel(link.url))
                if let collections = link.collections, !collections.isEmpty {
                    infoRow(label: "Collections", value: collections.map { $0.collection.name }.joined(separator: ", "))
                }
                if !link.tags.isEmpty {
                    infoRow(label: "Tags", value: link.tags.joined(separator: ", "))
                }
                infoRow(label: "Created", value: Self.dateFormatter.string(from: link.createdAt))
                infoRow(label: "Updated", value: Self.dateFormatter.string(from: link.updatedAt))
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(cornerRadius: 20)
    }

    private func infoRow(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(CloudwrkzColors.neutral500)
            Text(value)
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral100)
        }
    }

    private func typePill(_ type: String) -> some View {
        Text(linkTypeLabel(type))
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(CloudwrkzColors.neutral200)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(CloudwrkzColors.neutral700.opacity(0.8), in: Capsule())
    }

    private func linkTypeLabel(_ type: String) -> String {
        switch type.uppercased() {
        case "VIDEO": return "Video"
        case "FILE": return "File"
        case "DOCUMENT": return "Document"
        case "IMAGE": return "Image"
        case "WEBSITE": return "Website"
        default: return type.replacingOccurrences(of: "_", with: " ")
        }
    }

    private func linkTypeIcon(_ type: String) -> String {
        switch type.uppercased() {
        case "VIDEO": return "play.rectangle.fill"
        case "FILE": return "doc.fill"
        case "DOCUMENT": return "doc.text.fill"
        case "IMAGE": return "photo.fill"
        default: return "link"
        }
    }

    private func domainLabel(_ urlString: String) -> String {
        guard let url = URL(string: urlString),
              let host = url.host else { return urlString }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    private func openInSafari(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }
        UIApplication.shared.open(url)
    }

    // MARK: - YouTube (thumbnail + Play in YouTube — avoids embed errors 150/152/153 in WebView)
    // Parsing and card are optimized: videoId cached in onAppear; thumbnail loads in separate view with smaller image and deferred load.

    /// Extract YouTube video ID (youtube.com/watch?v=, youtu.be/, embed/, shorts/). Matches website logic.
    private static func youtubeVideoId(from urlString: String) -> String? {
        let lower = urlString.lowercased()
        guard lower.contains("youtube.com") || lower.contains("youtu.be") else { return nil }
        // youtu.be/ID or youtube.com/shorts/ID
        if let regex = try? NSRegularExpression(pattern: #"(?:youtu\.be/|youtube\.com/shorts/)([a-zA-Z0-9_-]{11})"#),
           let match = regex.firstMatch(in: urlString, range: NSRange(urlString.startIndex..., in: urlString)),
           match.numberOfRanges > 1,
           let r = Range(match.range(at: 1), in: urlString) {
            return String(urlString[r])
        }
        // watch?v=ID or embed/ID
        if let url = URL(string: urlString),
           let comp = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let v = comp.queryItems?.first(where: { $0.name == "v" })?.value, v.count == 11 {
            return v
        }
        if let regex = try? NSRegularExpression(pattern: #"youtube\.com/embed/([a-zA-Z0-9_-]{11})"#),
           let match = regex.firstMatch(in: urlString, range: NSRange(urlString.startIndex..., in: urlString)),
           match.numberOfRanges > 1,
           let r = Range(match.range(at: 1), in: urlString) {
            return String(urlString[r])
        }
        return nil
    }

    // MARK: - GitHub card (matches website: repo info + quick links)

    private struct GitHubParsed {
        let owner: String
        let repo: String
        let repoUrl: String
        let type: GitHubUrlType
        let branch: String?
        let path: String?
        enum GitHubUrlType { case profile; case repo; case tree; case blob }
    }

    private static func parseGitHubUrl(_ urlString: String) -> GitHubParsed? {
        let trimmed = urlString.trimmingCharacters(in: .whitespaces)
        let withProtocol = trimmed.hasPrefix("http") ? trimmed : "https://\(trimmed)"
        guard let url = URL(string: withProtocol),
              url.host?.lowercased() == "github.com" else { return nil }
        let pathParts = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")).split(separator: "/").map(String.init)
        guard pathParts.count >= 1 else { return nil }
        let owner = pathParts[0]
        if pathParts.count == 1 {
            return GitHubParsed(owner: owner, repo: "", repoUrl: "https://github.com/\(owner)", type: .profile, branch: nil, path: nil)
        }
        let repo = pathParts[1]
        let repoUrl = "https://github.com/\(owner)/\(repo)"
        if pathParts.count == 2 {
            return GitHubParsed(owner: owner, repo: repo, repoUrl: repoUrl, type: .repo, branch: nil, path: nil)
        }
        let segment = pathParts[2]
        if segment == "tree", pathParts.count >= 4 {
            let branch = pathParts[3]
            let path = pathParts.count > 4 ? pathParts.dropFirst(4).joined(separator: "/") : nil
            return GitHubParsed(owner: owner, repo: repo, repoUrl: repoUrl, type: .tree, branch: branch, path: path)
        }
        if segment == "blob", pathParts.count >= 4 {
            let branch = pathParts[3]
            let path = pathParts.count > 4 ? pathParts.dropFirst(4).joined(separator: "/") : nil
            return GitHubParsed(owner: owner, repo: repo, repoUrl: repoUrl, type: .blob, branch: branch, path: path)
        }
        return GitHubParsed(owner: owner, repo: repo, repoUrl: repoUrl, type: .repo, branch: nil, path: nil)
    }

    private func githubCard(parsed: GitHubParsed, fullUrl: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Repository hero: glass icon + label + name + Open
            HStack(alignment: .center, spacing: 16) {
                githubIconGlass
                VStack(alignment: .leading, spacing: 4) {
                    Text(parsed.repo.isEmpty ? "GITHUB PROFILE" : "REPOSITORY")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(1)
                        .foregroundStyle(CloudwrkzColors.neutral500)
                    Text(parsed.repo.isEmpty ? parsed.owner : "\(parsed.owner)/\(parsed.repo)")
                        .font(.system(size: 17, weight: .semibold, design: .monospaced))
                        .foregroundStyle(CloudwrkzColors.neutral100)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Button {
                    openInSafari(parsed.repoUrl)
                } label: {
                    Text("Open")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.primary400)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                }
                .glassButtonSecondary(cornerRadius: 12)
                .buttonStyle(.plain)
            }
            .padding(20)

            // Path pill (blob/tree)
            if parsed.type == .blob, let path = parsed.path {
                pathPill(icon: "doc.text", label: "File", path: path)
            }
            if parsed.type == .tree, let path = parsed.path, !path.isEmpty {
                pathPill(icon: "folder", label: "Folder", path: path)
            }

            if !parsed.repo.isEmpty || parsed.type == .blob || parsed.type == .tree {
                divider
            }

            // Quick links
            if !parsed.repo.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("QUICK LINKS")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(1)
                        .foregroundStyle(CloudwrkzColors.neutral500)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        ghQuickLink(icon: "exclamationmark.bubble", title: "Issues", url: "\(parsed.repoUrl)/issues")
                        ghQuickLink(icon: "arrow.triangle.branch", title: "Pull requests", url: "\(parsed.repoUrl)/pulls")
                        ghQuickLink(icon: "play.square", title: "Actions", url: "\(parsed.repoUrl)/actions")
                        ghQuickLink(icon: "tag", title: "Releases", url: "\(parsed.repoUrl)/releases")
                        ghQuickLink(icon: "lock.shield", title: "Security", url: "\(parsed.repoUrl)/security")
                    }
                }
                .padding(20)
                .padding(.top, 8)
            }

            // File actions
            if parsed.type == .blob {
                HStack(spacing: 12) {
                    Button {
                        openInSafari(fullUrl)
                    } label: {
                        Label("View file", systemImage: "doc.text")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(CloudwrkzColors.primary400)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                    }
                    .glassButtonPrimary(cornerRadius: 12)
                    .buttonStyle(.plain)
                    if let branch = parsed.branch, !branch.isEmpty {
                        let rawUrl = fullUrl.replacingOccurrences(of: "/blob/", with: "/raw/")
                        Button {
                            openInSafari(rawUrl)
                        } label: {
                            Label("Raw", systemImage: "doc.plaintext")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(CloudwrkzColors.neutral200)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 12)
                        }
                        .glassButtonSecondary(cornerRadius: 12)
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
                .padding(.top, parsed.repo.isEmpty ? 16 : 12)
            }
            if parsed.type == .tree {
                Button {
                    openInSafari(fullUrl)
                } label: {
                    Label("Browse folder", systemImage: "folder")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(CloudwrkzColors.primary400)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                }
                .glassButtonPrimary(cornerRadius: 12)
                .buttonStyle(.plain)
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
                .padding(.top, parsed.repo.isEmpty ? 16 : 12)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(cornerRadius: 20)
    }

    private var githubIconGlass: some View {
        ZStack {
            if #available(iOS 26.0, *) {
                RoundedRectangle(cornerRadius: 14)
                    .fill(.clear)
                    .glassEffect(.regular.tint(CloudwrkzColors.glassFillHighlight), in: RoundedRectangle(cornerRadius: 14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(CloudwrkzColors.glassStroke, lineWidth: 1)
                    )
                    .frame(width: 52, height: 52)
            } else {
                RoundedRectangle(cornerRadius: 14)
                    .fill(.clear)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(CloudwrkzColors.glassStroke, lineWidth: 1)
                    )
                    .frame(width: 52, height: 52)
            }
            Image(systemName: "chevron.left.forwardslash.chevron.right")
                .font(.system(size: 22, weight: .medium))
                .foregroundStyle(CloudwrkzColors.neutral100)
        }
    }

    private func pathPill(icon: String, label: String, path: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundStyle(CloudwrkzColors.primary400)
            Text("\(label) — \(path)")
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundStyle(CloudwrkzColors.neutral400)
                .lineLimit(2)
                .truncationMode(.middle)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ghGlassPill)
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
    }

    private var ghGlassPill: some View {
        Group {
            if #available(iOS 26.0, *) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(.clear)
                    .glassEffect(.regular.tint(CloudwrkzColors.primary500.opacity(0.06)), in: RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                    )
            } else {
                RoundedRectangle(cornerRadius: 12)
                    .fill(.clear)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
                    )
            }
        }
    }

    private var divider: some View {
        Rectangle()
            .fill(CloudwrkzColors.divider)
            .frame(height: 1)
            .padding(.horizontal, 20)
    }

    private func ghQuickLink(icon: String, title: String, url: String) -> some View {
        Button {
            openInSafari(url)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundStyle(CloudwrkzColors.primary400)
                    .frame(width: 20, alignment: .center)
                Text(title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(CloudwrkzColors.neutral100)
                    .lineLimit(1)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ghGlassPill)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - YouTube thumbnail card (deferred load + smaller image for performance)

private struct YouTubeThumbnailCardView: View {
    let videoId: String
    let onOpen: () -> Void
    /// Defer creating AsyncImage until card is on screen to reduce initial navigation lag.
    @State private var loadThumbnail = false

    private let minHeight: CGFloat = 200
    /// mqdefault (320×180) is smaller than hqdefault (480×360) — faster download and decode.
    private var thumbnailURL: URL? { URL(string: "https://img.youtube.com/vi/\(videoId)/mqdefault.jpg") }

    var body: some View {
        Button(action: onOpen) {
            ZStack {
                thumbnailContent
                Circle()
                    .fill(.black.opacity(0.5))
                    .frame(width: 72, height: 72)
                Image(systemName: "play.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(.white)
            }
            .drawingGroup()
        }
        .buttonStyle(.plain)
        .frame(minHeight: minHeight)
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(CloudwrkzColors.glassStrokeSubtle, lineWidth: 1)
        )
        .onAppear { loadThumbnail = true }
    }

    @ViewBuilder
    private var thumbnailContent: some View {
        if loadThumbnail, let url = thumbnailURL {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                case .failure:
                    placeholderView
                case .empty:
                    Rectangle()
                        .fill(CloudwrkzColors.neutral800)
                        .overlay { CloudwrkzSpinner(tint: CloudwrkzColors.primary400) }
                @unknown default:
                    Rectangle()
                        .fill(CloudwrkzColors.neutral800)
                        .overlay { CloudwrkzSpinner(tint: CloudwrkzColors.primary400) }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
        } else {
            placeholderView
        }
    }

    private var placeholderView: some View {
        Rectangle()
            .fill(CloudwrkzColors.neutral800)
            .overlay(
                Image(systemName: "play.rectangle.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(CloudwrkzColors.neutral500)
            )
    }
}

struct LinkDetailView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationStack {
            LinkDetailView(link: Link(
                id: "1",
                title: "Example Link",
                url: "https://example.com/page",
                description: "A short description of the link.",
                favicon: nil,
                linkType: "WEBSITE",
                tags: ["sample", "demo"],
                notes: nil,
                isFavorite: true,
                rating: 4,
                archivedAt: nil,
                createdAt: Date(),
                updatedAt: Date(),
                collections: [Link.LinkCollectionRef(collection: Link.LinkCollectionInfo(id: "c1", name: "Work", color: nil))]
            ))
        }
    }
}
