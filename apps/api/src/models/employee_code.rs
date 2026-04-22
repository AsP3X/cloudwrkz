//! Business rules for `employees.employee_code` (the human-facing employee identifier).
//!
//! Supported shapes include typical HR formats such as numeric badges (`00042`),
//! prefixed codes (`EMP-1234`, `US/EAST-0099`), dotted hierarchies (`ACME.NA.SF.12`),
//! and similar — as long as characters stay in the allowed set and length limits hold.
//! Leading/trailing whitespace is trimmed and internal runs of whitespace collapse to a
//! single ASCII space before storage. Duplicates are prevented using a case-insensitive
//! identity derived from that canonical string (mirrored in SQL and a unique index).

const MAX_EMPLOYEE_CODE_CHARS: usize = 64;

/// Returns the canonical `employee_code` string to persist (trimmed, internal whitespace collapsed).
pub fn parse_employee_code(raw: &str) -> Result<String, &'static str> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Employee code is required");
    }
    let canonical: String = trimmed.split_whitespace().collect::<Vec<_>>().join(" ");
    if canonical.is_empty() {
        return Err("Employee code is required");
    }
    let len = canonical.chars().count();
    if len > MAX_EMPLOYEE_CODE_CHARS {
        return Err("Employee code must be at most 64 characters");
    }
    for ch in canonical.chars() {
        if ch.is_whitespace() {
            continue;
        }
        if ch.is_alphanumeric() {
            continue;
        }
        if matches!(
            ch,
            '-' | '_' | '.' | '/' | ':' | '#' | '@' | '+' | '(' | ')' | ',' | '[' | ']'
        ) {
            continue;
        }
        return Err(
            "Employee code may only contain letters, digits, spaces, and - _ . / : # @ + ( ) , [ ]",
        );
    }
    Ok(canonical)
}

/// Lowercase identity used for duplicate detection (must match `employee_code_identity_expr_sql`).
pub fn employee_code_identity_key(canonical: &str) -> String {
    canonical.to_lowercase()
}

/// SQL expression that normalizes `employee_code` for comparisons and the unique index.
pub fn employee_code_identity_expr_sql() -> &'static str {
    "lower(regexp_replace(btrim(employee_code), '[[:space:]]+', ' ', 'g'))"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_common_formats() {
        assert_eq!(parse_employee_code("EMP-001").unwrap(), "EMP-001");
        assert_eq!(parse_employee_code("  00042  ").unwrap(), "00042");
        assert_eq!(parse_employee_code("US/EAST.12").unwrap(), "US/EAST.12");
        assert_eq!(parse_employee_code("acme_na#7").unwrap(), "acme_na#7");
    }

    #[test]
    fn collapses_whitespace() {
        assert_eq!(
            parse_employee_code("  EMP   123  ").unwrap(),
            "EMP 123"
        );
    }

    #[test]
    fn rejects_empty_and_oversize() {
        assert!(parse_employee_code("   ").is_err());
        let long = "a".repeat(65);
        assert!(parse_employee_code(&long).is_err());
    }

    #[test]
    fn rejects_disallowed_chars() {
        assert!(parse_employee_code("bad;id").is_err());
        assert!(parse_employee_code("x*y").is_err());
    }

    #[test]
    fn identity_key_is_ascii_lowercase() {
        assert_eq!(
            employee_code_identity_key("EMP-001"),
            "emp-001"
        );
    }
}
