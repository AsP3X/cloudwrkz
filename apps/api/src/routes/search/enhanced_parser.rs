//! Parser for `>` enhanced search mini-language (matches web-vite `enhanced-search.ts`).

// Human: Parses the advanced `>` query syntax into fuzzy text tokens and strict filters for the search API.
// Agent: EXPORTS EnhancedSearchParams parse_enhanced_search_query is_enhanced_search_query get_enhanced_search_body; PURE string parser.

use regex::Regex;
use std::sync::LazyLock;

#[derive(Debug, Clone, Default)]
pub struct EnhancedSearchParams {
    pub search: Option<String>,
    pub date: Option<String>,
    pub timestamp: Option<String>,
    pub label: Option<String>,
    pub tag: Option<String>,
    pub type_filter: Option<String>,
    pub description: Option<String>,
}

static KEY_VALUE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)\s*,\s*(date|timestamp|label|tag|type|description)\s*:\s*""#)
        .expect("key-value regex")
});

static SEARCH_PREFIX_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^\s*search\s+").expect("search prefix regex"));

/// Returns `(from, to)` ISO date strings when parseable.
pub fn parse_timestamp_range(timestamp: &str) -> (Option<String>, Option<String>) {
    let normalized = timestamp.replace(" to ", "-").replace(" TO ", "-");
    let parts: Vec<&str> = normalized
        .split('-')
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .collect();
    match parts.len() {
        0 => (None, None),
        1 => (Some(parts[0].to_string()), Some(parts[0].to_string())),
        _ => (
            Some(parts[0].to_string()),
            Some(parts[parts.len() - 1].to_string()),
        ),
    }
}

pub fn is_enhanced_search_query(raw: &str) -> bool {
    raw.trim_start().starts_with('>')
}

pub fn get_enhanced_search_body(raw: &str) -> &str {
    let trimmed = raw.trim_start();
    if let Some(rest) = trimmed.strip_prefix('>') {
        rest.trim()
    } else {
        trimmed
    }
}

fn parse_quoted_string(s: &str, start: usize) -> Option<(String, usize)> {
    if start >= s.len() || s.as_bytes()[start] != b'"' {
        return None;
    }
    let mut i = start + 1;
    let mut value = String::new();
    let bytes = s.as_bytes();
    while i < s.len() {
        let ch = bytes[i];
        if ch == b'\\' && i + 1 < s.len() {
            value.push(bytes[i + 1] as char);
            i += 2;
            continue;
        }
        if ch == b'"' {
            return Some((value, i + 1));
        }
        value.push(ch as char);
        i += 1;
    }
    None
}

/// Parse enhanced search input (without the leading `>`).
pub fn parse_enhanced_search_query(input: &str) -> Option<EnhancedSearchParams> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut params = EnhancedSearchParams::default();
    let mut i = 0usize;

    if let Some(m) = SEARCH_PREFIX_RE.find(trimmed) {
        i = m.end();
    }

    if i < trimmed.len() && trimmed.as_bytes()[i] == b'"' {
        if let Some((value, end)) = parse_quoted_string(trimmed, i) {
            let v = value.trim();
            if !v.is_empty() {
                params.search = Some(v.to_string());
            }
            i = end;
        }
    } else if i == 0 && trimmed.starts_with('"') {
        if let Some((value, end)) = parse_quoted_string(trimmed, 0) {
            let v = value.trim();
            if !v.is_empty() {
                params.search = Some(v.to_string());
            }
            i = end;
        }
    }

    let rest = &trimmed[i..];
    for cap in KEY_VALUE_RE.captures_iter(rest) {
        let key = cap.get(1)?.as_str().to_lowercase();
        let value_start = cap.get(0)?.end() - 1;
        let parsed = parse_quoted_string(rest, value_start)?;
        let value = parsed.0.trim();
        if value.is_empty() {
            continue;
        }
        match key.as_str() {
            "date" => params.date = Some(value.to_string()),
            "timestamp" => params.timestamp = Some(value.to_string()),
            "label" => params.label = Some(value.to_string()),
            "tag" => params.tag = Some(value.to_string()),
            "type" => params.type_filter = Some(value.to_string()),
            "description" => params.description = Some(value.to_string()),
            _ => {}
        }
    }

    let has_any = params.search.is_some()
        || params.date.is_some()
        || params.timestamp.is_some()
        || params.label.is_some()
        || params.tag.is_some()
        || params.type_filter.is_some()
        || params.description.is_some();

    if has_any { Some(params) } else { None }
}

