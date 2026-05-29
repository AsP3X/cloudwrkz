//! HTML metadata scraping for bookmark URLs (Open Graph, Twitter cards, and classic tags).

// Human: After robots.txt allows fetching, we download HTML once and pull every common preview field the link detail UI can show.
// Agent: HTTP GET page; PARSE scraper::Html; EXTRACT meta/link tags; MERGE into camelCase JSON; PRESERVE github* keys on merge.

use reqwest::Client;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use url::Url;

use super::robots::{SCRAPE_USER_AGENT, RobotsCheckResult, check_robots_allowed};
use super::url_safety::url_safe_for_outbound_fetch;

/// Rich scrape payload stored on `links.metadata` and returned from preview endpoints.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkScrapedMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub favicon: Option<String>,
    pub image: Option<String>,
    pub og_title: Option<String>,
    pub og_description: Option<String>,
    pub og_image: Option<String>,
    pub og_type: Option<String>,
    pub og_url: Option<String>,
    pub og_site_name: Option<String>,
    pub twitter_title: Option<String>,
    pub twitter_description: Option<String>,
    pub twitter_image: Option<String>,
    pub twitter_card: Option<String>,
    pub author: Option<String>,
    pub keywords: Option<String>,
    pub canonical_url: Option<String>,
    pub theme_color: Option<String>,
    pub language: Option<String>,
    pub robots_txt_allowed: Option<bool>,
    pub robots_txt_message: Option<String>,
    pub screenshot_url: Option<String>,
}

/// Full scrape attempt including robots.txt gate.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkScrapeResult {
    pub robots_allowed: bool,
    pub robots_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<LinkScrapedMetadata>,
}

impl LinkScrapeResult {
    // Human: Callers that only need the JSON blob for `links.metadata` use this helper.
    // Agent: MERGES metadata fields + robotsTxt* into one Map; OMITS null keys.

    pub fn to_metadata_json(&self) -> Value {
        let mut map = Map::new();
        if let Some(ref meta) = self.metadata {
            if let Ok(Value::Object(obj)) = serde_json::to_value(meta) {
                for (k, v) in obj {
                    if !v.is_null() {
                        map.insert(k, v);
                    }
                }
            }
        }
        map.insert(
            "robotsTxtAllowed".into(),
            json!(self.robots_allowed),
        );
        if let Some(ref msg) = self.robots_message {
            map.insert("robotsTxtMessage".into(), json!(msg));
        }
        Value::Object(map)
    }
}

// Human: Entry point for jobs and link create — checks robots, then optionally fetches and parses the page.
// Agent: AWAITS check_robots_allowed; IF allowed THEN GET html AND parse_document; ELSE metadata None with robots flags only.

pub async fn scrape_link_page(client: &Client, url_str: &str) -> LinkScrapeResult {
    if !url_safe_for_outbound_fetch(url_str) {
        return LinkScrapeResult {
            robots_allowed: false,
            robots_message: Some("URL is not allowed for automated fetching".into()),
            metadata: Some(LinkScrapedMetadata {
                robots_txt_allowed: Some(false),
                robots_txt_message: Some("URL is not allowed for automated fetching".into()),
                ..Default::default()
            }),
        };
    }

    let robots = check_robots_allowed(client, url_str).await;
    if !robots.allowed {
        return LinkScrapeResult {
            robots_allowed: false,
            robots_message: robots.message.clone(),
            metadata: Some(LinkScrapedMetadata {
                robots_txt_allowed: Some(false),
                robots_txt_message: robots.message,
                ..Default::default()
            }),
        };
    }

    let html_result = fetch_and_parse_html(client, url_str).await;
    let html_parse_failed = html_result.is_err();
    let meta = match html_result {
        Ok(mut parsed) => {
            parsed.robots_txt_allowed = Some(true);
            parsed.robots_txt_message = None;
            parsed
        }
        Err(_) => LinkScrapedMetadata {
            robots_txt_allowed: Some(true),
            robots_txt_message: None,
            ..Default::default()
        },
    };

    let robots_message = if html_parse_failed
        && meta.title.is_none()
        && meta.description.is_none()
        && meta.og_title.is_none()
    {
        Some(
            "Could not download or parse this page. Only robots.txt status was recorded."
                .into(),
        )
    } else {
        None
    };

    LinkScrapeResult {
        robots_allowed: true,
        robots_message,
        metadata: Some(meta),
    }
}

