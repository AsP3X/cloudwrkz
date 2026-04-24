# Search: Add Employees and Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add employees and users as searchable entity types in the global search system, with proper module checks, permission gates, SQL queries, result mappers, and me.rs module visibility.

**Architecture:** Follows the exact pattern of the four existing entity types (tickets, todos, links, timeentries). Each entity gets a SQL constant in `queries.rs`, a `can_search_*` predicate and `*_to_result` mapper in `mod.rs`, and is wired into `execute_unified_search` and the type-filter exclusion logic. The employees module is also added to `me.rs` so the client receives it in the session bootstrap.

**Tech Stack:** Rust, axum, sqlx, PostgreSQL (pg_trgm)

---

## File Map

| File | Change |
|------|--------|
| `apps/api/src/routes/search/queries.rs` | Add `EMPLOYEE_SEARCH_SQL` and `USER_SEARCH_SQL` |
| `apps/api/src/routes/search/mod.rs` | Extend `SearchContext`, `load_search_context`, add `can_search_employees`, `can_search_users`, `employee_to_result`, `user_to_result`, wire into `execute_unified_search` and type-filter exclusions, allow `"employee"`/`"user"` in `record_search_access` |
| `apps/api/src/routes/me.rs` | Add employees to `MODULE_VIEW_PERMISSION` and the module-id match arm |

---

### Task 1: Add EMPLOYEE_SEARCH_SQL to queries.rs

**Files:**
- Modify: `apps/api/src/routes/search/queries.rs`

Employees table columns: `id`, `first_name`, `last_name`, `email`, `title`, `company_role`, `department`, `employee_status`.
No archived_at column; filter by `employee_status != 'TERMINATED'` is optional but we skip it — admins may want to find terminated employees too.
Bind order: `$1` = user_id (unused for row-level filtering — any user with `employees.view` sees all), `$2` = query string, `$3` = row cap.

- [ ] **Step 1: Append EMPLOYEE_SEARCH_SQL constant**

Add after the `LINK_SEARCH_SQL` const in `apps/api/src/routes/search/queries.rs`:

```rust
/// Bind: `$1` user_id (reserved, unused for row filter), `$2` query, `$3` limit.
pub const EMPLOYEE_SEARCH_SQL: &str = r#"
SELECT id,
       first_name, last_name, email, title,
       company_role, department,
       employee_status::text AS employee_status,
  GREATEST(
    COALESCE(similarity(first_name || ' ' || last_name, $2), 0),
    COALESCE(similarity(first_name, $2), 0),
    COALESCE(similarity(last_name, $2), 0),
    COALESCE(similarity(COALESCE(email, ''), $2), 0),
    COALESCE(similarity(COALESCE(title, ''), $2), 0),
    COALESCE(similarity(COALESCE(company_role, ''), $2), 0),
    COALESCE(similarity(COALESCE(department, ''), $2), 0),
    CASE WHEN first_name || ' ' || last_name ILIKE '%' || $2 || '%' THEN 0.80 ELSE 0 END,
    CASE WHEN first_name ILIKE '%' || $2 || '%' THEN 0.75 ELSE 0 END,
    CASE WHEN last_name ILIKE '%' || $2 || '%' THEN 0.75 ELSE 0 END,
    CASE WHEN COALESCE(email, '') ILIKE '%' || $2 || '%' THEN 0.70 ELSE 0 END,
    CASE WHEN COALESCE(title, '') ILIKE '%' || $2 || '%' THEN 0.60 ELSE 0 END,
    CASE WHEN COALESCE(company_role, '') ILIKE '%' || $2 || '%' THEN 0.58 ELSE 0 END,
    CASE WHEN COALESCE(department, '') ILIKE '%' || $2 || '%' THEN 0.55 ELSE 0 END
  ) AS match_score
FROM employees
WHERE (
    COALESCE(similarity(first_name || ' ' || last_name, $2), 0) > 0.1
    OR COALESCE(similarity(first_name, $2), 0) > 0.1
    OR COALESCE(similarity(last_name, $2), 0) > 0.1
    OR COALESCE(similarity(COALESCE(email, ''), $2), 0) > 0.1
    OR COALESCE(similarity(COALESCE(title, ''), $2), 0) > 0.1
    OR COALESCE(similarity(COALESCE(company_role, ''), $2), 0) > 0.1
    OR COALESCE(similarity(COALESCE(department, ''), $2), 0) > 0.1
    OR first_name ILIKE '%' || $2 || '%'
    OR last_name ILIKE '%' || $2 || '%'
    OR first_name || ' ' || last_name ILIKE '%' || $2 || '%'
    OR COALESCE(email, '') ILIKE '%' || $2 || '%'
    OR COALESCE(title, '') ILIKE '%' || $2 || '%'
    OR COALESCE(company_role, '') ILIKE '%' || $2 || '%'
    OR COALESCE(department, '') ILIKE '%' || $2 || '%'
  )
ORDER BY match_score DESC NULLS LAST, last_name ASC, first_name ASC
LIMIT $3
"#;
```

