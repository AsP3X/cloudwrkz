//
//  ApiTimestampParsing.swift
//  Cloudwrkz
//
//  Shared parsing for timestamps from cloudwrkz-api: `chrono::DateTime<Utc>` (RFC3339 with `Z`)
//  and `NaiveDateTime` (no timezone suffix), as serde_json encodes them.
//

import Foundation

// Human: Central place to turn cloudwrkz-api JSON date strings into `Date`, including naive timestamps treated as UTC.
// Agent: READS RFC3339 Z and fractional ISO8601; FALLBACK fixed-format naive UTC patterns; THROWS NSError domain ApiTimestampParsing; USED BY JSON Date decoding.

enum ApiTimestampParsing {
    /// Parses API date/time strings for JSON `Date` decoding. Naive values are interpreted as UTC.
    static func decode(_ raw: String) throws -> Date {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty {
            throw NSError(
                domain: "ApiTimestampParsing",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Empty date string"]
            )
        }

        let iso = ISO8601DateFormatter()
        iso.timeZone = TimeZone(secondsFromGMT: 0)
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: s) { return d }
        iso.formatOptions = [.withInternetDateTime]
        if let d = iso.date(from: s) { return d }

        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(secondsFromGMT: 0)
        for pattern in [
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSSSSS",
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSS",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss.SSSSSS",
            "yyyy-MM-dd HH:mm:ss.SSS",
            "yyyy-MM-dd HH:mm:ss",
        ] {
            df.dateFormat = pattern
            if let d = df.date(from: s) { return d }
        }

        throw NSError(
            domain: "ApiTimestampParsing",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey: "Unrecognized date: \(s)"]
        )
    }
}
