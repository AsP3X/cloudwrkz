//
//  LocationAutocompleteService.swift
//  Cloudwrkz
//
//  Address suggestions: Nominatim (OpenStreetMap) + user location history from API.
//  Matches web LocationAutocompleteInput (min 3 chars, debounce, combined results).
//

import Foundation

// Human: Location typing merges privacy-respecting OSM suggestions with tenant-specific history so repeat sites rank above random streets.
// Agent: LocationAutocompleteService Nominatim GET + Bearer location-history path from loginPath; debounce minQuery 3; merges LocationSuggestion list.

struct LocationSuggestion: Identifiable {
    var id: String { displayLabel }
    let displayLabel: String
}

/// Dynamic keys for Nominatim `address` object (mixed string/int values).
private struct NominatimAddressKey: CodingKey {
    var stringValue: String
    init?(stringValue: String) { self.stringValue = stringValue }
    var intValue: Int? { nil }
    init?(intValue: Int) { nil }
}

/// Nominatim API response item (subset we use). Address values may be strings or numbers in JSON.
private struct NominatimItem: Decodable {
    let place_id: Int64?
    let display_name: String?
    let address: [String: String]?

    enum CodingKeys: String, CodingKey {
        case place_id, display_name, address
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        place_id = try c.decodeIfPresent(Int64.self, forKey: .place_id)
        display_name = try c.decodeIfPresent(String.self, forKey: .display_name)
        if let nested = try? c.nestedContainer(keyedBy: NominatimAddressKey.self, forKey: .address) {
            var out: [String: String] = [:]
            for key in nested.allKeys {
                if let s = try? nested.decode(String.self, forKey: key) {
                    out[key.stringValue] = s
                } else if let i = try? nested.decode(Int.self, forKey: key) {
                    out[key.stringValue] = String(i)
                }
            }
            address = out.isEmpty ? nil : out
        } else {
            address = nil
        }
    }
}

/// Rust API + web-vite: `GET .../location-history?q=` returns this envelope.
private struct LocationHistoryEnvelope: Decodable {
    let locations: [String]
}

/// Next.js `/api/location-history`: JSON array of suggestion-shaped rows.
private struct HistoryItem: Decodable {
    let place_id: Int
    let display_name: String?
    let address: [String: String]?
}

enum LocationAutocompleteService {
    // Human: Nominatim is rate-sensitive—shared debounce and timeouts avoid hammering OSM when users type quickly in the field.
    // Agent: nominatimBase https nominatim.openstreetmap.org; timeout 10s; fetch merges history+OSM dedupe displayLabel.

    private static let nominatimBase = "https://nominatim.openstreetmap.org"
    private static let minQueryLength = 3
    private static let debounceNanoseconds: UInt64 = 400_000_000
    private static let timeout: TimeInterval = 10

    /// Build path for location-history. When login path contains "auth" use api/auth/location-history (Bearer); else api/location-history.
    private static func locationHistoryPathSegments(loginPath: String) -> [String] {
        let path = loginPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let locationPath: String
        if path.isEmpty {
            locationPath = "api/v1/location-history"
        } else if path.lowercased().hasSuffix("/auth/login") {
            locationPath = String(path.dropLast("/auth/login".count)) + "/location-history"
        } else {
            locationPath = path.replacingOccurrences(of: "login", with: "location-history", options: .caseInsensitive)
        }
        return locationPath.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
    }

    private static func get(_ address: [String: String], _ key: String) -> String? {
        guard let v = address[key], !v.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return v.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Build display label from Nominatim address parts (matches web buildSuggestionLabel).
    private static func labelFromNominatim(displayName: String?, address: [String: String]?) -> String {
        guard let address = address else { return displayName ?? "" }
        let road = get(address, "road") ?? get(address, "pedestrian") ?? get(address, "footway") ?? get(address, "cycleway") ?? get(address, "path") ?? get(address, "residential") ?? get(address, "street")
        let houseNumber = get(address, "house_number")
        let streetLine: String? = if let r = road, let h = houseNumber { "\(r) \(h)" } else { road ?? houseNumber }
        let city = get(address, "city") ?? get(address, "town") ?? get(address, "village") ?? get(address, "suburb") ?? get(address, "neighbourhood") ?? get(address, "county")
        let state = get(address, "state") ?? get(address, "region")
        let postcode = get(address, "postcode")
        let country = get(address, "country")
        let parts = [streetLine, city, state, postcode, country].compactMap { $0 }
        if !parts.isEmpty { return parts.joined(separator: ", ") }
        return displayName ?? ""
    }

    /// Fetch combined suggestions: optional Nominatim + location history (Bearer). Deduplicated by display label.
    static func fetchSuggestions(config: ServerConfig, query: String, includeThirdPartySuggestions: Bool) async -> [LocationSuggestion] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= minQueryLength else { return [] }

        async let history = fetchLocationHistory(config: config, query: trimmed)
        let nominatimResults: [LocationSuggestion]
        if includeThirdPartySuggestions {
            nominatimResults = await fetchNominatim(query: trimmed)
        } else {
            nominatimResults = []
        }
        let historyResults = await history
        var combined: [LocationSuggestion] = []
        var seen = Set<String>()

        for s in historyResults + nominatimResults {
            let label = s.displayLabel
            if seen.contains(label) { continue }
            seen.insert(label)
            combined.append(s)
        }
        return combined
    }

    private static func fetchNominatim(query: String) async -> [LocationSuggestion] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: nominatimBase + "/search") else { return [] }
        components.queryItems = [
            URLQueryItem(name: "format", value: "json"),
            URLQueryItem(name: "q", value: trimmedQuery),
            URLQueryItem(name: "addressdetails", value: "1"),
            URLQueryItem(name: "limit", value: "10"),
            URLQueryItem(name: "dedupe", value: "1"),
        ]
        guard let url = components.url else { return [] }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        // OSM policy: identify the app (contact URL is acceptable for public Nominatim).
        request.setValue(
            "Cloudwrkz-iOS/1.0 (+https://github.com/AsP3X/cloudwrkz)",
            forHTTPHeaderField: "User-Agent"
        )

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return [] }
            let items = try JSONDecoder().decode([NominatimItem].self, from: data)
            return items.map { item in
                let label = labelFromNominatim(displayName: item.display_name, address: item.address)
                return LocationSuggestion(displayLabel: label.isEmpty ? (item.display_name ?? "") : label)
            }
        } catch {
            return []
        }
    }

    private static func fetchLocationHistory(config: ServerConfig, query: String) async -> [LocationSuggestion] {
        guard let base = config.baseURL else { return [] }
        guard let token = AuthTokenStorage.getToken(), !token.isEmpty else { return [] }
        let segments = locationHistoryPathSegments(loginPath: config.loginPath)
        guard !segments.isEmpty else { return [] }
        var url = base
        for segment in segments { url = url.appending(path: segment) }
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "q", value: query)]
        guard let finalURL = components.url else { return [] }
        var request = URLRequest(url: finalURL)
        request.httpMethod = "GET"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        AppIdentity.apply(to: &request)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return [] }
            if let envelope = try? JSONDecoder().decode(LocationHistoryEnvelope.self, from: data) {
                return envelope.locations.map { LocationSuggestion(displayLabel: $0) }
            }
            let items = try JSONDecoder().decode([HistoryItem].self, from: data)
            return items.compactMap { item in
                let name = item.display_name?.trimmingCharacters(in: .whitespaces) ?? ""
                return name.isEmpty ? nil : LocationSuggestion(displayLabel: name)
            }
        } catch {
            return []
        }
    }
}
