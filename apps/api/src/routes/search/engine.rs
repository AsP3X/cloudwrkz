//! Ranking helpers: combine pg_trgm match strength with recent access frequency.

use std::collections::HashMap;

use sqlx::{PgPool, Row};

/// Sliding window for "how often was this result opened" boosts.
pub const ACCESS_BOOST_WINDOW_DAYS: i64 = 30;

/// Maximum score added on top of fuzzy match (0..1) from access history.
pub const MAX_ACCESS_BOOST: f64 = 0.22;

#[derive(Debug, Clone)]
pub struct ScoredHit {
    pub entity_type: String,
    pub entity_id: String,
    pub match_score: f64,
    pub result: serde_json::Value,
}

/// Diminishing boost: frequent opens help, with a hard cap.
pub fn access_boost(access_count: i64) -> f64 {
    if access_count <= 0 {
        return 0.0;
    }
    let x = (access_count.min(80) as f64).sqrt() * 0.028;
    x.min(MAX_ACCESS_BOOST)
}

pub fn final_score(match_score: f64, access_count: i64) -> f64 {
    (match_score + access_boost(access_count)).min(1.5)
}

/// Load recent access counts for the given (entity_type, entity_id) pairs in one query.
pub async fn fetch_recent_access_counts(
    pool: &PgPool,
    user_id: &str,
    pairs: &[(&str, &str)],
) -> Result<HashMap<(String, String), i64>, sqlx::Error> {
    let mut counts = HashMap::new();
    if pairs.is_empty() {
        return Ok(counts);
    }

    let types: Vec<String> = pairs.iter().map(|(t, _)| (*t).to_string()).collect();
    let ids: Vec<String> = pairs.iter().map(|(_, id)| (*id).to_string()).collect();

    let rows = sqlx::query(
        r#"
        SELECT s.entity_type, s.entity_id, COALESCE(COUNT(a.id), 0)::bigint AS c
        FROM unnest($2::text[], $3::text[]) AS s(entity_type, entity_id)
        LEFT JOIN search_result_accesses a
          ON a.user_id = $1
         AND a.entity_type = s.entity_type
         AND a.entity_id = s.entity_id
         AND a.accessed_at >= NOW() - make_interval(days => $4::int)
        GROUP BY s.entity_type, s.entity_id
        "#,
    )
    .bind(user_id)
    .bind(&types)
    .bind(&ids)
    .bind(ACCESS_BOOST_WINDOW_DAYS as i32)
    .fetch_all(pool)
    .await?;

    for r in rows {
        let et: String = r.get("entity_type");
        let eid: String = r.get("entity_id");
        let c: i64 = r.get("c");
        counts.insert((et, eid), c);
    }

    Ok(counts)
}

pub fn rank_and_truncate(mut hits: Vec<ScoredHit>, counts: &HashMap<(String, String), i64>, limit: usize) -> Vec<serde_json::Value> {
    hits.sort_by(|a, b| {
        let sa = final_score(
            a.match_score,
            *counts.get(&(a.entity_type.clone(), a.entity_id.clone())).unwrap_or(&0),
        );
        let sb = final_score(
            b.match_score,
            *counts.get(&(b.entity_type.clone(), b.entity_id.clone())).unwrap_or(&0),
        );
        sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
    });
    hits.into_iter().take(limit).map(|h| h.result).collect()
}
