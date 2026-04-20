//! Shared HTML metadata extraction for links (used by HTTP routes and background jobs).

use reqwest::Client;

use crate::error::AppError;
use crate::models::link::ExtractMetadataResponse;

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

fn extract_meta(doc: &scraper::Html, name: &str) -> Option<String> {
    let sel_str = format!(r#"meta[property="{name}"], meta[name="{name}"]"#);
    let selector = scraper::Selector::parse(&sel_str).ok()?;
    doc.select(&selector)
        .next()
        .and_then(|el| el.value().attr("content"))
        .map(|s| s.to_string())
}

fn extract_tag_text(doc: &scraper::Html, tag: &str) -> Option<String> {
    let selector = scraper::Selector::parse(tag).ok()?;
    doc.select(&selector)
        .next()
        .map(|el| el.text().collect::<String>())
}

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
