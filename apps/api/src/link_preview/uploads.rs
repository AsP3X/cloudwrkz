//! On-disk paths for link preview assets (favicons, screenshots) under `CLOUDWRKZ_UPLOAD_ROOT`.

// Human: Docker mounts a volume at `/app/public/uploads`; local dev uses the same relative path from the API working directory.
// Agent: READS CLOUDWRKZ_UPLOAD_ROOT env; DEFAULT public/uploads; PROVIDES favicons_dir screenshots_dir ensure_upload_directories.

use std::path::PathBuf;

use tracing::warn;

// Human: One env var keeps favicon and screenshot storage aligned across routes and the scraper.
// Agent: RETURNS absolute or relative PathBuf; TRIMS empty env to default public/uploads.

pub fn upload_root() -> PathBuf {
    std::env::var("CLOUDWRKZ_UPLOAD_ROOT")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("public/uploads"))
}

pub fn favicons_dir() -> PathBuf {
    upload_root().join("favicons")
}

pub fn screenshots_dir() -> PathBuf {
    upload_root().join("link-screenshots")
}

// Human: API startup creates upload folders so the first screenshot job does not fail on a missing path in fresh containers.
// Agent: tokio::fs::create_dir_all favicons + link-screenshots; LOGS warn on failure.

pub async fn ensure_upload_directories() {
    for dir in [favicons_dir(), screenshots_dir()] {
        if let Err(e) = tokio::fs::create_dir_all(&dir).await {
            warn!(
                event = "uploads.mkdir_failed",
                path = %dir.display(),
                error = %e,
                "could not create upload directory"
            );
        }
    }
}
