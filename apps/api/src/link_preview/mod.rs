//! Shared HTML metadata extraction for links (used by HTTP routes and background jobs).

mod robots;
mod scrape;
mod screenshot;
mod url_safety;

pub use scrape::{merge_scrape_metadata, scrape_link_page};

use reqwest::Client;

use crate::error::AppError;
use crate::models::link::ExtractMetadataResponse;

// Human: Synchronous preview endpoint still returns the compact three-field shape while optionally echoing robots.txt status.
// Agent: CALLS scrape_link_page; MAPS title description favicon; SETS robots_allowed robots_message on response; HTTP 400 when robots block.

pub async fn extract_metadata_from_url(
    client: &Client,
    url_str: &str,
) -> Result<ExtractMetadataResponse, AppError> {
    let result = scrape_link_page(client, url_str, None).await;
    if !result.robots_allowed {
        return Err(AppError::bad_request(
            result
                .robots_message
                .unwrap_or_else(|| "robots.txt disallows fetching this URL".into()),
        ));
    }
    let meta = result.metadata.unwrap_or_default();
    let metadata_json = serde_json::to_value(&meta).unwrap_or(serde_json::json!({}));
    Ok(ExtractMetadataResponse {
        title: meta.title,
        description: meta.description,
        favicon: meta.favicon,
        robots_allowed: Some(true),
        robots_message: result.robots_message,
        metadata: Some(metadata_json),
    })
}

// Human: Deduping stored links ignores scheme and `www` so the same destination does not create multiple rows.
// Agent: to_lowercase; STRIPS https/http/www; TRIMS trailing slash; PURE string no network.

pub fn normalize_url(url: &str) -> String {
    let mut s = url.to_lowercase();
    s = s
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_start_matches("www.")
        .trim_end_matches('/')
        .to_string();
    s
}
