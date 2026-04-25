//
//  LinkModels.swift
//  Cloudwrkz
//
//  Link and filter types for GET /api/links. Matches cloudwrkz API.
//

import Foundation

// Human: Link list/detail models, collection picker types, favicon URL resolution, and persisted filter state for the links feature.
// Agent: Decodable GET /api/links LinksResponse; Link collections optional; faviconURL rewrites /uploads/favicons → /api/favicons; CollectionsResponse Collection; LinkFilters sort favorite archived collectionId.

// MARK: - API response

struct LinksResponse: Decodable {
    let links: [Link]
    let total: Int
    let page: Int
    let limit: Int
    let totalPages: Int
}

// Human: A saved link row: URL, optional favicon path, tags, favorite flag, archive timestamp, and optional collection memberships.
// Agent: STRUCT Link Identifiable Decodable Hashable; fields id title url favicon linkType tags archivedAt timestamps collections nested; USED LinkService list/detail.
struct Link: Identifiable, Decodable, Hashable {
    let id: String
    let title: String
    let url: String
    let description: String?
    let favicon: String?
    let linkType: String
    let tags: [String]
    let notes: String?
    let isFavorite: Bool
    let rating: Int?
    let archivedAt: Date?
    let createdAt: Date
    let updatedAt: Date
    /// Optional for defensive decoding (server may omit in some responses).
    let collections: [LinkCollectionRef]?

    struct LinkCollectionRef: Decodable, Hashable {
        let collection: LinkCollectionInfo
    }

    struct LinkCollectionInfo: Decodable, Hashable {
        let id: String
        let name: String
        let color: String?
    }
}

// MARK: - Favicon helpers

// Human: Turns stored favicon paths into fetchable URLs, rewriting upload paths to authenticated `/api/favicons` routes.
// Agent: extension Link faviconURL(serverBaseURL); HANDLES protocol-relative absolute / paths derivedBaseURL from link url; SECURITY middleware bypass /api prefix.
extension Link {
    /// Builds a full favicon URL using the value stored on the link and the server base URL.
    ///
    /// Behavior:
    /// - Empty / nil favicon → `nil`
    /// - Protocol-relative URLs (`//example.com/icon.png`) → `https://example.com/icon.png`
    /// - Absolute URLs (`https://…`) → used as-is
    /// - Relative paths (`/uploads/favicons/...`) → rewritten to `/api/favicons/...` and
    ///   resolved against `serverBaseURL`. The `/api/` prefix bypasses server middleware
    ///   that redirects non-API paths to the login page when no session cookie is present.
    func faviconURL(serverBaseURL: URL?) -> URL? {
        let raw = (favicon ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return nil }

        // Protocol-relative URL: //example.com/icon.png
        if raw.hasPrefix("//") {
            return URL(string: "https:" + raw)
        }

        // Relative path from server (e.g. /uploads/favicons/favicon-abc.png).
        if raw.hasPrefix("/") {
            // Rewrite /uploads/favicons/ → /api/favicons/ so the request goes through
            // the API route which the server middleware excludes from auth checks.
            let path = raw.replacingOccurrences(of: "/uploads/favicons/", with: "/api/favicons/")

            if let base = serverBaseURL {
                if let resolved = URL(string: path, relativeTo: base)?.absoluteURL {
                    return resolved
                }
            }

            if let derivedBase = Self.derivedBaseURL(from: url) {
                return URL(string: path, relativeTo: derivedBase)?.absoluteURL
            }

            return nil
        }

        // Absolute URL string as-is.
        return URL(string: raw)
    }

    /// Derive a base URL (scheme + host + optional port) from a link URL string.
    /// Used as a fallback when `serverBaseURL` is not available.
    private static func derivedBaseURL(from linkURLString: String) -> URL? {
        let trimmed = linkURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        // Ensure we have a scheme so URL parsing succeeds.
        let withScheme: String
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            withScheme = trimmed
        } else {
            withScheme = "https://" + trimmed
        }

        guard let full = URL(string: withScheme),
              let host = full.host else {
            return nil
        }

        var components = URLComponents()
        components.scheme = full.scheme ?? "https"
        components.host = host
        components.port = full.port
        return components.url
    }
}

// MARK: - Collections (for picker and filter)

// Human: Wrapper for the collections list used when picking a collection or scoping the link list.
// Agent: STRUCT CollectionsResponse Decodable collections [Collection]; HTTP from LinkService/collections endpoints.
struct CollectionsResponse: Decodable {
    let collections: [Collection]
}

// Human: A link collection with display color and a denormalized count of links for list UI.
// Agent: STRUCT Collection Identifiable id name color optional description linkCount; Decodable link_count mapping comment in model.
struct Collection: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let description: String?
    let color: String?
    /// Rust `GET /collections` returns `link_count` at the top level (not `_count.links`).
    let linkCount: Int
}

// MARK: - Filter state (for filter sheet)

// Human: User-selected sort, favorites-only, archived-only, and optional collection filter for the links screen and API query building.
// Agent: STRUCT LinkFilters Equatable; nested LinkSortOption LinkFavoriteFilter raw query params; archived Bool collectionId String?; BINDS LinkFiltersView LinkService.
struct LinkFilters: Equatable {
    var sort: LinkSortOption = .newestFirst
    var isFavorite: LinkFavoriteFilter = .all
    /// When true, only show archived links; when false, only non-archived (default).
    var archived: Bool = false
    /// When set, only show links in this collection; nil = all.
    var collectionId: String?

    enum LinkSortOption: String, CaseIterable, Identifiable {
        case newestFirst = "createdAt-desc"
        case oldestFirst = "createdAt-asc"
        case updatedDesc = "updatedAt-desc"
        case updatedAsc = "updatedAt-asc"
        case titleAsc = "title-asc"
        case titleDesc = "title-desc"

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .newestFirst: return "Newest first"
            case .oldestFirst: return "Oldest first"
            case .updatedDesc: return "Recently updated"
            case .updatedAsc: return "Least recently updated"
            case .titleAsc: return "Title (A–Z)"
            case .titleDesc: return "Title (Z–A)"
            }
        }
    }

    enum LinkFavoriteFilter: String, CaseIterable, Identifiable {
        case all = "all"
        case favorites = "true"
        case notFavorites = "false"

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .all: return "All links"
            case .favorites: return "Favorites only"
            case .notFavorites: return "Not favorites"
            }
        }
    }
}
