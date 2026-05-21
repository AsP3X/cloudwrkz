//! Permission key registry, group identifiers, and validation helpers.
//!
// Human: Central catalog of permission keys keeps API handlers, migrations, and the Vite client aligned on atomic RBAC strings.
// Agent: READS shared/permissions/catalog.json at compile time; EXPORTS key constants + group ids + validate_keys + permission requirements.

use std::collections::{HashMap, HashSet};

use serde::Deserialize;

/// Well-known group id for baseline user access (see migration seed).
pub const DEFAULT_GROUP_ID: &str = "default-group-id";
/// Full administrative capability bundle (all admin.* and audit.* keys).
pub const ADMIN_GROUP_ID: &str = "admin-group-id";
/// Moderator-style admin read/update subset.
pub const MODERATOR_GROUP_ID: &str = "moderator-group-id";

// Human: Permission keys are string constants so handlers do not scatter magic literals that drift from the DB catalog.
// Agent: CONST str per catalog key; USED by authorize/check_permission call sites.

pub mod key {
    pub const ADMIN_DB_DELETE_ENTRIES: &str = "admin.db.delete_entries";
    pub const ADMIN_DB_EDIT_ENTRIES: &str = "admin.db.edit_entries";
    pub const ADMIN_DB_QUERY: &str = "admin.db.query";
    pub const ADMIN_DB_VIEW: &str = "admin.db.view";
    pub const ADMIN_DB_VIEW_ENTRIES: &str = "admin.db.view_entries";
    pub const ADMIN_GROUPS_MANAGE: &str = "admin.groups.manage";
    pub const ADMIN_GROUPS_VIEW: &str = "admin.groups.view";
    pub const ADMIN_JOBS_VIEW: &str = "admin.jobs.view";
    pub const ADMIN_MODULES_MANAGE: &str = "admin.modules.manage";
    pub const ADMIN_PERMISSIONS_MANAGE: &str = "admin.permissions.manage";
    pub const ADMIN_PERMISSIONS_VIEW: &str = "admin.permissions.view";
    pub const ADMIN_SETTINGS_MANAGE: &str = "admin.settings.manage";
    pub const ADMIN_SESSIONS_REVOKE: &str = "admin.sessions.revoke";
    pub const ADMIN_SESSIONS_VIEW: &str = "admin.sessions.view";
    pub const ADMIN_STATISTICS_VIEW: &str = "admin.statistics.view";
    pub const ADMIN_TICKETS_MANAGE: &str = "admin.tickets.manage";
    pub const ADMIN_USERS_BAN: &str = "admin.users.ban";
    pub const ADMIN_USERS_CREATE: &str = "admin.users.create";
    pub const ADMIN_USERS_DELETE: &str = "admin.users.delete";
    pub const ADMIN_USERS_RESET_PASSWORD: &str = "admin.users.reset_password";
    pub const ADMIN_USERS_UPDATE: &str = "admin.users.update";
    pub const ADMIN_USERS_VIEW: &str = "admin.users.view";
    pub const ARCHIVE_VIEW: &str = "archive.view";
    pub const AUDIT_EXPORT: &str = "audit.export";
    pub const AUDIT_VIEW: &str = "audit.view";
    pub const CUSTOMERS_CREATE: &str = "customers.create";
    pub const CUSTOMERS_DELETE: &str = "customers.delete";
    pub const CUSTOMERS_UPDATE: &str = "customers.update";
    pub const CUSTOMERS_VIEW: &str = "customers.view";
    pub const LINKS_ARCHIVE: &str = "links.archive";
    pub const LINKS_CREATE: &str = "links.create";
    pub const LINKS_DELETE: &str = "links.delete";
    pub const LINKS_UPDATE: &str = "links.update";
    pub const LINKS_VIEW: &str = "links.view";
    pub const LINKS_VIEW_ALL: &str = "links.view_all";
    pub const SEARCH_USE: &str = "search.use";
    pub const TIME_TRACKING_BULK_ARCHIVE: &str = "time_tracking.bulk_archive";
    pub const TIME_TRACKING_BULK_DELETE: &str = "time_tracking.bulk_delete";
    pub const TIME_TRACKING_BULK_UPDATE: &str = "time_tracking.bulk_update";
    pub const TIME_TRACKING_CUSTOMERS_CREATE: &str = "time_tracking.customers.create";
    pub const TIME_TRACKING_CUSTOMERS_VIEW: &str = "time_tracking.customers.view";
    pub const TIME_TRACKING_CREATE: &str = "time_tracking.create";
    pub const TIME_TRACKING_DELETE: &str = "time_tracking.delete";
    pub const TIME_TRACKING_UPDATE: &str = "time_tracking.update";
    pub const TIME_TRACKING_VIEW: &str = "time_tracking.view";
    pub const TIME_TRACKING_VIEW_ALL: &str = "time_tracking.view_all";
    pub const EMPLOYEES_CREATE: &str = "employees.create";
    pub const EMPLOYEES_DELETE: &str = "employees.delete";
    pub const EMPLOYEES_UPDATE: &str = "employees.update";
    pub const EMPLOYEES_VIEW: &str = "employees.view";
    pub const EMPLOYEES_VIEW_SELF: &str = "employees.view_self";
    pub const MODULES_CUSTOMERS_VIEW: &str = "modules.customers.view";
    pub const MODULES_EMPLOYEES_VIEW: &str = "modules.employees.view";
    pub const MODULES_LINKS_VIEW: &str = "modules.links.view";
    pub const MODULES_TICKETS_VIEW: &str = "modules.tickets.view";
    pub const MODULES_TIMETRACKING_VIEW: &str = "modules.timetracking.view";
    pub const MODULES_TODOS_VIEW: &str = "modules.todos.view";
    pub const TICKETS_ASSIGN: &str = "tickets.assign";
    pub const TICKETS_COMMENT: &str = "tickets.comment";
    pub const TICKETS_COMMENTS_AGENT_ONLY: &str = "tickets.comments.agent_only";
    pub const TICKETS_COMMENTS_VIEW_INTERNAL: &str = "tickets.comments.view_internal";
    pub const TICKETS_CREATE: &str = "tickets.create";
    pub const TICKETS_DELETE: &str = "tickets.delete";
    pub const TICKETS_TIME_ENTRIES_CREATE: &str = "tickets.time_entries.create";
    pub const TICKETS_TIME_ENTRIES_VIEW: &str = "tickets.time_entries.view";
    pub const TICKETS_UPDATE: &str = "tickets.update";
    pub const TICKETS_VIEW: &str = "tickets.view";
    pub const TICKETS_VIEW_ALL: &str = "tickets.view_all";
    pub const TODOS_ASSIGN: &str = "todos.assign";
    pub const TODOS_CREATE: &str = "todos.create";
    pub const TODOS_DELETE: &str = "todos.delete";
    pub const TODOS_UPDATE: &str = "todos.update";
    pub const TODOS_VIEW: &str = "todos.view";
}

