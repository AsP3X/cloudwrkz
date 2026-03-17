//
//  TodoModels.swift
//  Cloudwrkz
//
//  Todo and filter types for GET /api/todos. Matches cloudwrkz API.
//

import Foundation

// MARK: - API response

struct TodosResponse: Decodable {
    let todos: [Todo]
}

struct Todo: Identifiable, Decodable, Hashable {
    let id: String
    let todoNumber: String?
    let title: String
    let description: String?
    let descriptionPlain: String?
    let status: String
    let priority: String
    let estimatedHours: Double?
    let startDate: Date?
    let dueDate: Date?
    let completedDate: Date?
    let archivedAt: Date?
    let createdAt: Date
    let updatedAt: Date
    let parentTodoId: String?
    let parentTodo: TodoParentRef?
    let ticketId: String?
    let assignedToId: String?
    let assignedTo: TodoUser?
    let ticket: TodoTicketRef?
    let subtodos: [TodoSubtask]?
    let _count: TodoCount?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        todoNumber = try c.decodeIfPresent(String.self, forKey: .todoNumber)
        title = try c.decode(String.self, forKey: .title)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        descriptionPlain = try c.decodeIfPresent(String.self, forKey: .descriptionPlain)
        status = try c.decode(String.self, forKey: .status)
        priority = try c.decode(String.self, forKey: .priority)
        estimatedHours = try c.decodeIfPresent(Double.self, forKey: .estimatedHours)
        startDate = try c.decodeIfPresent(Date.self, forKey: .startDate)
        dueDate = try c.decodeIfPresent(Date.self, forKey: .dueDate)
        completedDate = try c.decodeIfPresent(Date.self, forKey: .completedDate)
        archivedAt = try c.decodeIfPresent(Date.self, forKey: .archivedAt)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
        parentTodoId = try c.decodeIfPresent(String.self, forKey: .parentTodoId)
        parentTodo = try c.decodeIfPresent(TodoParentRef.self, forKey: .parentTodo)
        ticketId = try c.decodeIfPresent(String.self, forKey: .ticketId)
        assignedToId = try c.decodeIfPresent(String.self, forKey: .assignedToId)
        assignedTo = try c.decodeIfPresent(TodoUser.self, forKey: .assignedTo)
        ticket = try c.decodeIfPresent(TodoTicketRef.self, forKey: .ticket)
        subtodos = try c.decodeIfPresent([TodoSubtask].self, forKey: .subtodos)
        _count = try c.decodeIfPresent(TodoCount.self, forKey: ._count)
    }

    private enum CodingKeys: String, CodingKey {
        case id, todoNumber, title, description, descriptionPlain, status, priority
        case estimatedHours, startDate, dueDate, completedDate, archivedAt, createdAt, updatedAt
        case parentTodoId, parentTodo, ticketId, assignedToId, assignedTo, ticket, subtodos, _count
    }

    struct TodoSubtask: Decodable, Hashable, Identifiable {
        let id: String
        let title: String
        let status: String
        let priority: String
    }

    struct TodoUser: Decodable, Hashable {
        let id: String
        let name: String?
        let email: String
    }

    struct TodoParentRef: Decodable, Hashable {
        let id: String
        let title: String
        let todoNumber: String?
    }

    struct TodoTicketRef: Decodable, Hashable {
        let id: String
        let ticketNumber: String
        let title: String
    }

    struct TodoCount: Decodable, Hashable {
        let subtodos: Int
    }
}

// MARK: - Filter state (mirrors getAllTodos filters)

struct TodoFilters: Equatable {
    var status: TodoStatusFilter = .all
    var priority: TodoPriorityFilter = .all
    var sort: TodoSortOption = .newestFirst
    var archive: TodoArchiveFilter = .unarchived
    /// When false (default), list shows only top-level todos. When true, includes subtodos.
    var includeSubtodos: Bool = false

    enum TodoStatusFilter: String, CaseIterable, Identifiable {
        case all = "ALL"
        case notStarted = "NOT_STARTED"
        case inProgress = "IN_PROGRESS"
        case blocked = "BLOCKED"
        case completed = "COMPLETED"
        case cancelled = "CANCELLED"

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .all: return String(localized: "filter_status.all_statuses")
            case .notStarted: return String(localized: "filter_status.not_started")
            case .inProgress: return String(localized: "filter_status.in_progress")
            case .blocked: return String(localized: "filter_status.blocked")
            case .completed: return String(localized: "filter_status.completed")
            case .cancelled: return String(localized: "filter_status.cancelled")
            }
        }
    }

    enum TodoPriorityFilter: String, CaseIterable, Identifiable {
        case all = "ALL"
        case low = "LOW"
        case medium = "MEDIUM"
        case high = "HIGH"
        case urgent = "URGENT"

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .all: return String(localized: "filter_priority.all_priorities")
            case .low: return String(localized: "filter_priority.low")
            case .medium: return String(localized: "filter_priority.medium")
            case .high: return String(localized: "filter_priority.high")
            case .urgent: return String(localized: "filter_priority.urgent")
            }
        }
    }

    enum TodoSortOption: String, CaseIterable, Identifiable {
        case newestFirst = "createdAt-desc"
        case oldestFirst = "createdAt-asc"
        case dueDateAsc = "dueDate-asc"
        case dueDateDesc = "dueDate-desc"

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .newestFirst: return String(localized: "filter_sort.newest_first")
            case .oldestFirst: return String(localized: "filter_sort.oldest_first")
            case .dueDateAsc: return String(localized: "filter_sort.due_earliest")
            case .dueDateDesc: return String(localized: "filter_sort.due_latest")
            }
        }
    }

    enum TodoArchiveFilter: String, CaseIterable, Identifiable {
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
}
