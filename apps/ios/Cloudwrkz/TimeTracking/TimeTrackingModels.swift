//
//  TimeTrackingModels.swift
//  Cloudwrkz
//
//  Time entry and filter types for the time tracking feature.
//  Matches cloudwrkz Prisma schema (TimeEntry, TimeEntryBreak).
//

import Foundation

// Human: Time entry entities, status machine, duration math for live counters, and filter/date-range defaults tied to account settings.
// Agent: Decodable time entry API wrappers; TimeEntryStatus RUNNING|PAUSED|STOPPED|COMPLETED; TimeEntry breaks user ticketId; TimeTrackingUtils elapsed/break seconds; TimeTrackingFilters READS AccountSettingsStorage default period UserDefaults-backed.

// MARK: - API responses

// Human: List endpoint payload wrapping many time entries for the overview screen.
// Agent: STRUCT TimeEntriesResponse Decodable timeEntries [TimeEntry]; HTTP list GET time-entries family.
struct TimeEntriesResponse: Decodable {
    let timeEntries: [TimeEntry]
}

// Human: Single-entry fetch wrapper used after detail refresh or mutations that return one row.
// Agent: STRUCT SingleTimeEntryResponse Decodable timeEntry TimeEntry; USED TimeTrackingService detail reload.
struct SingleTimeEntryResponse: Decodable {
    let timeEntry: TimeEntry
}

// Human: Create response carrying only the new row id for navigation or optimistic follow-up.
// Agent: STRUCT CreateTimeEntryResponse Decodable id String; POST create time entry path.
struct CreateTimeEntryResponse: Decodable {
    let id: String
}

// MARK: - TimeEntry status

// Human: Server-side timer phase for a time entry, with UI labels and which actions (pause/resume/stop/complete) apply.
// Agent: ENUM TimeEntryStatus String Codable RUNNING PAUSED STOPPED COMPLETED; PROPERTIES canPause canResume canStop canComplete isActive displayName iconName.
enum TimeEntryStatus: String, Codable, CaseIterable, Identifiable {
    case running = "RUNNING"
    case paused = "PAUSED"
    case stopped = "STOPPED"
    case completed = "COMPLETED"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .running: return "Running"
        case .paused: return "Paused"
        case .stopped: return "Stopped"
        case .completed: return "Completed"
        }
    }

    var iconName: String {
        switch self {
        case .running: return "play.circle.fill"
        case .paused: return "pause.circle.fill"
        case .stopped: return "stop.circle.fill"
        case .completed: return "checkmark.circle.fill"
        }
    }

    var canPause: Bool { self == .running }
    var canResume: Bool { self == .paused }
    var canStop: Bool { self == .running || self == .paused }
    var canComplete: Bool { self == .stopped }
    var isActive: Bool { self == .running || self == .paused }
}

// MARK: - TimeEntry

// Human: A tracked block of work: name, billable flag, optional ticket link, breaks, archive state, and timer timestamps from the API.
// Agent: STRUCT TimeEntry Identifiable Decodable Hashable; FIELDS status totalDuration startedAt pausedAt stoppedAt completedAt lastResumedAt archivedAt; OPTIONAL breaks user ticketId location timezone; UTC instants.
struct TimeEntry: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let description: String?
    let status: TimeEntryStatus
    let tags: [String]
    let billable: Bool
    let location: String?
    let timezone: String?

    let totalDuration: Int
    let startedAt: Date
    let pausedAt: Date?
    let stoppedAt: Date?
    let completedAt: Date?
    let lastResumedAt: Date?
    let archivedAt: Date?
    let createdAt: Date
    let updatedAt: Date

    let userId: String
    let ticketId: String?

    let user: TimeEntryUser?
    let breaks: [TimeEntryBreak]?

    struct TimeEntryUser: Decodable, Hashable {
        let id: String
        let name: String?
        let email: String
    }
}

// MARK: - TimeEntryBreak

// Human: A pause segment inside a time entry, with optional end time, computed duration, and notes.
// Agent: STRUCT TimeEntryBreak Identifiable Decodable Hashable; FIELDS startedAt endedAt duration description timestamps; USED TimeTrackingUtils.calculateTotalBreakDuration.
struct TimeEntryBreak: Identifiable, Decodable, Hashable {
    let id: String
    let startedAt: Date
    let endedAt: Date?
    let duration: Int?
    let description: String?
    let createdAt: Date
    let updatedAt: Date
}