// Human: GitHub enrichment lives in separate keys; website scrape must not wipe `github*` entries when refreshing.
// Agent: READS existing Object; INSERTS new keys; SKIP overwrite when key starts with github (case-sensitive).

pub fn merge_scrape_metadata(existing: Option<Value>, scrape: &LinkScrapeResult) -> Value {
    let mut base = match existing {
        Some(Value::Object(map)) => map,
        _ => Map::new(),
    };
    let incoming = scrape.to_metadata_json();
    if let Value::Object(obj) = incoming {
        for (k, v) in obj {
            if k.starts_with("github") {
                continue;
            }
            if !v.is_null() {
                base.insert(k, v);
            }
        }
    }
    Value::Object(base)
}

// Human: Screenshot jobs patch only `screenshotUrl` and robots fields so HTML metadata from another job stays intact.
// Agent: READS existing metadata Object; INSERTS screenshotUrl robotsTxt*; NEVER overwrites github* keys.

pub fn merge_screenshot_into_metadata(
    existing: Option<Value>,
    screenshot_url: Option<String>,
    robots: &RobotsCheckResult,
) -> Value {
    let mut base = match existing {
        Some(Value::Object(map)) => map,
        _ => Map::new(),
    };
    base.insert("robotsTxtAllowed".into(), json!(robots.allowed));
    if let Some(ref msg) = robots.message {
        base.insert("robotsTxtMessage".into(), json!(msg));
    } else if robots.allowed {
        base.remove("robotsTxtMessage");
    }
    if let Some(url) = screenshot_url {
        base.insert("screenshotUrl".into(), json!(url));
    }
    Value::Object(base)
}

async fn fetch_and_parse_html(client: &Client, url_str: &str) -> Result<LinkScrapedMetadata, ()> {
    if !url_safe_for_outbound_fetch(url_str) {
        return Err(());
    }
    let resp = client
        .get(url_str)
        .header("User-Agent", SCRAPE_USER_AGENT)
        .send()
        .await
        .map_err(|_| ())?;

    if !resp.status().is_success() {
        return Err(());
    }

    let html = resp.text().await.map_err(|_| ())?;
    Ok(parse_html_metadata(&html, url_str))
}

fn parse_html_metadata(html: &str, base_url: &str) -> LinkScrapedMetadata {
    let doc = Html::parse_document(html);

    let og_title = extract_meta(&doc, "og:title");
    let og_description = extract_meta(&doc, "og:description");
    let og_image = extract_meta(&doc, "og:image");
    let og_type = extract_meta(&doc, "og:type");
    let og_url = extract_meta(&doc, "og:url");
    let og_site_name = extract_meta(&doc, "og:site_name");

    let twitter_title = extract_meta(&doc, "twitter:title");
    let twitter_description = extract_meta(&doc, "twitter:description");
    let twitter_image = extract_meta(&doc, "twitter:image");
    let twitter_card = extract_meta(&doc, "twitter:card");

    let title = og_title
        .clone()
        .or_else(|| extract_tag_text(&doc, "title"));
    let description = og_description
        .clone()
        .or_else(|| extract_meta(&doc, "description"));
    let favicon = extract_favicon(&doc, base_url);
    let image = og_image
        .clone()
        .or(twitter_image.clone())
        .or_else(|| extract_meta(&doc, "image"));
    let author = extract_meta(&doc, "author").or_else(|| extract_meta(&doc, "article:author"));
    let keywords = extract_meta(&doc, "keywords");
    let canonical_url = extract_link_rel(&doc, "canonical", base_url);
    let theme_color = extract_meta(&doc, "theme-color");
    let language = extract_html_lang(&doc);

    LinkScrapedMetadata {
        title,
        description,
        favicon,
        image,
        og_title,
        og_description,
        og_image,
        og_type,
        og_url,
        og_site_name,
        twitter_title,
        twitter_description,
        twitter_image,
        twitter_card,
        author,
        keywords,
        canonical_url,
        theme_color,
        language,
        robots_txt_allowed: None,
        robots_txt_message: None,
        screenshot_url: None,
    }
}

