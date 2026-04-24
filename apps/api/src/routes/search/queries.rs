//! Parameter order for search SQL: `$1` = user id, `$2` = query string, `$3` = per-type row cap.
//! Link visibility is owner or collection access only (no global “all links” search).

// Human: Each const embeds the full SQL so search handlers can bind `(user_id, query, limit, …)` consistently across entity types.
// Agent: EXPORTS TICKET_SEARCH_SQL TODO_SEARCH_SQL LINK_SEARCH_SQL TIME_ENTRY_SEARCH_SQL with pg_trgm similarity + permission predicates.

pub const TICKET_SEARCH_SQL: &str = r#"
SELECT id, ticket_number, title, description, status::text AS status, priority::text AS priority,
  GREATEST(
    COALESCE(similarity(title, $2), 0),
    COALESCE(similarity(COALESCE(description_plain, ''), $2), 0),
    COALESCE(similarity(COALESCE(description, ''), $2), 0),
    COALESCE(similarity(ticket_number, $2), 0),
    COALESCE(similarity(COALESCE(array_to_string(tags, ' '), ''), $2), 0),
    COALESCE(similarity(type::text, $2), 0),
    COALESCE(similarity(created_at::text, $2), 0),
    CASE WHEN title ILIKE '%' || $2 || '%' THEN 0.72 ELSE 0 END,
    CASE WHEN COALESCE(description_plain, '') ILIKE '%' || $2 || '%'
      OR COALESCE(description, '') ILIKE '%' || $2 || '%' THEN 0.62 ELSE 0 END,
    CASE WHEN ticket_number ILIKE '%' || $2 || '%' THEN 0.68 ELSE 0 END,
    CASE WHEN COALESCE(array_to_string(tags, ' '), '') ILIKE '%' || $2 || '%' THEN 0.58 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM unnest(tags) AS t(tag) WHERE tag ILIKE '%' || $2 || '%') THEN 0.58 ELSE 0 END,
    CASE WHEN type::text ILIKE '%' || $2 || '%' THEN 0.52 ELSE 0 END
  ) AS match_score
FROM tickets
WHERE archived_at IS NULL
  AND ($4::bool OR created_by_id = $1 OR assigned_to_id = $1)
  AND (
    COALESCE(similarity(title, $2), 0) > 0.1
    OR COALESCE(similarity(COALESCE(description_plain, ''), $2), 0) > 0.1
    OR COALESCE(similarity(COALESCE(description, ''), $2), 0) > 0.1
    OR COALESCE(similarity(ticket_number, $2), 0) > 0.1
    OR COALESCE(similarity(COALESCE(array_to_string(tags, ' '), ''), $2), 0) > 0.1
    OR COALESCE(similarity(type::text, $2), 0) > 0.1
    OR title ILIKE '%' || $2 || '%'
    OR COALESCE(description_plain, '') ILIKE '%' || $2 || '%'
    OR COALESCE(description, '') ILIKE '%' || $2 || '%'
    OR ticket_number ILIKE '%' || $2 || '%'
    OR COALESCE(array_to_string(tags, ' '), '') ILIKE '%' || $2 || '%'
    OR type::text ILIKE '%' || $2 || '%'
    OR EXISTS (SELECT 1 FROM unnest(tags) AS t(tag) WHERE tag ILIKE '%' || $2 || '%')
  )
ORDER BY match_score DESC NULLS LAST, updated_at DESC
LIMIT $3
"#;

pub const TODO_SEARCH_SQL: &str = r#"
SELECT id, todo_number, title, description, description_plain, status::text AS status, priority::text AS priority,
  GREATEST(
    COALESCE(similarity(title, $2), 0),
    COALESCE(similarity(COALESCE(description_plain, ''), $2), 0),
    COALESCE(similarity(COALESCE(description, ''), $2), 0),
    COALESCE(similarity(COALESCE(todo_number, ''), $2), 0),
    CASE WHEN title ILIKE '%' || $2 || '%' THEN 0.72 ELSE 0 END,
    CASE WHEN COALESCE(description_plain, '') ILIKE '%' || $2 || '%'
      OR COALESCE(description, '') ILIKE '%' || $2 || '%' THEN 0.62 ELSE 0 END,
    CASE WHEN COALESCE(todo_number, '') ILIKE '%' || $2 || '%' THEN 0.65 ELSE 0 END
  ) AS match_score