// MARK: - Duration helpers

// Human: Formats seconds for lists and live counters, and computes elapsed time minus open breaks using server totals plus local clock.
// Agent: ENUM TimeTrackingUtils namespace; formatDuration formatDurationHuman; calculateElapsedTime READS entry.status lastResumedAt startedAt totalDuration Date(); SUBTRACTS open break seconds.
enum TimeTrackingUtils {
    /// Format seconds to HH:MM:SS or MM:SS
    static func formatDuration(_ seconds: Int) -> String {
        guard seconds >= 0 else { return "00:00:00" }
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        let s = seconds % 60
        if h > 0 {
            return String(format: "%02d:%02d:%02d", h, m, s)
        }
        return String(format: "%02d:%02d", m, s)
    }

    /// Format seconds to human-readable (e.g. "2h 15m", "45m", "30s")
    static func formatDurationHuman(_ seconds: Int) -> String {
        guard seconds > 0 else { return "0s" }
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        let s = seconds % 60
        if h > 0 && m > 0 {
            return "\(h)h \(m)m"
        } else if h > 0 {
            return "\(h)h"
        } else if m > 0 {
            return "\(m)m"
        }
        return "\(s)s"
    }

    /// Calculate elapsed time in seconds for display (counter).
    /// Uses server totalDuration as source of truth; for running timers adds device time since last resume/start.
    /// All timestamps (startedAt, lastResumedAt, etc.) are decoded from API as UTC instants; duration math is timezone-independent.
    static func calculateElapsedTime(entry: TimeEntry) -> Int {
        var baseDuration: Int

        switch entry.status {
        case .running:
            let referenceDate = entry.lastResumedAt ?? entry.startedAt
            let runningTime = Int(Date().timeIntervalSince(referenceDate))
            baseDuration = entry.totalDuration + max(0, runningTime)
        case .paused, .stopped, .completed:
            baseDuration = entry.totalDuration
        }

        if let breaks = entry.breaks, !breaks.isEmpty {
            let breakDuration = calculateTotalBreakDuration(breaks)
            baseDuration = max(0, baseDuration - breakDuration)
        }

        return baseDuration
    }

    /// Calculate total break duration in seconds
    static func calculateTotalBreakDuration(_ breaks: [TimeEntryBreak]) -> Int {
        breaks.reduce(0) { total, breakRecord in
            if let duration = breakRecord.duration {
                return total + duration
            }
            if breakRecord.endedAt == nil {
                return total + Int(Date().timeIntervalSince(breakRecord.startedAt))
            }
            return total
        }
    }
}

// MARK: - Filter state

// Human: Time tracking list filters including default date windows (week/month/quarter/year/custom) sourced from saved account preferences.
// Agent: STRUCT TimeTrackingFilters Equatable; init() READS AccountSettingsStorage timeTrackingDefaultPeriod timeTrackingCustomDays; static defaultDateRange* Calendar current; isDefaultDateRange; nested status sort archive enums; TimeTrackingService query params.
struct TimeTrackingFilters: Equatable {
    var status: TimeTrackingStatusFilter = .all
    var sort: TimeTrackingSortOption = .newestFirst
    var archive: TimeTrackingArchiveFilter = .unarchived
    var dateFrom: Date?
    var dateTo: Date?

    /// Default initializer: status/sort/archive at defaults, date range from app settings (month / quarter / year / custom days).
    init() {
        self.status = .all
        self.sort = .newestFirst
        self.archive = .unarchived
        let range = Self.defaultDateRangeFromSettings()
        self.dateFrom = range.from
        self.dateTo = range.to
    }

    /// Default date range from AccountSettingsStorage (used by overview and "Reset filters").
    static func defaultDateRangeFromSettings() -> (from: Date, to: Date) {
        let period = AccountSettingsStorage.timeTrackingDefaultPeriod
        let customDays = AccountSettingsStorage.timeTrackingCustomDays
        return defaultDateRange(period: period, customDays: customDays)
    }

    /// Compute (from, to) for the given period. Period: "week", "month", "quarter", "year", "custom".
    static func defaultDateRange(period: String, customDays: Int) -> (from: Date, to: Date) {
        switch period {
        case "week": return currentWeekDateRange()
        case "quarter": return currentQuarterDateRange()
        case "year": return currentYearDateRange()
        case "custom": return lastDaysDateRange(days: customDays)
        default: return currentMonthDateRange()
        }
    }

