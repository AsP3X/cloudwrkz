//! Background enrichment: scrape bookmark URLs for Open Graph / Twitter metadata (respecting robots.txt).

// Human: Website links get a background job that fetches HTML metadata and merges it into `links.metadata` without overwriting GitHub fields.
// Agent: READS links.url metadata; CALLS link_preview::scrape_link_page; WRITES links.metadata metadata_extracted_at; UPDATES background_jobs status; CHAINS link_website_screenshot enqueue.

use reqwest::Client;
use serde_json::Value;
use sqlx::{PgPool, Row};
use tracing::{info, warn};

use crate::github_metadata;
use crate::job_queue;
use crate::job_queue::JobLogger;
use crate::link_preview::{merge_scrape_metadata, scrape_link_page};

async fn mark_background_job_failed(
    pool: &PgPool,
    job_id: &str,
    msg: &str,
    logger: Option<&JobLogger>,
) {
    if let Some(log) = logger {
        log.log(&format!("Job failed: {msg}"));
    }
    let _ = sqlx::query(
        r#"UPDATE background_jobs SET status = 'failed', error_message = $2, updated_at = clock_timestamp(), completed_at = clock_timestamp() WHERE id = $1"#,
    )
    .bind(job_id)
    .bind(msg)
    .execute(pool)
    .await;
}

// Human: After HTML metadata saves, queue screenshot capture when robots allowed so capture is not lost behind a stale parallel enqueue.
// Agent: CALLS enqueue_link_website_screenshot_job when robots_allowed + created_by_user_id Some; LOGS warn on enqueue failure.

async fn enqueue_screenshot_after_metadata(
    pool: &PgPool,
    link_id: &str,
    created_by_user_id: Option<&str>,
    robots_allowed: bool,
) {
    if !robots_allowed {
        return;
    }
    let Some(user_id) = created_by_user_id else {
        warn!(
            event = "website_metadata.screenshot_enqueue_skipped",
            link_id = %link_id,
            "no created_by_user_id on metadata job; screenshot job not chained"
        );
        return;
    };
    if let Err(e) =
        job_queue::enqueue_link_website_screenshot_job(pool, link_id, user_id).await
    {
        warn!(
            event = "website_metadata.screenshot_enqueue_failed",
            link_id = %link_id,
            error = %e,
            "could not chain link_website_screenshot job after metadata scrape"
        );
    }
}

// Human: One job loads the link row, scrapes when not a GitHub repo URL, and persists merged JSON back on success.
// Agent: SELECT url metadata; SKIP github URLs; scrape_link_page; UPDATE links; mark job completed or failed; CHAIN screenshot job.

pub async fn execute_website_link_metadata_job(
    pool: &PgPool,
    client: &Client,
    job_id: &str,
    link_id: &str,
    created_by_user_id: Option<&str>,
    logger: Option<&JobLogger>,
) {
    if let Some(log) = logger {
        log.log(&format!("Loading link row link_id={link_id}"));
    }
    let link_row = match sqlx::query("SELECT url, metadata FROM links WHERE id = $1")
        .bind(link_id)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(r)) => r,
        Ok(None) => {
            mark_background_job_failed(pool, job_id, "Link not found", logger).await;
            return;
        }
        Err(e) => {
            mark_background_job_failed(pool, job_id, &format!("Database error: {e}"), logger).await;
            return;
        }
    };

    let url: String = link_row.get("url");
    if github_metadata::parse_github_owner_repo(&url).is_some() {
        mark_background_job_failed(
            pool,
            job_id,
            "GitHub URLs use github_link_metadata jobs",
            logger,
        )
        .await;
        return;
    }

    if let Some(log) = logger {
        log.log(&format!("Scraping page metadata for {url}"));
    }
    let existing_meta: Option<Value> = link_row.get("metadata");
    let scrape = scrape_link_page(client, &url).await;
    if let Some(log) = logger {
        log.log(&format!(
            "Scrape finished (robots_allowed={}, title={})",
            scrape.robots_allowed,
            scrape
                .metadata
                .as_ref()
                .and_then(|m| m.title.as_deref())
                .unwrap_or("—")
        ));
    }
    let merged = merge_scrape_metadata(existing_meta, &scrape);

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            mark_background_job_failed(
                pool,
                job_id,
                &format!("Failed to start transaction: {e}"),
                logger,
            )
            .await;
            return;
        }
    };

    if let Err(e) = sqlx::query(
        r#"UPDATE links SET metadata = $1, metadata_extracted_at = NOW(), updated_at = NOW() WHERE id = $2"#,
    )
    .bind(sqlx::types::Json(merged))
    .bind(link_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        mark_background_job_failed(pool, job_id, &format!("Failed to save metadata: {e}"), logger)
            .await;
        return;
    }

    if let Err(e) = sqlx::query(
        r#"UPDATE background_jobs SET status = 'completed', completed_at = NOW(), updated_at = NOW(), error_message = NULL WHERE id = $1"#,
    )
    .bind(job_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        mark_background_job_failed(
            pool,
            job_id,
            &format!("Failed to mark job completed: {e}"),
            logger,
        )
        .await;
        return;
    }

    if let Err(e) = tx.commit().await {
        mark_background_job_failed(
            pool,
            job_id,
            &format!("Failed to commit metadata update: {e}"),
            logger,
        )
        .await;
        return;
    }

    enqueue_screenshot_after_metadata(pool, link_id, created_by_user_id, scrape.robots_allowed).await;

    if let Some(log) = logger {
        log.log("Website metadata saved; job completed");
    }

    info!(
        event = "website_metadata.job_ok",
        job_id = %job_id,
        link_id = %link_id,
        robots_allowed = scrape.robots_allowed,
        "Website link metadata saved"
    );
}