FROM todos t
WHERE t.archived_at IS NULL
  AND (
    $4::bool
    OR t.assigned_to_id = $1
    OR EXISTS (
      SELECT 1 FROM tickets tk
      WHERE tk.id = t.ticket_id
        AND (tk.created_by_id = $1 OR tk.assigned_to_id = $1)
    )
  )
  AND (
    COALESCE(similarity(title, $2), 0) > 0.1
    OR COALESCE(similarity(COALESCE(description_plain, ''), $2), 0) > 0.1
    OR COALESCE(similarity(COALESCE(description, ''), $2), 0) > 0.1
    OR COALESCE(similarity(COALESCE(todo_number, ''), $2), 0) > 0.1
    OR title ILIKE '%' || $2 || '%'
    OR COALESCE(description_plain, '') ILIKE '%' || $2 || '%'
    OR COALESCE(description, '') ILIKE '%' || $2 || '%'
    OR COALESCE(todo_number, '') ILIKE '%' || $2 || '%'
  )
ORDER BY match_score DESC NULLS LAST, t.updated_at DESC
LIMIT $3
"#;

pub const TIME_ENTRY_SEARCH_SQL: &str = r#"
SELECT te.id, te.name, te.description, te.status::text AS status,
  te.started_at, te.paused_at, te.stopped_at, te.completed_at, te.last_resumed_at, te.total_duration,
  (SELECT COALESCE(SUM(b.duration), 0)::bigint FROM time_entry_breaks b WHERE b.time_entry_id = te.id)::int AS break_duration_total,
  GREATEST(
    COALESCE(similarity(name, $2), 0),
    COALESCE(similarity(COALESCE(description, ''), $2), 0),
    COALESCE(similarity(COALESCE(location, ''), $2), 0),
    COALESCE(similarity(COALESCE(array_to_string(tags, ' '), ''), $2), 0),
    COALESCE(similarity(created_at::text, $2), 0),
    CASE WHEN name ILIKE '%' || $2 || '%' THEN 0.72 ELSE 0 END,
    CASE WHEN COALESCE(description, '') ILIKE '%' || $2 || '%' THEN 0.6 ELSE 0 END,
    CASE WHEN COALESCE(location, '') ILIKE '%' || $2 || '%' THEN 0.55 ELSE 0 END,
    CASE WHEN COALESCE(array_to_string(tags, ' '), '') ILIKE '%' || $2 || '%' THEN 0.55 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM unnest(tags) AS t(tag) WHERE tag ILIKE '%' || $2 || '%') THEN 0.55 ELSE 0 END
  ) AS match_score
FROM time_entries te
WHERE te.archived_at IS NULL
  AND ($4::bool OR te.user_id = $1)
  AND (
    COALESCE(similarity(name, $2), 0) > 0.1
    OR COALESCE(similarity(COALESCE(description, ''), $2), 0) > 0.1
    OR COALESCE(similarity(COALESCE(location, ''), $2), 0) > 0.1
    OR COALESCE(similarity(COALESCE(array_to_string(tags, ' '), ''), $2), 0) > 0.1
    OR name ILIKE '%' || $2 || '%'
    OR COALESCE(description, '') ILIKE '%' || $2 || '%'
    OR COALESCE(location, '') ILIKE '%' || $2 || '%'
    OR COALESCE(array_to_string(tags, ' '), '') ILIKE '%' || $2 || '%'
    OR EXISTS (SELECT 1 FROM unnest(tags) AS t(tag) WHERE tag ILIKE '%' || $2 || '%')
  )
ORDER BY match_score DESC NULLS LAST, te.updated_at DESC
LIMIT $3
"#;

/// Bind: `$1` user_id (reserved, unused for row filter — any user with employees.view sees all), `$2` query, `$3` limit.
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

/// Bind: `$1` user_id (reserved, unused for row filter), `$2` query, `$3` limit.
/// Only searches active (non-deleted, non-banned, non-suspended) users.
pub const USER_SEARCH_SQL: &str = r#"
SELECT id, name, email, role::text AS role,
  GREATEST(
    COALESCE(similarity(COALESCE(name, ''), $2), 0),
    COALESCE(similarity(COALESCE(email, ''), $2), 0),
    CASE WHEN COALESCE(name, '') ILIKE '%' || $2 || '%' THEN 0.80 ELSE 0 END,
    CASE WHEN COALESCE(email, '') ILIKE '%' || $2 || '%' THEN 0.72 ELSE 0 END
  ) AS match_score
FROM users
WHERE status = 'ACTIVE'
  AND (
    COALESCE(similarity(COALESCE(name, ''), $2), 0) > 0.1
    OR COALESCE(similarity(COALESCE(email, ''), $2), 0) > 0.1
    OR COALESCE(name, '') ILIKE '%' || $2 || '%'
    OR COALESCE(email, '') ILIKE '%' || $2 || '%'
  )
ORDER BY match_score DESC NULLS LAST, name ASC
LIMIT $3
"#;