#[derive(Debug, Deserialize)]
struct PermissionCatalog {
    keys: Vec<String>,
    #[serde(rename = "requiresAny")]
    requires_any: HashMap<String, Vec<String>>,
}

// Human: Embedded JSON is the same file the Vite app imports so Rust tests and CI can detect catalog drift.
// Agent: include_str shared/permissions/catalog.json; PARSE once via LazyLock.

static CATALOG: std::sync::LazyLock<PermissionCatalog> = std::sync::LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../../shared/permissions/catalog.json"))
        .expect("shared/permissions/catalog.json must parse")
});

/// All permission keys defined in the shared catalog.
pub fn all_keys() -> &'static [String] {
    &CATALOG.keys
}

/// Returns prerequisite keys that should accompany `key` when assigning permissions (admin UI validation).
pub fn required_any_for(key: &str) -> Option<&[String]> {
    CATALOG.requires_any.get(key).map(|v| v.as_slice())
}

/// Validates that every key exists in the catalog; returns unknown keys.
pub fn unknown_keys(keys: &[String]) -> Vec<String> {
    let known: HashSet<&str> = CATALOG.keys.iter().map(String::as_str).collect();
    keys.iter()
        .filter(|k| !known.contains(k.as_str()))
        .cloned()
        .collect()
}

/// Validates assignment sets and returns human-readable warnings for missing prerequisites.
pub fn validate_assignment_keys(keys: &HashSet<String>) -> Vec<String> {
    let mut warnings = Vec::new();
    for key in keys {
        if let Some(required) = required_any_for(key) {
            let satisfied = required.iter().any(|r| keys.contains(r));
            if !satisfied {
                warnings.push(format!(
                    "{key} is usually assigned together with one of: {}",
                    required.join(", ")
                ));
            }
        }
    }
    warnings.sort();
    warnings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_has_unique_keys() {
        let mut seen = HashSet::new();
        for k in all_keys() {
            assert!(seen.insert(k.as_str()), "duplicate catalog key: {k}");
        }
        assert!(!all_keys().is_empty());
    }

    #[test]
    fn key_constants_exist_in_catalog() {
        let known: HashSet<&str> = all_keys().iter().map(String::as_str).collect();
        let samples = [
            key::ADMIN_USERS_VIEW,
            key::TICKETS_VIEW,
            key::EMPLOYEES_VIEW,
            key::TIME_TRACKING_CUSTOMERS_CREATE,
            key::TIME_TRACKING_CUSTOMERS_VIEW,
        ];
        for s in samples {
            assert!(known.contains(s), "constant missing from catalog: {s}");
        }
    }
}