fn extract_meta(doc: &Html, name: &str) -> Option<String> {
    let sel_str = format!(r#"meta[property="{name}"], meta[name="{name}"]"#);
    let selector = Selector::parse(&sel_str).ok()?;
    doc.select(&selector)
        .next()
        .and_then(|el| el.value().attr("content"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn extract_tag_text(doc: &Html, tag: &str) -> Option<String> {
    let selector = Selector::parse(tag).ok()?;
    let text = doc
        .select(&selector)
        .next()
        .map(|el| el.text().collect::<String>())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())?;
    Some(text)
}

fn extract_html_lang(doc: &Html) -> Option<String> {
    let selector = Selector::parse("html").ok()?;
    doc.select(&selector)
        .next()
        .and_then(|el| el.value().attr("lang"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn extract_link_rel(doc: &Html, rel: &str, base_url: &str) -> Option<String> {
    let sel = format!(r#"link[rel="{rel}"]"#);
    let selector = Selector::parse(&sel).ok()?;
    let href = doc
        .select(&selector)
        .next()
        .and_then(|el| el.value().attr("href"))?;
    resolve_url(base_url, href)
}

fn extract_favicon(doc: &Html, base_url: &str) -> Option<String> {
    let selector =
        Selector::parse(r#"link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]"#)
            .ok()?;
    if let Some(el) = doc.select(&selector).next() {
        if let Some(href) = el.value().attr("href") {
            if let Some(resolved) = resolve_url(base_url, href) {
                return Some(resolved);
            }
        }
    }
    Url::parse(base_url)
        .ok()
        .and_then(|u| u.join("/favicon.ico").ok())
        .map(|u| u.to_string())
}

fn resolve_url(base_url: &str, href: &str) -> Option<String> {
    if href.starts_with("http://") || href.starts_with("https://") {
        return Some(href.to_string());
    }
    Url::parse(base_url)
        .ok()
        .and_then(|base| base.join(href).ok())
        .map(|u| u.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sample_og_tags() {
        let html = r#"<!doctype html>
<html lang="en">
<head>
  <title>Page Title</title>
  <meta property="og:title" content="OG Title" />
  <meta property="og:description" content="OG Desc" />
  <meta property="og:image" content="https://example.com/img.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href="https://example.com/page" />
</head>
<body></body>
</html>"#;
        let meta = parse_html_metadata(html, "https://example.com/page");
        assert_eq!(meta.og_title.as_deref(), Some("OG Title"));
        assert_eq!(meta.title.as_deref(), Some("OG Title"));
        assert_eq!(meta.og_description.as_deref(), Some("OG Desc"));
        assert_eq!(meta.twitter_card.as_deref(), Some("summary_large_image"));
        assert_eq!(meta.canonical_url.as_deref(), Some("https://example.com/page"));
        assert_eq!(meta.language.as_deref(), Some("en"));
    }

    #[test]
    fn merge_preserves_github_keys() {
        let existing = json!({
            "githubStars": 42,
            "title": "old"
        });
        let scrape = LinkScrapeResult {
            robots_allowed: true,
            robots_message: None,
            metadata: Some(LinkScrapedMetadata {
                title: Some("new".into()),
                screenshot_url: Some("/screenshots/screenshot-x.png".into()),
                ..Default::default()
            }),
        };
        let merged = merge_scrape_metadata(Some(existing), &scrape);
        let obj = merged.as_object().unwrap();
        assert_eq!(obj.get("githubStars").and_then(|v| v.as_i64()), Some(42));
        assert_eq!(obj.get("title").and_then(|v| v.as_str()), Some("new"));
    }
}
