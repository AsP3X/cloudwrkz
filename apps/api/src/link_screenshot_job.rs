//! Background job: headless Chromium screenshot for link detail previews (`link_website_screenshot`).

// Human: Screenshots run in their own job so HTML metadata scraping and slow Chromium captures do not block each other.
// Agent: READS links.url metadata; CHECKS robots.txt; CALLS capture_link_screenshot; MERGES screenshotUrl into links.metadata.

use reqwest::Client;
use serde_json::Value;
use sqlx::{PgPool, Row};
use tracing::info;

use crate::github_metadata;
use crate::job_queue::JobLogger;
use crate::link_preview::{
    capture_link_screenshot, chromium_executable, merge_screenshot_into_metadata,
    robots::check_robots_allowed, ScreenshotCaptureOutcome,
};

async fn mark_background_job_failed(
    pool: &PgPool,
    job_id: &str,
    msg: &str,
    logger: Option<&JobLogger>,
) {
    if let Some(log) = logger {
        log.log_critical(&format!("Job failed: {msg}")).await;
    }
    let _ = sqlx::query(
        r#"UPDATE background_jobs SET status = 'failed', error_message = $2, updated_at = clock_timestamp(), completed_at = clock_timestamp() WHERE id = $1 AND status = 'processing'"#,
    )
    .bind(job_id)
    .bind(msg)
    .execute(pool)
    .await;
}

// Human: One job captures a PNG when robots.txt allows and patches `screenshotUrl` without re-scraping Open Graph fields.
// Agent: SELECT url metadata; SKIP github; robots check; capture_link_screenshot; UPDATE links.metadata; complete background_jobs.

pub async fn execute_link_screenshot_job(
    pool: &PgPool,
    client: &Client,
    job_id: &str,
    link_id: &str,
    logger: Option<&JobLogger>,
) {
    if let Some(log) = logger {
        log.log_critical(&format!("Loading link row link_id={link_id}"))
            .await;
        if chromium_executable().is_none() {
            log.log_critical(
                "Chromium not available on this host — screenshot capture skipped",
            )
            .await;
        }
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
            "GitHub URLs do not use website screenshots",
            logger,
        )
        .await;
        return;
    }

    let existing_meta: Option<Value> = link_row.get("metadata");

    if let Some(log) = logger {
        log.log_critical(&format!("Checking robots.txt for {url}"))
            .await;
    }
    let robots = check_robots_allowed(client, &url).await;
    let capture_outcome = if robots.allowed {
        if let Some(log) = logger {
            log.log_critical("Capturing screenshot (Chromium)").await;
        }
        let capture_started = std::time::Instant::now();
        let heartbeat = logger.map(|log| {
            let log = log.clone();
            tokio::spawn(async move {
                let mut tick =
                    tokio::time::interval(std::time::Duration::from_secs(30));
                tick.tick().await;
                loop {
                    tick.tick().await;
                    log.log_critical("Chromium capture still running…").await;
                }
            })
        });
        let outcome = capture_link_screenshot(&url, link_id).await;
        if let Some(handle) = heartbeat {
            handle.abort();
        }
        if let Some(log) = logger {
            let ms = capture_started.elapsed().as_millis();
            log.log_critical(&format!(
                "Chromium capture finished in {ms}ms (success={})",
                outcome.screenshot_url.is_some()
            ))
            .await;
            if let Some(ref reason) = outcome.failure {
                log.log_critical(&format!("Screenshot capture failed: {reason}"))
                    .await;
            }
        }
        outcome
    } else {
        if let Some(log) = logger {
            log.log("robots.txt disallows screenshot capture — skipping capture");
        }
        info!(
            event = "link_screenshot.skipped_robots",
            job_id = %job_id,
            link_id = %link_id,
            "robots.txt disallows screenshot capture"
        );
        ScreenshotCaptureOutcome {
            screenshot_url: None,
            failure: None,
        }
    };
    let captured = capture_outcome.screenshot_url.clone();
    let captured_ok = captured.is_some();

    if robots.allowed && !captured_ok {
        let msg = capture_outcome
            .failure
            .unwrap_or_else(|| "Screenshot capture failed".into());
        mark_background_job_failed(pool, job_id, &msg, logger).await;
        return;
    }

    let merged = merge_screenshot_into_metadata(existing_meta, captured, &robots);

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
        r#"UPDATE links SET metadata = $1, updated_at = NOW() WHERE id = $2"#,
    )
    .bind(sqlx::types::Json(merged))
    .bind(link_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        mark_background_job_failed(
            pool,
            job_id,
            &format!("Failed to save screenshot metadata: {e}"),
            logger,
        )
        .await;
        return;
    }

    if let Err(e) = sqlx::query(
        r#"UPDATE background_jobs SET status = 'completed', completed_at = NOW(), updated_at = NOW(), error_message = NULL WHERE id = $1 AND status = 'processing'"#,
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
            &format!("Failed to commit screenshot update: {e}"),
            logger,
        )
        .await;
        return;
    }

    if let Some(log) = logger {
        log.log_critical(&format!(
            "Screenshot job finished (captured={captured_ok}, robots_allowed={})",
            robots.allowed
        ))
        .await;
    }

    info!(
        event = "link_screenshot.job_ok",
        job_id = %job_id,
        link_id = %link_id,
        robots_allowed = robots.allowed,
        captured = captured_ok,
        "Link screenshot job finished"
    );
}
