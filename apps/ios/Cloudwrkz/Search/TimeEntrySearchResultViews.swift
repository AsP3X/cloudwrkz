//
//  TimeEntrySearchResultViews.swift
//  Cloudwrkz
//
//  Time entry lines for global search: shows the same window, net work duration, and break
//  total as the time tracking list, using `metadata` from the search API (no extra fetch).
//

import SwiftUI

// Human: `SearchService` time hits include `metadata.startedAt`, `totalDuration`, `breakDurationTotal`, etc. so the card can show “when to when”, duration, and break seconds without opening the detail.
// Agent: TimeEntrySearchMetadata parse AnyCodable metadata; netWorkSeconds mirrors TimeTrackingUtils.calculateElapsedTime with aggregated break total; TimeEntrySearchResultTimingBlock HStack range + duration + Breaks line.

// MARK: - Metadata parsing

struct TimeEntrySearchMetadata {
    let status: TimeEntryStatus
    let startedAt: Date
    let pausedAt: Date?
    let stoppedAt: Date?
    let completedAt: Date?
    let lastResumedAt: Date?
    let totalDuration: Int
    let breakDurationTotal: Int

    /// End of the clock span for list-style “start – end” (no fixed end while running).
    // Agent: MATCHES TimeEntry.listRunRangeEndFixed; nil iff RUNNING; PAUSED uses pausedAt; STOPPED uses stoppedAt??completedAt.
    var listRunRangeEndFixed: Date? {
        switch status {
        case .running: return nil
        case .paused: return pausedAt
        case .stopped: return stoppedAt ?? completedAt
        case .completed: return completedAt ?? stoppedAt
        }
    }

    /// Net work seconds at `now` (gross from server minus aggregated break seconds), aligned with the overview’s duration column.
    // Agent: MIRRORS TimeTrackingUtils.calculateElapsedTime; READS breakDurationTotal as sum; SUBTRACTS from server total + running delta when RUNNING.
    func netWorkSeconds(at now: Date) -> Int {
        var base: Int
        switch status {
        case .running:
            let reference = lastResumedAt ?? startedAt
            let running = Int(now.timeIntervalSince(reference))
            base = totalDuration + max(0, running)
        case .paused, .stopped, .completed:
            base = totalDuration
        }
        return max(0, base - breakDurationTotal)
    }

    // Human: Fails if required keys are missing so the row can fall back to the generic description/title path until the app talks to a new enough API.
    // Agent: PARSE SearchResult.type timeentry; READS metadata status startedAt totalDuration breakDurationTotal; OPTIONAL paused stopped completed lastResumed; RETURNS nil on decode gaps.
    static func parse(_ result: SearchResult) -> TimeEntrySearchMetadata? {
        guard result.type == "timeentry", let meta = result.metadata else { return nil }
        guard let statusStr = stringValue(meta, "status"), let status = TimeEntryStatus(rawValue: statusStr) else { return nil }
        guard let startedAt = dateValue(meta, "startedAt") else { return nil }
        let total = intValue(meta, "totalDuration") ?? 0
        let breakTotal = intValue(meta, "breakDurationTotal") ?? 0
        return TimeEntrySearchMetadata(
            status: status,
            startedAt: startedAt,
            pausedAt: dateValue(meta, "pausedAt"),
            stoppedAt: dateValue(meta, "stoppedAt"),
            completedAt: dateValue(meta, "completedAt"),
            lastResumedAt: dateValue(meta, "lastResumedAt"),
            totalDuration: total,
            breakDurationTotal: breakTotal
        )
    }
}

// MARK: - AnyCodable helpers (search metadata bag)

private func stringValue(_ meta: [String: AnyCodable], _ key: String) -> String? {
    guard let v = meta[key]?.value, !(v is NSNull) else { return nil }
    return v as? String
}

private func intValue(_ meta: [String: AnyCodable], _ key: String) -> Int? {
    guard let v = meta[key]?.value, !(v is NSNull) else { return nil }
    if let i = v as? Int { return i }
    if let d = v as? Double { return Int(d) }
    if let n = v as? NSNumber { return n.intValue }
    return nil
}

private func dateValue(_ meta: [String: AnyCodable], _ key: String) -> Date? {
    guard let s = stringValue(meta, key) else { return nil }
    return TimeEntrySearchMetadata.parseISO8601(s)
}

private extension TimeEntrySearchMetadata {
    // Human: The API may emit sub-second or whole-second instants; try both so rows never lose timing when parsing.
    // Agent: ISO8601DateFormatter withFractionalSeconds first then without; STR input s.
    static func parseISO8601(_ s: String) -> Date? {
        if let d = DateFormatterCache.isoWithFractions.date(from: s) { return d }
        return DateFormatterCache.isoNoFractions.date(from: s)
    }
}

// Human: Reused formatter instances for ISO and display strings—global search can produce many cells per keystroke.
// Agent: CACHED DateFormatter; ISO8601 with and without fractional seconds.
private enum DateFormatterCache {
    static let isoWithFractions: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    static let isoNoFractions: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
}

// MARK: - Row subview (range + net duration + break total)

struct TimeEntrySearchResultTimingBlock: View {
    let meta: TimeEntrySearchMetadata

    private static let rangeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeStyle = .short
        return f
    }()

    // Human: Two-column layout so duration stays easy to scan on the right, like the time tracking overview row.
    // Agent: HStack; leading run range TimelineView 30s when no fixed end; trailing VStack monospaced net + “Breaks …” always.
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            runRangeBlock
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                netDurationText
                breakText
            }
        }
    }

    @ViewBuilder
    private var runRangeBlock: some View {
        if let endFixed = meta.listRunRangeEndFixed {
            Text(
                "\(Self.rangeFormatter.string(from: meta.startedAt)) – \(Self.rangeFormatter.string(from: endFixed))"
            )
            .font(.system(size: 12, weight: .regular))
            .foregroundStyle(CloudwrkzColors.neutral500)
        } else {
            TimelineView(.periodic(from: .now, by: 30)) { context in
                Text(
                    "\(Self.rangeFormatter.string(from: meta.startedAt)) – \(Self.rangeFormatter.string(from: context.date))"
                )
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(CloudwrkzColors.neutral500)
            }
        }
    }

    @ViewBuilder
    private var netDurationText: some View {
        if meta.status == .running {
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                netDurationTextBody(seconds: meta.netWorkSeconds(at: Date()))
            }
        } else {
            netDurationTextBody(seconds: meta.netWorkSeconds(at: Date()))
        }
    }

    // Human: Wrap running timers in a lightweight tick so search matches the list’s “live” counter without a global timer on every result row.
    // Agent: VISIBLE `Text` 1s update only when status RUNNING; else static net seconds once.
    private func netDurationTextBody(seconds: Int) -> some View {
        let color: Color
        if meta.status == .running {
            color = CloudwrkzColors.success400
        } else {
            color = meta.status.isActive ? CloudwrkzColors.success400 : CloudwrkzColors.neutral200
        }
        return Text(TimeTrackingUtils.formatDuration(seconds))
            .font(.system(size: 14, weight: .bold, design: .monospaced))
            .foregroundStyle(color)
    }

    private var breakText: some View {
        let seconds = max(0, meta.breakDurationTotal)
        return Text("Breaks \(TimeTrackingUtils.formatDuration(seconds))")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(seconds > 0 ? CloudwrkzColors.warning400 : CloudwrkzColors.neutral500)
    }
}