/// Bind: `$1` user, `$2` query, `$3` limit.
pub const LINK_SEARCH_SQL: &str = r#"
SELECT l.id, l.title, l.url, l.description, l.tags, l.link_type::text AS link_type,
       l.metadata AS link_metadata, l.favicon, l.rating, l.created_at, l.updated_at,
  GREATEST(
    COALESCE(similarity(l.title, $2), 0),
    COALESCE(similarity(COALESCE(l.url, ''), $2), 0),
    COALESCE(similarity(COALESCE(l.normalized_url, ''), $2), 0),
    COALESCE(similarity(COALESCE(l.description, ''), $2), 0),
    COALESCE(similarity(COALESCE(l.notes, ''), $2), 0),
    COALESCE(similarity(COALESCE(array_to_string(l.tags, ' '), ''), $2), 0),
    COALESCE(similarity(l.link_type::text, $2), 0),
    COALESCE(similarity(COALESCE(l.metadata::text, ''), $2), 0),
    COALESCE(similarity(l.created_at::text, $2), 0),
    CASE WHEN l.title ILIKE '%' || $2 || '%' THEN 0.72 ELSE 0 END,
    CASE WHEN l.url ILIKE '%' || $2 || '%' OR COALESCE(l.normalized_url, '') ILIKE '%' || $2 || '%' THEN 0.68 ELSE 0 END,
    CASE WHEN COALESCE(l.description, '') ILIKE '%' || $2 || '%' THEN 0.62 ELSE 0 END,
    CASE WHEN COALESCE(l.notes, '') ILIKE '%' || $2 || '%' THEN 0.58 ELSE 0 END,
    CASE WHEN COALESCE(array_to_string(l.tags, ' '), '') ILIKE '%' || $2 || '%' THEN 0.58 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM unnest(l.tags) AS t(tag) WHERE tag ILIKE '%' || $2 || '%') THEN 0.58 ELSE 0 END,
    CASE WHEN l.link_type::text ILIKE '%' || $2 || '%' THEN 0.55 ELSE 0 END,
    CASE WHEN COALESCE(l.metadata::text, '') ILIKE '%' || $2 || '%' THEN 0.52 ELSE 0 END,
    CASE WHEN l.created_at::text ILIKE '%' || $2 || '%'
      OR to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') ILIKE '%' || $2 || '%' THEN 0.48 ELSE 0 END
  ) AS match_score
FROM links l
WHERE l.archived_at IS NULL
  AND (
    l.user_id = $1
    OR EXISTS (
      SELECT 1 FROM link_collections lc
      INNER JOIN collections c ON c.id = lc.collection_id
      WHERE lc.link_id = l.id
        AND (
          c.owner_id = $1
          OR EXISTS (
            SELECT 1 FROM collection_members m
            WHERE m.collection_id = c.id AND m.user_id = $1
          )
        )
    )
  )
  AND (
    COALESCE(similarity(l.title, $2), 0) > 0.12
    OR COALESCE(similarity(COALESCE(l.url, ''), $2), 0) > 0.12
    OR COALESCE(similarity(COALESCE(l.normalized_url, ''), $2), 0) > 0.12
    OR COALESCE(similarity(COALESCE(l.description, ''), $2), 0) > 0.12
    OR COALESCE(similarity(COALESCE(l.notes, ''), $2), 0) > 0.12
    OR COALESCE(similarity(COALESCE(array_to_string(l.tags, ' '), ''), $2), 0) > 0.12
    OR COALESCE(similarity(l.link_type::text, $2), 0) > 0.12
    OR COALESCE(similarity(COALESCE(l.metadata::text, ''), $2), 0) > 0.12
    OR COALESCE(similarity(l.created_at::text, $2), 0) > 0.12
    OR COALESCE(similarity(to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), $2), 0) > 0.12
    OR l.title ILIKE '%' || $2 || '%'
    OR l.url ILIKE '%' || $2 || '%'
    OR COALESCE(l.normalized_url, '') ILIKE '%' || $2 || '%'
    OR COALESCE(l.description, '') ILIKE '%' || $2 || '%'
    OR COALESCE(l.notes, '') ILIKE '%' || $2 || '%'
    OR COALESCE(array_to_string(l.tags, ' '), '') ILIKE '%' || $2 || '%'
    OR l.link_type::text ILIKE '%' || $2 || '%'
    OR COALESCE(l.metadata::text, '') ILIKE '%' || $2 || '%'
    OR l.created_at::text ILIKE '%' || $2 || '%'
    OR to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') ILIKE '%' || $2 || '%'
    OR EXISTS (SELECT 1 FROM unnest(l.tags) AS t(tag) WHERE tag ILIKE '%' || $2 || '%')
  )
ORDER BY match_score DESC NULLS LAST, l.updated_at DESC
LIMIT $3
"#;
