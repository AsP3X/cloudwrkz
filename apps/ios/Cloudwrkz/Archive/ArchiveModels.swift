//
//  ArchiveModels.swift
//  Cloudwrkz
//
//  Unified archive item: ticket, todo, time entry, or link. Matches cloudwrkz archive page.
//

import Foundation

/// Single archived item for the combined archive list. Wraps one of ticket, todo, link, time entry.
enum ArchiveItem: Identifiable {
    case ticket(Ticket)
    case todo(Todo)
    case link(Link)
    case timeEntry(TimeEntry)

    var id: String {
        switch self {
        case .ticket(let t): return "ticket:\(t.id)"
        case .todo(let t): return "todo:\(t.id)"
        case .link(let l): return "link:\(l.id)"
        case .timeEntry(let e): return "time:\(e.id)"
        }
    }

    var archivedAt: Date? {
        switch self {
        case .ticket(let t): return t.archivedAt
        case .todo(let t): return t.archivedAt
        case .link(let l): return l.archivedAt
        case .timeEntry(let e): return e.archivedAt
        }
    }

    var title: String {
        switch self {
        case .ticket(let t): return t.title
        case .todo(let t): return t.title
        case .link(let l): return l.title
        case .timeEntry(let e): return e.name
        }
    }

    var subtitle: String {
        switch self {
        case .ticket(let t): return t.ticketNumber
        case .todo(let t): return t.todoNumber ?? "Todo"
        case .link(let l): return l.url
        case .timeEntry: return "Time entry"
        }
    }

    var typeLabel: String {
        switch self {
        case .ticket: return "Ticket"
        case .todo: return "ToDo"
        case .link: return "Link"
        case .timeEntry: return "Time"
        }
    }
}

/// Filter for which type of archived items to show.
enum ArchiveTypeFilter: String, CaseIterable, Identifiable {
    case all = "All"
    case tickets = "Tickets"
    case todos = "ToDo"
    case time = "Time"
    case links = "Links"

    var id: String { rawValue }
}

/// Archive list sort option.
enum ArchiveSortOption: String, CaseIterable, Identifiable {
    case newestArchivedFirst = "archivedAt-desc"
    case oldestArchivedFirst = "archivedAt-asc"
    case titleAsc = "title-asc"
    case titleDesc = "title-desc"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .newestArchivedFirst: return "Newest archived first"
        case .oldestArchivedFirst: return "Oldest archived first"
        case .titleAsc: return "Title (A → Z)"
        case .titleDesc: return "Title (Z → A)"
        }
    }
}

/// Archive filter state (type, sort, date range, search). Used by filter sheet.
struct ArchiveFilters: Equatable {
    var type: ArchiveTypeFilter = .all
    var sort: ArchiveSortOption = .newestArchivedFirst
    var archivedFrom: Date?
    var archivedTo: Date?
    /// Search in item title and subtitle (empty = no search).
    var searchQuery: String = ""
}
