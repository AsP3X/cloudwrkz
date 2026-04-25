//! Shared HTML metadata extraction for links (used by HTTP routes and background jobs).

// Human: Fetches remote HTML once and scrapes common meta tags so link cards match what browsers show without running JavaScript.
// Agent: HTTP GET url_str; PARSES scraper::Html; READS og:title og:description link rel icon; RETURNS ExtractMetadataResponse or AppError.

use reqwest::Client;

use crate::error::AppError;
use crate::models::link::ExtractMetadataResponse;

// Human: Network and parse failures surface as `400` so callers can tell the URL was unusable rather than an internal server bug.
// Agent: HTTP User-Agent CloudWrkz/1.0; MAPS reqwest Err to bad_request; scraper SELECTOR parse failures yield None fields.

pub async fn extract_metadata_from_url(
    client: &Client,
    url_str: &str,
) -> Result<ExtractMetadataResponse, AppError> {
    let resp = client
        .get(url_str)
        .header("User-Agent", "CloudWrkz/1.0 Link Preview")
        .send()
        .await
        .map_err(|_| AppError::bad_request("Failed to fetch URL"))?;

    let html = resp
        .text()
        .await
        .map_err(|_| AppError::bad_request("Failed to read response"))?;

    let doc = scraper::Html::parse_document(&html);

    let title = extract_meta(&doc, "og:title").or_else(|| extract_tag_text(&doc, "title"));
    let description =
        extract_meta(&doc, "og:description").or_else(|| extract_meta(&doc, "description"));
    let favicon = extract_favicon(&doc, url_str);

    Ok(ExtractMetadataResponse {
        title,
        description,
        favicon,
    })
}

// Human: Open Graph and classic `<meta name>` share one selector string so either convention fills the same slot.
// Agent: BUILDS dynamic selector meta[property|name]; READS first match content attr.

fn extract_meta(doc: &scraper::Html, name: &str) -> Option<String> {
    let sel_str = format!(r#"meta[property="{name}"], meta[name="{name}"]"#);
    let selector = scraper::Selector::parse(&sel_str).ok()?;
    doc.select(&selector)
        .next()
        .and_then(|el| el.value().attr("content"))
        .map(|s| s.to_string())
}

// Human: Plain element text is a fallback when social tags are missing, which is common on older sites.
// Agent: SELECTOR parse tag literal; COLLECTS el.text() joined.

fn extract_tag_text(doc: &scraper::Html, tag: &str) -> Option<String> {
    let selector = scraper::Selector::parse(tag).ok()?;
    doc.select(&selector)
        .next()
        .map(|el| el.text().collect::<String>())
}

// Human: Relative icon hrefs are resolved against the page URL, and we still try `/favicon.ico` when no link tag exists.
// Agent: READS link[rel=icon|shortcut icon] href; url::Url join absolute or relative; FALLBACK join /favicon.ico.

fn extract_favicon(doc: &scraper::Html, base_url: &str) -> Option<String> {
    let selector =
        scraper::Selector::parse(r#"link[rel="icon"], link[rel="shortcut icon"]"#).ok()?;
    if let Some(el) = doc.select(&selector).next() {
        if let Some(href) = el.value().attr("href") {
            if href.starts_with("http") {
                return Some(href.to_string());
            }
            if let Ok(base) = url::Url::parse(base_url) {
                return base.join(href).ok().map(|u| u.to_string());
            }
        }
    }
    url::Url::parse(base_url)
        .ok()
        .and_then(|u| u.join("/favicon.ico").ok())
        .map(|u| u.to_string())
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
