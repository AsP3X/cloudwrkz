//
//  SearchModels.swift
//  Cloudwrkz
//
//  Types for GET /api/search (or /api/auth/search). Matches cloudwrkz global search API.
//

import Foundation

// Human: Decodable shapes for global search results returned by the Cloudwrkz search API (tickets, todos, links, etc.).
// Agent: Decodable GET /api/search or /api/auth/search; SearchResponse results total; SearchResult type id title url metadata AnyCodable; parentTicketId context contextHighlight CodingKeys.

struct SearchResponse: Decodable {
    let results: [SearchResult]
    let total: Int
}

// Human: One hit in the unified search list, including deep-link `url` and optional highlight snippets for the UI. Time entry hits may include rich `metadata` (startedAt, totalDuration, breakDurationTotal, …) for list-style timing in the iOS search card.
// Agent: STRUCT SearchResult Identifiable Decodable; FIELDS type id title url; OPTIONAL description metadata parentTicketId context contextHighlight; CUSTOM init(from decoder:).
struct SearchResult: Identifiable, Decodable {
    let type: String
    let id: String
    let title: String
    let description: String?
    let url: String
    let metadata: [String: AnyCodable]?
    let parentTicketId: String?
    let context: String?
    let contextHighlight: String?

    enum CodingKeys: String, CodingKey {
        case type, id, title, description, url, metadata, parentTicketId, context, contextHighlight
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = try c.decode(String.self, forKey: .type)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        url = try c.decode(String.self, forKey: .url)
        metadata = try? c.decodeIfPresent([String: AnyCodable].self, forKey: .metadata)
        parentTicketId = try c.decodeIfPresent(String.self, forKey: .parentTicketId)
        context = try c.decodeIfPresent(String.self, forKey: .context)
        contextHighlight = try c.decodeIfPresent(String.self, forKey: .contextHighlight)
    }
}

/// Type-erased Codable for metadata dictionary values.
// Human: Lossy JSON value bag so heterogeneous `metadata` objects from the API decode without per-key Swift types.
// Agent: STRUCT AnyCodable Decodable; singleValueContainer Bool Int Double String Array Dictionary recursion; ELSE NSNull.
struct AnyCodable: Decodable {
    let value: Any

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let b = try? container.decode(Bool.self) { value = b }
        else if let i = try? container.decode(Int.self) { value = i }
        else if let d = try? container.decode(Double.self) { value = d }
        else if let s = try? container.decode(String.self) { value = s }
        else if let a = try? container.decode([AnyCodable].self) { value = a.map(\.value) }
        else if let o = try? container.decode([String: AnyCodable].self) { value = o.mapValues(\.value) }
        else { value = NSNull() }
    }
}
