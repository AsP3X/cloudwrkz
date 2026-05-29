//! In-app settings entries searchable from global search (mirrors legacy Next.js catalog).

// Human: Static settings catalog fuzzy-matched in-process so users can find settings pages from global search.
// Agent: EXPORTS search_settings ScoredHit list; READS user role + admin permissions; NO DB.

use super::engine::ScoredHit;
use serde_json::json;

struct AppSetting {
    id: &'static str,
    title: &'static str,
    description: &'static str,
    url: &'static str,
    category: &'static str,
    keywords: &'static [&'static str],
    admin_only: bool,
}

const BASE_SETTINGS: &[AppSetting] = &[
    AppSetting {
        id: "account-email",
        title: "Change Email Address",
        description: "Update the email address associated with your account.",
        url: "/dashboard/settings",
        category: "account",
        keywords: &["email", "address", "login", "account", "contact"],
        admin_only: false,
    },
    AppSetting {
        id: "account-password",
        title: "Change Password",
        description: "Update your account password and improve your security.",
        url: "/dashboard/settings",
        category: "account",
        keywords: &["password", "security", "login", "credentials"],
        admin_only: false,
    },
    AppSetting {
        id: "preferences-theme",
        title: "Appearance & Theme",
        description: "Switch between light, dark, or system theme.",
        url: "/dashboard/settings",
        category: "preferences",
        keywords: &["theme", "dark mode", "light mode", "appearance", "color"],
        admin_only: false,
    },
    AppSetting {
        id: "preferences-language",
        title: "Language",
        description: "Change the language used in the application interface.",
        url: "/dashboard/settings",
        category: "preferences",
        keywords: &["language", "locale", "translation"],
        admin_only: false,
    },
    AppSetting {
        id: "preferences-timezone",
        title: "Time Zone",
        description: "Set your preferred time zone for displaying dates and times.",
        url: "/dashboard/settings",
        category: "preferences",
        keywords: &["timezone", "time zone", "time", "clock", "dates"],
        admin_only: false,
    },
    AppSetting {
        id: "preferences-notifications-email",
        title: "Email Notifications",
        description: "Control email notifications about important account activity.",
        url: "/dashboard/settings",
        category: "preferences",
        keywords: &["notifications", "email", "alerts", "messages"],
        admin_only: false,
    },
    AppSetting {
        id: "preferences-notifications-push",
        title: "Push Notifications",
        description: "Enable or disable browser push notifications.",
        url: "/dashboard/settings",
        category: "preferences",
        keywords: &["notifications", "push", "browser", "alerts"],
        admin_only: false,
    },
    AppSetting {
        id: "preferences-timer-widget",
        title: "Timer Widget Display",
        description: "Choose whether the time tracking widget appears as a dialog or floating widget.",
        url: "/dashboard/settings",
        category: "preferences",
        keywords: &["time tracking", "timer", "widget", "floating", "dialog"],
        admin_only: false,
    },
    AppSetting {
        id: "security-two-factor",
        title: "Two-Factor Authentication",
        description: "Add an extra layer of security to your account with two-factor authentication.",
        url: "/dashboard/settings",
        category: "security",
        keywords: &["2fa", "two factor", "authentication", "security", "login"],
        admin_only: false,
    },
    AppSetting {
        id: "system-settings",
        title: "System Settings",
        description: "View system information, health checks, and database statistics.",
        url: "/dashboard/admin/settings",
        category: "system",
        keywords: &["system", "admin", "settings", "health", "database", "metrics"],
        admin_only: true,
    },
];

fn word_match(haystack: &str, term: &str) -> bool {
    if term.is_empty() {
        return false;
    }
    let term = term.to_lowercase();
    haystack
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .any(|word| word == term)
}

fn score_setting(setting: &AppSetting, query: &str) -> f64 {
    let terms: Vec<&str> = query
        .split_whitespace()
        .filter(|t| t.len() >= 2)
        .collect();
    if terms.is_empty() {
        return 0.0;
    }
    let blob = format!(
        "{} {} {} {}",
        setting.title,
        setting.description,
        setting.keywords.join(" "),
        setting.category
    );
    let all_match = terms.iter().all(|t| word_match(&blob, t));
    if !all_match {
        return 0.0;
    }
    let title_hit = terms.iter().any(|t| word_match(setting.title, t));
    if title_hit {
        0.85
    } else {
        0.65
    }
}

/// Fuzzy-match navigable settings pages for the signed-in user.
pub fn search_settings(query: &str, perm_keys: &[String], limit: usize) -> Vec<ScoredHit> {
    let q = query.trim();
    if q.len() < 2 {
        return vec![];
    }

    let has_admin = perm_keys.iter().any(|k| k.starts_with("admin."));
    let mut hits: Vec<ScoredHit> = BASE_SETTINGS
        .iter()
        .filter(|s| !s.admin_only || has_admin)
        .filter_map(|s| {
            let score = score_setting(s, q);
            if score <= 0.0 {
                return None;
            }
            Some(ScoredHit {
                entity_type: "setting".to_string(),
                entity_id: s.id.to_string(),
                match_score: score,
                result: json!({
                    "type": "setting",
                    "id": s.id,
                    "title": s.title,
                    "description": s.description,
                    "url": s.url,
                    "metadata": {
                        "category": s.category,
                    },
                }),
            })
        })
        .collect();

    hits.sort_by(|a, b| {
        b.match_score
            .partial_cmp(&a.match_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    hits.truncate(limit);
    hits
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_theme_setting() {
        let hits = search_settings("theme", &[], 5);
        assert!(hits.iter().any(|h| h.entity_id == "preferences-theme"));
    }

    #[test]
    fn admin_settings_require_admin_permission() {
        let none = search_settings("database statistics metrics", &[], 5);
        assert!(none.is_empty());
        let admin = search_settings(
            "database statistics metrics",
            &["admin.settings.manage".to_string()],
            5,
        );
        assert!(admin.iter().any(|h| h.entity_id == "system-settings"));
    }
}