/// Map enhanced `type:` value to result entity types, archive-only, or link subtype.
pub fn map_enhanced_type_to_filters(type_value: &str) -> EnhancedTypeFilter {
    let lower = type_value.to_lowercase();
    let lower = lower.trim();
    match lower {
        "ticket" | "tickets" => EnhancedTypeFilter {
            result_types: Some(vec!["ticket", "comment"]),
            archive_only: false,
            link_type: None,
        },
        "todo" | "todos" | "task" | "tasks" => EnhancedTypeFilter {
            result_types: Some(vec!["task"]),
            archive_only: false,
            link_type: None,
        },
        "timeentry" | "time entries" | "time" => EnhancedTypeFilter {
            result_types: Some(vec!["timeentry"]),
            archive_only: false,
            link_type: None,
        },
        "links" | "link" => EnhancedTypeFilter {
            result_types: Some(vec!["link"]),
            archive_only: false,
            link_type: None,
        },
        "users" | "user" => EnhancedTypeFilter {
            result_types: Some(vec!["user"]),
            archive_only: false,
            link_type: None,
        },
        "archive" | "archived" => EnhancedTypeFilter {
            result_types: None,
            archive_only: true,
            link_type: None,
        },
        "settings" | "setting" => EnhancedTypeFilter {
            result_types: Some(vec!["setting"]),
            archive_only: false,
            link_type: None,
        },
        "video" | "videos" => EnhancedTypeFilter {
            result_types: Some(vec!["link"]),
            archive_only: false,
            link_type: Some("VIDEO".to_string()),
        },
        "website" | "websites" => EnhancedTypeFilter {
            result_types: Some(vec!["link"]),
            archive_only: false,
            link_type: Some("WEBSITE".to_string()),
        },
        "file" | "files" => EnhancedTypeFilter {
            result_types: Some(vec!["link"]),
            archive_only: false,
            link_type: Some("FILE".to_string()),
        },
        "document" | "documents" => EnhancedTypeFilter {
            result_types: Some(vec!["link"]),
            archive_only: false,
            link_type: Some("DOCUMENT".to_string()),
        },
        "image" | "images" => EnhancedTypeFilter {
            result_types: Some(vec!["link"]),
            archive_only: false,
            link_type: Some("IMAGE".to_string()),
        },
        "other" => EnhancedTypeFilter {
            result_types: Some(vec!["link"]),
            archive_only: false,
            link_type: Some("OTHER".to_string()),
        },
        _ => EnhancedTypeFilter::default(),
    }
}

#[derive(Debug, Clone, Default)]
pub struct EnhancedTypeFilter {
    pub result_types: Option<Vec<&'static str>>,
    pub archive_only: bool,
    pub link_type: Option<String>,
}

/// Combine fuzzy enhanced-search tokens into one query string.
pub fn combine_fuzzy_terms(params: &EnhancedSearchParams) -> String {
    [
        params.search.as_deref(),
        params.label.as_deref(),
        params.tag.as_deref(),
        params.description.as_deref(),
    ]
    .into_iter()
    .flatten()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .collect::<Vec<_>>()
    .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_search_and_type_params() {
        let parsed = parse_enhanced_search_query(r#"search "network outage", type: "tickets""#)
            .expect("params");
        assert_eq!(parsed.search.as_deref(), Some("network outage"));
        assert_eq!(parsed.type_filter.as_deref(), Some("tickets"));
    }

    #[test]
    fn detects_enhanced_prefix() {
        assert!(is_enhanced_search_query("> search \"x\""));
        assert!(!is_enhanced_search_query("network"));
    }
}