- [ ] **Step 2: Add USER_SEARCH_SQL constant**

Add immediately after `EMPLOYEE_SEARCH_SQL`:

```rust
/// Bind: `$1` user_id (reserved, unused for row filter), `$2` query, `$3` limit.
/// Only searches active (non-deactivated) users.
pub const USER_SEARCH_SQL: &str = r#"
SELECT id, name, email, role::text AS role
  GREATEST(
    COALESCE(similarity(COALESCE(name, ''), $2), 0),
    COALESCE(similarity(COALESCE(email, ''), $2), 0),
    CASE WHEN COALESCE(name, '') ILIKE '%' || $2 || '%' THEN 0.80 ELSE 0 END,
    CASE WHEN COALESCE(email, '') ILIKE '%' || $2 || '%' THEN 0.72 ELSE 0 END
  ) AS match_score
FROM users
WHERE deactivated_at IS NULL
  AND (
    COALESCE(similarity(COALESCE(name, ''), $2), 0) > 0.1
    OR COALESCE(similarity(COALESCE(email, ''), $2), 0) > 0.1
    OR COALESCE(name, '') ILIKE '%' || $2 || '%'
    OR COALESCE(email, '') ILIKE '%' || $2 || '%'
  )
ORDER BY match_score DESC NULLS LAST, name ASC
LIMIT $3
"#;
```

- [ ] **Step 3: Verify the file compiles (check for syntax)**

```bash
cd apps/api && cargo check 2>&1 | head -40
```

