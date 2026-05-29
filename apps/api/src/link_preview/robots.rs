//! Minimal robots.txt evaluation for link page scraping.

// Human: Before we fetch a bookmark URL we load robots.txt and refuse to scrape when the site disallows our crawler user-agent.
// Agent: HTTP GET origin/robots.txt; PARSES User-agent groups; MATCHES Disallow/Allow longest-prefix against URL path; DEFAULT allow on 404/missing file.

use reqwest::Client;
use url::Url;

pub const SCRAPE_USER_AGENT: &str = "CloudWrkz/1.0 Link Preview";

/// Outcome of a robots.txt check for one target URL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RobotsCheckResult {
    pub allowed: bool,
    pub message: Option<String>,
}

// Human: Sites without robots.txt are treated as allowing crawlers, which matches common crawler behavior.
// Agent: BUILD robots URL from page origin; GET; STATUS 404 => allowed; PARSE body on 200; ELSE allow (network/5xx).

pub async fn check_robots_allowed(client: &Client, page_url: &str) -> RobotsCheckResult {
    let Ok(mut parsed) = Url::parse(page_url) else {
        return RobotsCheckResult {
            allowed: false,
            message: Some("Invalid URL".into()),
        };
    };
    parsed.set_path("/robots.txt");
    parsed.set_query(None);
    parsed.set_fragment(None);
    let robots_url = parsed.to_string();
    let path = Url::parse(page_url)
        .map(|u| u.path().to_string())
        .unwrap_or_else(|_| "/".into());

    let resp = match client
        .get(&robots_url)
        .header("User-Agent", SCRAPE_USER_AGENT)
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => {
            return RobotsCheckResult {
                allowed: true,
                message: None,
            };
        }
    };

    if resp.status().as_u16() == 404 {
        return RobotsCheckResult {
            allowed: true,
            message: None,
        };
    }

    if !resp.status().is_success() {
        return RobotsCheckResult {
            allowed: true,
            message: None,
        };
    }

    let body = match resp.text().await {
        Ok(t) => t,
        Err(_) => {
            return RobotsCheckResult {
                allowed: true,
                message: None,
            };
        }
    };

    let allowed = is_path_allowed_for_agent(&body, SCRAPE_USER_AGENT, &path);
    if allowed {
        RobotsCheckResult {
            allowed: true,
            message: None,
        }
    } else {
        RobotsCheckResult {
            allowed: false,
            message: Some(
                "This site's robots.txt disallows automated fetching for CloudWrkz. Preview data may be incomplete."
                    .into(),
            ),
        }
    }
}

// Human: We pick the most specific User-agent group for our bot (or `*`) and apply longest matching Allow/Disallow to the path.
// Agent: PARSE groups; SELECT best agent match; LONGEST prefix rule wins; empty Disallow => allow all.

fn is_path_allowed_for_agent(robots_body: &str, user_agent: &str, path: &str) -> bool {
    let groups = parse_robots_groups(robots_body);
    let rules = select_rules_for_agent(&groups, user_agent);
    if rules.is_empty() {
        return true;
    }
    let path = if path.is_empty() { "/" } else { path };
    let mut best: Option<(bool, usize)> = None;
    for (is_allow, rule_path) in rules {
        if rule_path.is_empty() {
            if !is_allow {
                return true;
            }
            continue;
        }
        if path_matches_rule(path, &rule_path) {
            let len = rule_path.len();
            if best.map(|(_, l)| len > l).unwrap_or(true) {
                best = Some((is_allow, len));
            }
        }
    }
    best.map(|(allow, _)| allow).unwrap_or(true)
}

fn path_matches_rule(path: &str, rule: &str) -> bool {
    if rule == "/" {
        return true;
    }
    if path.starts_with(rule) {
        return true;
    }
    let trimmed = rule.trim_end_matches('/');
    !trimmed.is_empty() && path.starts_with(trimmed)
}

struct RobotsGroup {
    agents: Vec<String>,
    rules: Vec<(bool, String)>,
}

fn parse_robots_groups(body: &str) -> Vec<RobotsGroup> {
    let mut groups: Vec<RobotsGroup> = Vec::new();
    let mut current: Option<RobotsGroup> = None;

    for raw in body.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim().to_lowercase();
        let value = value.trim().to_string();

        match key.as_str() {
            "user-agent" => {
                if let Some(group) = current.take() {
                    if !group.agents.is_empty() {
                        groups.push(group);
                    }
                }
                current = Some(RobotsGroup {
                    agents: vec![value.to_lowercase()],
                    rules: Vec::new(),
                });
            }
            "disallow" => {
                if let Some(ref mut group) = current {
                    group.rules.push((false, value));
                }
            }
            "allow" => {
                if let Some(ref mut group) = current {
                    group.rules.push((true, value));
                }
            }
            _ => {}
        }
    }
    if let Some(group) = current {
        if !group.agents.is_empty() {
            groups.push(group);
        }
    }
    groups
}

fn select_rules_for_agent(groups: &[RobotsGroup], user_agent: &str) -> Vec<(bool, String)> {
    let ua = user_agent.to_lowercase();
    let mut best_specificity = 0usize;
    let mut best_rules: Vec<(bool, String)> = Vec::new();

    for group in groups {
        let mut specificity = 0usize;
        for agent in &group.agents {
            if agent == "*" {
                specificity = specificity.max(1);
            } else if ua.contains(agent) || agent.contains("cloudwrkz") {
                specificity = specificity.max(agent.len() + 10);
            }
        }
        if specificity > best_specificity {
            best_specificity = specificity;
            best_rules = group.rules.clone();
        }
    }
    best_rules
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disallow_all_blocks_root() {
        let body = r#"
User-agent: *
Disallow: /
"#;
        assert!(!is_path_allowed_for_agent(body, SCRAPE_USER_AGENT, "/"));
        assert!(!is_path_allowed_for_agent(body, SCRAPE_USER_AGENT, "/page"));
    }

    #[test]
    fn allow_overrides_longer_disallow() {
        let body = r#"
User-agent: *
Disallow: /
Allow: /public
"#;
        assert!(is_path_allowed_for_agent(body, SCRAPE_USER_AGENT, "/public/page"));
        assert!(!is_path_allowed_for_agent(body, SCRAPE_USER_AGENT, "/private"));
    }

    #[test]
    fn empty_disallow_means_allow() {
        let body = r#"
User-agent: *
Disallow:
"#;
        assert!(is_path_allowed_for_agent(body, SCRAPE_USER_AGENT, "/anything"));
    }

    #[test]
    fn cloudwrkz_specific_group() {
        let body = r#"
User-agent: CloudWrkz
Disallow: /secret

User-agent: *
Disallow: /
"#;
        assert!(!is_path_allowed_for_agent(body, SCRAPE_USER_AGENT, "/secret/doc"));
    }
}
