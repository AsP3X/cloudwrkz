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
const DEFAULT_TIMEOUT_SECS: u64 = 60;

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
        .clamp(10, 300);
    Duration::from_secs(secs)
}

/// Wall-clock cap for the screenshot background job wrapper (Chromium timeout plus cleanup slack).
// Human: Screenshot jobs should fail before the generic 10-minute job wall timeout so stuck rows recover faster.
// Agent: RETURNS screenshot_timeout + 90s; READ by run_one_job_supervised for link_website_screenshot.

pub fn screenshot_job_wall_timeout() -> Duration {
    screenshot_timeout() + Duration::from_secs(90)
}

fn screenshot_virtual_time_budget_ms() -> u64 {
    std::env::var("LINK_SCREENSHOT_VIRTUAL_TIME_BUDGET_MS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(15_000)
        .clamp(1_000, 120_000)
}

/// Result of one headless Chromium capture attempt (path plus a short admin-safe failure reason).
// Human: Callers and job logs need to know why capture returned no PNG, not only that it failed.
// Agent: screenshot_url Some on success; failure Some when None path; stderr truncated for job log display.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScreenshotCaptureOutcome {
    pub screenshot_url: Option<String>,
    pub failure: Option<String>,
}

impl ScreenshotCaptureOutcome {
    fn ok(path: String) -> Self {
        Self {
            screenshot_url: Some(path),
            failure: None,
        }
    }

    fn fail(reason: impl Into<String>) -> Self {
        Self {
            screenshot_url: None,
            failure: Some(reason.into()),
        }
    }
}

fn truncate_for_job_log(text: &str, max_chars: usize) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.len() <= max_chars {
        return trimmed.to_string();
    }
    format!("{}…", &trimmed[..max_chars])
}

fn summarize_chromium_stderr(stderr: &str) -> String {
    let lines: Vec<&str> = stderr
        .lines()
        .map(str::trim)
        .filter(|line| {
            !line.is_empty()
                && !line.contains("Failed to connect to the bus")
                && !line.contains("org.freedesktop.DBus")
                && !line.contains("object_proxy.cc")
        })
        .collect();
    let joined = lines.join(" | ");
    truncate_for_job_log(&joined, 400)
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
// Agent: REQUIRES url_safe_for_outbound_fetch; SPAWNS chromium; WRITES screenshots_dir; RETURNS ScreenshotCaptureOutcome.

pub async fn capture_link_screenshot(page_url: &str, link_id: &str) -> ScreenshotCaptureOutcome {
    if !url_safe_for_outbound_fetch(page_url) {
        return ScreenshotCaptureOutcome::fail("URL blocked by outbound fetch safety rules");
    }
    let Some(link_id) = safe_link_id(link_id) else {
        return ScreenshotCaptureOutcome::fail("Invalid link id for screenshot file name");
    };
    let Some(chromium) = chromium_executable() else {
        return ScreenshotCaptureOutcome::fail(
            "Chromium not available (set LINK_SCREENSHOT_CHROMIUM_PATH or install Chromium)",
        );
    };
    let filename = format!("screenshot-{link_id}.png");
    let disk_path = screenshots_dir().join(&filename);

    if let Err(e) = tokio::fs::create_dir_all(screenshots_dir()).await {
        warn!(
            event = "link_screenshot.mkdir_failed",
            error = %e,
            "could not create screenshot upload directory"
        );
        return ScreenshotCaptureOutcome::fail(format!("Could not create screenshot directory: {e}"));
    }

    let (width, height) = screenshot_dimensions();
    let window_size = format!("{width},{height}");
    let timeout = screenshot_timeout();
    let virtual_time_budget = screenshot_virtual_time_budget_ms();

    let screenshot_flag = format!("--screenshot={}", disk_path.display());
    let virtual_time_flag = format!("--virtual-time-budget={virtual_time_budget}");

    let mut cmd = Command::new(&chromium);
    // Human: When our outer timeout fires, drop must kill Chromium so a hung capture cannot hold a worker slot for minutes.
    // Agent: kill_on_drop true; timeout on cmd.output; ORPHAN subprocess prevented on Duration expiry.
    cmd.kill_on_drop(true);
    // Human: Headless containers often lack D-Bus; pointing at /dev/null avoids noisy failures on startup.
    // Agent: ENV DBUS_SESSION_BUS_ADDRESS=/dev/null; REDUCES dbus connection errors in Docker.
    cmd.env("DBUS_SESSION_BUS_ADDRESS", "/dev/null");
    // Human: `--screenshot` and path must be one flag (`--screenshot=/path`); separate args make Chromium treat the path as a second URL target.
    // Agent: SINGLE --screenshot=path arg; ONE page_url positional; AVOIDS "Multiple targets are not supported in headless mode".
    cmd.arg("--headless=new")
        .arg("--disable-gpu")
        .arg("--no-sandbox")
        .arg("--disable-setuid-sandbox")
        .arg("--disable-dev-shm-usage")
        .arg("--no-zygote")
        .arg("--hide-scrollbars")
        .arg("--window-size")
        .arg(&window_size)
        .arg("--run-all-compositor-stages-before-draw")
        .arg(&virtual_time_flag)
        .arg(&screenshot_flag)
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
            return ScreenshotCaptureOutcome::fail(format!("Chromium failed to start: {e}"));
        }
        Err(_) => {
            warn!(
                event = "link_screenshot.timeout",
                link_id = %link_id,
                "chromium screenshot timed out"
            );
            let _ = tokio::fs::remove_file(&disk_path).await;
            return ScreenshotCaptureOutcome::fail(format!(
                "Chromium timed out after {}s",
                timeout.as_secs()
            ));
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = summarize_chromium_stderr(&stderr);
        warn!(
            event = "link_screenshot.failed",
            link_id = %link_id,
            exit = ?output.status.code(),
            stderr = %stderr,
            "chromium screenshot exited with error"
        );
        let _ = tokio::fs::remove_file(&disk_path).await;
        let exit = output
            .status
            .code()
            .map(|c| c.to_string())
            .unwrap_or_else(|| "signal".into());
        let reason = if detail.is_empty() {
            format!("Chromium exited with code {exit}")
        } else {
            format!("Chromium exited with code {exit}: {detail}")
        };
        return ScreenshotCaptureOutcome::fail(reason);
    }

    if tokio::fs::metadata(&disk_path).await.is_err() {
        warn!(
            event = "link_screenshot.missing_file",
            link_id = %link_id,
            "chromium did not write screenshot file"
        );
        return ScreenshotCaptureOutcome::fail(
            "Chromium finished but did not write a screenshot file (page may need more load time)",
        );
    }

    ScreenshotCaptureOutcome::ok(format!("/screenshots/{filename}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summarize_chromium_stderr_skips_dbus_noise() {
        let raw = "Failed to connect to the bus\n[ERROR: something real happened]\n";
        let s = summarize_chromium_stderr(raw);
        assert!(s.contains("something real"));
        assert!(!s.contains("Failed to connect to the bus"));
    }

    #[test]
    fn safe_link_id_rejects_bad_chars() {
        assert!(safe_link_id("clxyz123").is_some());
        assert!(safe_link_id("../etc").is_none());
        assert!(safe_link_id("").is_none());
    }
}