Expected: errors only in mod.rs about unused imports (we haven't wired yet), NOT in queries.rs.

---

### Task 2: Extend SearchContext and add helpers in mod.rs

**Files:**
- Modify: `apps/api/src/routes/search/mod.rs`

- [ ] **Step 1: Import the two new SQL constants**

Change line 24 from:
```rust
use queries::{LINK_SEARCH_SQL, TICKET_SEARCH_SQL, TIME_ENTRY_SEARCH_SQL, TODO_SEARCH_SQL};
```
To:
```rust
use queries::{
    EMPLOYEE_SEARCH_SQL, LINK_SEARCH_SQL, TICKET_SEARCH_SQL, TIME_ENTRY_SEARCH_SQL,
    TODO_SEARCH_SQL, USER_SEARCH_SQL,
};
```

- [ ] **Step 2: Add mod_employees and mod_users fields to SearchContext**

Change the `SearchContext` struct (lines 64-72) from:
```rust
struct SearchContext {
    perm_keys: Vec<String>,
    mod_tickets: bool,
    mod_todos: bool,
    mod_links: bool,
    mod_time: bool,
    can_view_all_tickets: bool,
    can_view_all_time: bool,
}
```
To:
```rust
struct SearchContext {
    perm_keys: Vec<String>,
    mod_tickets: bool,
    mod_todos: bool,
    mod_links: bool,
    mod_time: bool,
    mod_employees: bool,
    mod_users: bool,
    can_view_all_tickets: bool,
    can_view_all_time: bool,
}
```

- [ ] **Step 3: Load the two new module flags in load_search_context**

Change `load_search_context` (lines 84-103) from:
```rust
async fn load_search_context(pool: &sqlx::PgPool, user_id: &str) -> SearchContext {
    let perm_keys = get_user_permission_keys(pool, user_id).await;
    let mod_tickets = module_enabled(pool, "tickets").await;
    let mod_todos = module_enabled(pool, "todos").await;
    let mod_links = module_enabled(pool, "links").await;
    let mod_time = module_enabled(pool, "timetracking").await;
    let can_view_all_tickets = check_permission(pool, user_id, "tickets.view_all").await
        || check_permission(pool, user_id, "admin.tickets.manage").await;
    let can_view_all_time = check_permission(pool, user_id, "time_tracking.view_all").await;

    SearchContext {
        perm_keys,
        mod_tickets,
        mod_todos,
        mod_links,
        mod_time,
        can_view_all_tickets,
        can_view_all_time,
    }
}
```
To:
```rust
async fn load_search_context(pool: &sqlx::PgPool, user_id: &str) -> SearchContext {
    let perm_keys = get_user_permission_keys(pool, user_id).await;
    let mod_tickets = module_enabled(pool, "tickets").await;
    let mod_todos = module_enabled(pool, "todos").await;
    let mod_links = module_enabled(pool, "links").await;
    let mod_time = module_enabled(pool, "timetracking").await;
    let mod_employees = module_enabled(pool, "employees").await;
    let mod_users = module_enabled(pool, "users").await;
    let can_view_all_tickets = check_permission(pool, user_id, "tickets.view_all").await
        || check_permission(pool, user_id, "admin.tickets.manage").await;
    let can_view_all_time = check_permission(pool, user_id, "time_tracking.view_all").await;

    SearchContext {
        perm_keys,
        mod_tickets,
        mod_todos,
        mod_links,
        mod_time,
        mod_employees,
        mod_users,
        can_view_all_tickets,
        can_view_all_time,
    }
}
```

- [ ] **Step 4: Add can_search_employees and can_search_users predicates**

Add after the `can_search_time` function (after line 128):
```rust
fn can_search_employees(ctx: &SearchContext) -> bool {
    ctx.mod_employees
        && (has_perm(&ctx.perm_keys, "employees.view")
            || ctx.perm_keys.iter().any(|k| k == "ADMIN"))
}

fn can_search_users(ctx: &SearchContext) -> bool {
    ctx.mod_users && has_perm(&ctx.perm_keys, "users.view")
}
```

Note on employees: the employees.rs handler also allows `user.role == "ADMIN"` as a bypass. Since `perm_keys` only contains permission strings (not role), we check for an "ADMIN" role via a separate DB field. However, looking at the existing pattern, the search context doesn't carry the user role — the simplest consistent approach is to only check `employees.view` permission here (admins should also be granted that permission in the DB). Keep it consistent with other `can_search_*` predicates.

**Revised (consistent with existing pattern):**
```rust
fn can_search_employees(ctx: &SearchContext) -> bool {
    ctx.mod_employees && has_perm(&ctx.perm_keys, "employees.view")
}

fn can_search_users(ctx: &SearchContext) -> bool {
    ctx.mod_users && has_perm(&ctx.perm_keys, "users.view")
}
```

- [ ] **Step 5: Add employee_to_result mapper**

Add after `time_entry_to_result` (after line 228):
```rust
fn employee_to_result(r: &sqlx::postgres::PgRow) -> Result<serde_json::Value, AppError> {
    let id: String = r.get("id");
    Ok(json!({
        "type": "employee",
        "id": id,
        "title": format!(
            "{} {}",
            r.get::<String, _>("first_name"),
            r.get::<String, _>("last_name")
        ),
        "description": r.get::<Option<String>, _>("title"),
        "url": format!("/dashboard/employees/{}", id),
        "metadata": {
            "firstName": r.get::<String, _>("first_name"),
            "lastName": r.get::<String, _>("last_name"),
            "email": r.get::<String, _>("email"),
            "title": r.get::<Option<String>, _>("title"),
            "companyRole": r.get::<Option<String>, _>("company_role"),
            "department": r.get::<Option<String>, _>("department"),
            "employeeStatus": r.get::<String, _>("employee_status"),
        },
    }))
}
```

- [ ] **Step 6: Add user_to_result mapper**

Add immediately after `employee_to_result`:
```rust
fn user_to_result(r: &sqlx::postgres::PgRow) -> Result<serde_json::Value, AppError> {
    let id: String = r.get("id");
    Ok(json!({
        "type": "user",
        "id": id,
        "title": r.get::<Option<String>, _>("name").unwrap_or_default(),
        "description": r.get::<String, _>("email"),
        "url": format!("/dashboard/users/{}", id),
        "metadata": {
            "email": r.get::<String, _>("email"),
            "role": r.get::<String, _>("role"),
        },
    }))
}
```

---

### Task 3: Wire employees and users into execute_unified_search

**Files:**
- Modify: `apps/api/src/routes/search/mod.rs`

- [ ] **Step 1: Add run_employees and run_users booleans in execute_unified_search**

In `execute_unified_search`, after `let run_time = ...` (around line 265), add:
```rust
let run_employees = can_search_employees(&ctx)
    && tf
        .as_deref()
        .map(|t| !["ticket", "todo", "link", "timeentry", "user"].contains(&t))
        .unwrap_or(true);
let run_users = can_search_users(&ctx)
    && tf
        .as_deref()
        .map(|t| !["ticket", "todo", "link", "timeentry", "employee"].contains(&t))
        .unwrap_or(true);
```

Also update the existing four `run_*` type-filter exclusion lists to exclude `"employee"` and `"user"`:

```rust
let run_tickets = can_search_tickets(&ctx)
    && tf
        .as_deref()
        .map(|t| !["todo", "link", "timeentry", "employee", "user"].contains(&t))
        .unwrap_or(true);
let run_todos = can_search_todos(&ctx)
    && tf
        .as_deref()
        .map(|t| !["ticket", "link", "timeentry", "employee", "user"].contains(&t))
        .unwrap_or(true);
let run_links = can_search_links(&ctx)
    && tf
        .as_deref()
        .map(|t| !["ticket", "todo", "timeentry", "employee", "user"].contains(&t))
        .unwrap_or(true);
let run_time = can_search_time(&ctx)
    && tf
        .as_deref()
        .map(|t| !["ticket", "todo", "link", "employee", "user"].contains(&t))
        .unwrap_or(true);
```

- [ ] **Step 2: Add employee query execution block**

After the `if run_time { ... }` block (after line 346), add:
```rust
if run_employees {
    let rows = sqlx::query(EMPLOYEE_SEARCH_SQL)
        .bind(user_id)
        .bind(q)
        .bind(cap)
        .fetch_all(&state.pool)
        .await?;
    for r in rows {
        let score = row_match_score(&r);
        let id: String = r.get("id");
        hits.push(ScoredHit {
            entity_type: "employee".to_string(),
            entity_id: id,
            match_score: score,
            result: employee_to_result(&r)?,
        });
    }
}
```

- [ ] **Step 3: Add user query execution block**

Immediately after the employees block:
```rust
if run_users {
    let rows = sqlx::query(USER_SEARCH_SQL)
        .bind(user_id)
        .bind(q)
        .bind(cap)
        .fetch_all(&state.pool)
        .await?;
    for r in rows {
        let score = row_match_score(&r);
        let id: String = r.get("id");
        hits.push(ScoredHit {
            entity_type: "user".to_string(),
            entity_id: id,
            match_score: score,
            result: user_to_result(&r)?,
        });
    }
}
```

- [ ] **Step 4: Allow "employee" and "user" in record_search_access**

Change line 409-413 from:
```rust
let allowed = matches!(
    et,
    "ticket" | "task" | "link" | "timeentry" | "user" | "comment" | "setting"
);
```
To:
```rust
let allowed = matches!(
    et,
    "ticket" | "task" | "link" | "timeentry" | "employee" | "user" | "comment" | "setting"
);
```

---

### Task 4: Fix me.rs module visibility for employees

**Files:**
- Modify: `apps/api/src/routes/me.rs`

- [ ] **Step 1: Add employees to MODULE_VIEW_PERMISSION**

Change lines 16-21 from:
```rust
const MODULE_VIEW_PERMISSION: &[(&str, &str)] = &[
    ("tickets", "modules.tickets.view"),
    ("timetracking", "modules.timetracking.view"),
    ("todos", "modules.todos.view"),
    ("links", "modules.links.view"),
];
```
To:
```rust
const MODULE_VIEW_PERMISSION: &[(&str, &str)] = &[
    ("tickets", "modules.tickets.view"),
    ("timetracking", "modules.timetracking.view"),
    ("todos", "modules.todos.view"),
    ("links", "modules.links.view"),
    ("employees", "modules.employees.view"),
];
```

- [ ] **Step 2: Add employees arm to the module-id match**

Change lines 61-66 from:
```rust
match key.as_str() {
    "tickets" => Some("tickets".to_string()),
    "timetracking" => Some("time_tracking".to_string()),
    "todos" => Some("todos".to_string()),
    "links" => Some("links".to_string()),
    _ => None,
}
```
To:
```rust
match key.as_str() {
    "tickets" => Some("tickets".to_string()),
    "timetracking" => Some("time_tracking".to_string()),
    "todos" => Some("todos".to_string()),
    "links" => Some("links".to_string()),
    "employees" => Some("employees".to_string()),
    _ => None,
}
```

---

### Task 5: Compile and verify

**Files:** None (verification only)

- [ ] **Step 1: Run cargo check**

```bash
cd apps/api && cargo check 2>&1
```

Expected: no errors. If `deactivated_at` column doesn't exist on `users`, the error will point to USER_SEARCH_SQL — check actual column name with:
```bash
cd apps/api && cargo sqlx prepare --check 2>&1 | head -60
```
Or inspect a migration for the users table column list. Common alternatives: `is_active`, `disabled_at`, `status`. Adjust the WHERE clause accordingly.

- [ ] **Step 2: Run cargo clippy**

```bash
cd apps/api && cargo clippy 2>&1 | grep -E "^error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/search/queries.rs \
        apps/api/src/routes/search/mod.rs \
        apps/api/src/routes/me.rs \
        docs/superpowers/plans/2026-04-24-search-employees-users.md
git commit -m "feat: add employees and users to global search index

- EMPLOYEE_SEARCH_SQL: fuzzy match on name, email, title, role, department
- USER_SEARCH_SQL: fuzzy match on name and email (active users only)
- SearchContext: mod_employees, mod_users module flags
- Permission gates: employees.view, users.view
- Result mappers: employee_to_result, user_to_result
- execute_unified_search: employees and users query blocks + type-filter wiring
- record_search_access: allow 'employee' entity_type
- me.rs: employees module in MODULE_VIEW_PERMISSION and client id match"
```
