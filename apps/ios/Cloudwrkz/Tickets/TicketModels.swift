//
//  TicketModels.swift
//  Cloudwrkz
//
//  Ticket and filter types for GET /api/tickets. Matches cloudwrkz API.
//

import Foundation

// MARK: - API response

struct TicketsResponse: Decodable {
    let tickets: [Ticket]
}

struct Ticket: Identifiable, Decodable, Hashable {
    let id: String
    let ticketNumber: String
    let title: String
    let description: String?
    let type: String
    let status: String
    let priority: String
    let archivedAt: Date?
    let createdAt: Date
    let updatedAt: Date
    let createdBy: TicketUser?
    let assignedTo: TicketUser?
    let assignedToGroup: TicketGroup?
    let _count: TicketCount?

    struct TicketUser: Decodable, Hashable {
        let id: String
        let name: String?
        let email: String
    }

    struct TicketGroup: Decodable, Hashable {
        let id: String
        let name: String
        let description: String?
    }

    struct TicketCount: Decodable, Hashable {
        let comments: Int
    }
}

// MARK: - Filter state (mirrors TicketFilterConfig)

struct TicketFilters: Equatable {
    var status: TicketStatusFilter = .unresolved
    var sort: TicketSortOption = .newestFirst
    var archive: TicketArchiveFilter = .unarchived
    var createdFrom: Date?
    var createdTo: Date?
    var updatedFrom: Date?
    var updatedTo: Date?

    enum TicketArchiveFilter: String, CaseIterable, Identifiable {
        case unarchived = "unarchived"
        case archived = "archived"
        var id: String { rawValue }
        var displayName: String {
            switch self {
            case .unarchived: return String(localized: "filter_archive.active")
            case .archived: return String(localized: "filter_archive.archived")
            }
        }
    }

    enum TicketStatusFilter: String, CaseIterable, Identifiable {
        case unresolved = "UNRESOLVED"
        case all = "ALL"
        case open = "OPEN"
        case inProgress = "IN_PROGRESS"
        case pending = "PENDING"
        case resolved = "RESOLVED"
        case closed = "CLOSED"
        case cancelled = "CANCELLED"

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .unresolved: return String(localized: "filter_status.unresolved")
            case .all: return String(localized: "filter_status.all_statuses")
            case .open: return String(localized: "filter_status.open")
            case .inProgress: return String(localized: "filter_status.in_progress")
            case .pending: return String(localized: "filter_status.pending")
            case .resolved: return String(localized: "filter_status.resolved")
            case .closed: return String(localized: "filter_status.closed")
            case .cancelled: return String(localized: "filter_status.cancelled")
            }
        }
    }

    enum TicketSortOption: String, CaseIterable, Identifiable {
        case newestFirst = "createdAt-desc"
        case oldestFirst = "createdAt-asc"
        case recentlyUpdated = "updatedAt-desc"
        case leastRecentlyUpdated = "updatedAt-asc"

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .newestFirst: return String(localized: "filter_sort.newest_first")
            case .oldestFirst: return String(localized: "filter_sort.oldest_first")
            case .recentlyUpdated: return String(localized: "filter_sort.recently_updated")
            case .leastRecentlyUpdated: return String(localized: "filter_sort.least_recently_updated")
            }
        }
    }
}