    /// Start and end of the current month (local calendar).
    static func currentMonthDateRange() -> (from: Date, to: Date) {
        let cal = Calendar.current
        let now = Date()
        guard let start = cal.date(from: cal.dateComponents([.year, .month], from: now)) else {
            return (now, now)
        }
        guard let end = cal.date(byAdding: DateComponents(month: 1, second: -1), to: start) else {
            return (start, start)
        }
        return (start, end)
    }

    /// Start and end of the current calendar week (respects Calendar.firstWeekday).
    static func currentWeekDateRange() -> (from: Date, to: Date) {
        let cal = Calendar.current
        let now = Date()
        guard let start = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: now)) else {
            return currentMonthDateRange()
        }
        guard let end = cal.date(byAdding: DateComponents(day: 7, second: -1), to: start) else {
            return (start, start)
        }
        return (start, end)
    }

    /// Start and end of the current calendar quarter (Q1–Q4).
    static func currentQuarterDateRange() -> (from: Date, to: Date) {
        let cal = Calendar.current
        let now = Date()
        let month = cal.component(.month, from: now)
        let quarterStartMonth = ((month - 1) / 3) * 3 + 1
        var comps = cal.dateComponents([.year], from: now)
        comps.month = quarterStartMonth
        comps.day = 1
        guard let start = cal.date(from: comps) else { return currentMonthDateRange() }
        guard let end = cal.date(byAdding: DateComponents(month: 3, second: -1), to: start) else {
            return (start, start)
        }
        return (start, end)
    }

    /// Start and end of the current calendar year.
    static func currentYearDateRange() -> (from: Date, to: Date) {
        let cal = Calendar.current
        let now = Date()
        guard let start = cal.date(from: cal.dateComponents([.year], from: now)) else {
            return currentMonthDateRange()
        }
        guard let end = cal.date(byAdding: DateComponents(year: 1, second: -1), to: start) else {
            return (start, start)
        }
        return (start, end)
    }

    /// Last N days: from start of (today - N days) to end of today.
    static func lastDaysDateRange(days: Int) -> (from: Date, to: Date) {
        let cal = Calendar.current
        let now = Date()
        let startOfToday = cal.startOfDay(for: now)
        guard let fromDate = cal.date(byAdding: .day, value: -days, to: startOfToday) else {
            return currentMonthDateRange()
        }
        let start = cal.startOfDay(for: fromDate)
        guard let end = cal.date(byAdding: DateComponents(day: 1, second: -1), to: startOfToday) else {
            return (start, now)
        }
        return (start, end)
    }

    /// True when the date range matches the default from settings; used to avoid showing filter as "active".
    var isDefaultDateRange: Bool {
        guard let from = dateFrom, let to = dateTo else { return false }
        let range = Self.defaultDateRangeFromSettings()
        return from == range.from && to == range.to
    }

    enum TimeTrackingArchiveFilter: String, CaseIterable, Identifiable {
        case unarchived = "unarchived"
        case archived = "archived"
        var id: String { rawValue }
        var displayName: String {
            switch self {
            case .unarchived: return "Active"
            case .archived: return "Archived"
            }
        }
    }

    enum TimeTrackingStatusFilter: String, CaseIterable, Identifiable {
        case all = "ALL"
        case running = "RUNNING"
        case paused = "PAUSED"
        case stopped = "STOPPED"
        case completed = "COMPLETED"
        case active = "ACTIVE"

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .all: return "All statuses"
            case .running: return "Running"
            case .paused: return "Paused"
            case .stopped: return "Stopped"
            case .completed: return "Completed"
            case .active: return "Active"
            }
        }
    }

    enum TimeTrackingSortOption: String, CaseIterable, Identifiable {
        case newestFirst = "createdAt-desc"
        case oldestFirst = "createdAt-asc"
        case longestFirst = "totalDuration-desc"
        case shortestFirst = "totalDuration-asc"

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .newestFirst: return "Newest first"
            case .oldestFirst: return "Oldest first"
            case .longestFirst: return "Longest first"
            case .shortestFirst: return "Shortest first"
            }
        }
    }
}
