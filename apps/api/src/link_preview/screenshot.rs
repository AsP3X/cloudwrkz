//! Headless Chromium screenshots for link detail previews.

// Human: When robots.txt allows fetching, we capture a PNG of the page with headless Chromium and serve it from `/api/v1/screenshots/`.
// Agent: SPAWNS chromium --headless --screenshot; WRITES screenshots_dir/screenshot-{linkId}.png; RETURNS /screenshots/... path for v1 base URL.

use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use tokio::process::Command;
use tracing::{debug, info, warn};

use super::uploads::screenshots_dir;
use super::url_safety::url_safe_for_outbound_fetch;

const DEFAULT_WIDTH: u32 = 1280;
const DEFAULT_HEIGHT: u32 = 720;
const DEFAULT_TIMEOUT_SECS: u64 = 45;

// Human: Screenshot capture is optional when disabled by env; Docker images ship Chromium and enable it by default.
// Agent: READS LINK_SCREENSHOT_ENABLED LINK_SCREENSHOT_CHROMIUM_PATH; CACHED OnceLock Option<PathBuf>.

fn screenshot_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| {
        !matches!(
            std::env::var("LINK_SCREENSHOT_ENABLED").ok().as_deref(),
            Some("0") | Some("false") | Some("no")
        )
    })
}

pub fn chromium_executable() -> Option<PathBuf> {
    static PATH: OnceLock<Option<PathBuf>> = OnceLock::new();
    PATH.get_or_init(|| {
        if !screenshot_enabled() {
            return None;
        }
        if let Ok(custom) = std::env::var("LINK_SCREENSHOT_CHROMIUM_PATH") {
            let trimmed = custom.trim();
            if !trimmed.is_empty() {
                let p = PathBuf::from(trimmed);
                if p.is_file() {
                    return Some(p);
                }
            }
        }
        for candidate in [
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/google-chrome-stable",
        ] {
            let p = PathBuf::from(candidate);
            if p.is_file() {
                return Some(p);
            }
        }
        None
    })
    .clone()
}

// Human: Operators see at startup whether link screenshots will work (critical for Docker deploys).
// Agent: INFO link_screenshot.ready with path OR WARN chromium_missing OR INFO disabled.

pub fn log_screenshot_capability() {
    if !screenshot_enabled() {
        info!(
            event = "link_screenshot.disabled",
            "Link screenshot capture disabled (LINK_SCREENSHOT_ENABLED)"
        );
        return;
    }
    match chromium_executable() {
        Some(path) => info!(
            event = "link_screenshot.ready",
            chromium = %path.display(),
            dir = %screenshots_dir().display(),
            "Link screenshot capture enabled"
        ),
        None => warn!(
            event = "link_screenshot.chromium_missing",
            "Link screenshot capture enabled but Chromium was not found; install Chromium or set LINK_SCREENSHOT_CHROMIUM_PATH"
        ),
    }
}

fn screenshot_dimensions() -> (u32, u32) {
    let width = std::env::var("LINK_SCREENSHOT_WIDTH")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_WIDTH)
        .clamp(320, 1920);
    let height = std::env::var("LINK_SCREENSHOT_HEIGHT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_HEIGHT)
        .clamp(240, 1080);
    (width, height)
}

fn screenshot_timeout() -> Duration {
    let secs = std::env::var("LINK_SCREENSHOT_TIMEOUT_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_TIMEOUT_SECS)
        .clamp(10, 120);
    Duration::from_secs(secs)
}

fn safe_link_id(link_id: &str) -> Option<String> {
    let trimmed = link_id.trim();
    if trimmed.is_empty() || trimmed.len() > 64 {
        return None;
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return None;
    }
    Some(trimmed.to_string())
}

// Human: Produces a stable API path for the link's prerender PNG, overwriting any previous capture for the same id.
// Agent: REQUIRES url_safe_for_outbound_fetch; SPAWNS chromium; WRITES screenshots_dir; RETURNS /screenshots/... or None.

pub async fn capture_link_screenshot(page_url: &str, link_id: &str) -> Option<String> {
    if !url_safe_for_outbound_fetch(page_url) {
        return None;
    }
    let link_id = safe_link_id(link_id)?;
    let chromium = chromium_executable()?;
    let filename = format!("screenshot-{link_id}.png");
    let disk_path = screenshots_dir().join(&filename);

    if let Err(e) = tokio::fs::create_dir_all(screenshots_dir()).await {
        warn!(
            event = "link_screenshot.mkdir_failed",
            error = %e,
            "could not create screenshot upload directory"
        );
        return None;
    }

    let (width, height) = screenshot_dimensions();
    let window_size = format!("{width},{height}");
    let timeout = screenshot_timeout();

    let mut cmd = Command::new(&chromium);
    cmd.arg("--headless=new")
        .arg("--disable-gpu")
        .arg("--no-sandbox")
        .arg("--disable-dev-shm-usage")
        .arg("--hide-scrollbars")
        .arg("--window-size")
        .arg(&window_size)
        .arg("--screenshot")
        .arg(&disk_path)
        .arg("--virtual-time-budget=8000")
        .arg(page_url);

    debug!(
        event = "link_screenshot.start",
        link_id = %link_id,
        url = %page_url,
        "starting headless chromium screenshot"
    );

    let run = tokio::time::timeout(timeout, cmd.output());
    let output = match run.await {
        Ok(Ok(out)) => out,
        Ok(Err(e)) => {
            warn!(
                event = "link_screenshot.spawn_failed",
                link_id = %link_id,
                error = %e,
                "chromium screenshot process failed to start"
            );
            return None;
        }
        Err(_) => {
            warn!(
                event = "link_screenshot.timeout",
                link_id = %link_id,
                "chromium screenshot timed out"
            );
            let _ = tokio::fs::remove_file(&disk_path).await;
            return None;
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        warn!(
            event = "link_screenshot.failed",
            link_id = %link_id,
            exit = ?output.status.code(),
            stderr = %stderr,
            "chromium screenshot exited with error"
        );
        let _ = tokio::fs::remove_file(&disk_path).await;
        return None;
    }

    if tokio::fs::metadata(&disk_path).await.is_err() {
        warn!(
            event = "link_screenshot.missing_file",
            link_id = %link_id,
            "chromium did not write screenshot file"
        );
        return None;
    }

    Some(format!("/screenshots/{filename}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_link_id_rejects_bad_chars() {
        assert!(safe_link_id("clxyz123").is_some());
        assert!(safe_link_id("../etc").is_none());
        assert!(safe_link_id("").is_none());
    }
}
