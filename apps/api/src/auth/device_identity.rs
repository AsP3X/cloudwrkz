//! Device identification for login sessions — merges client-reported metadata, HTTP Client Hints,
//! and User-Agent parsing into stable `device_*` fields shown in “Login sessions”.

// Human: Sessions store four device columns plus raw user_agent; this module fills gaps when the browser only sends a UA string.
// Agent: PARSES User-Agent + Sec-CH-UA* headers; MERGES ClientDeviceReport; EXPORTS DeviceIdentity + display_label + enrich_stored_fields.

use axum::http::HeaderMap;

/// Parsed or client-supplied device fields persisted on `sessions`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeviceIdentity {
    pub device_name: Option<String>,
    pub device_type: Option<String>,
    pub device_os: Option<String>,
    pub device_browser: Option<String>,
}

/// Optional fields sent by web/mobile clients in login JSON (`LoginRequest`).
#[derive(Debug, Clone, Default)]
pub struct ClientDeviceReport {
    pub device_name: Option<String>,
    pub device_type: Option<String>,
    pub device_os: Option<String>,
    pub device_browser: Option<String>,
}

/// Subset of HTTP Client Hints headers browsers may send alongside User-Agent.
#[derive(Debug, Clone, Default)]
pub struct ClientHintHeaders {
    pub sec_ch_ua: Option<String>,
    pub sec_ch_ua_mobile: Option<String>,
    pub sec_ch_ua_platform: Option<String>,
    pub sec_ch_ua_platform_version: Option<String>,
    pub sec_ch_ua_model: Option<String>,
}

impl ClientDeviceReport {
    // Human: Login bodies reuse the same snake_case field names the API already accepts.
    // Agent: FROM LoginRequest device_* + no extra mapping.
    pub fn from_login_body(body: &crate::models::user::LoginRequest) -> Self {
        Self {
            device_name: body.device_name.clone(),
            device_type: body.device_type.clone(),
            device_os: body.device_os.clone(),
            device_browser: body.device_browser.clone(),
        }
    }
}

// Human: Chromium-family browsers expose richer platform data via Sec-CH-UA* when the client sends them.
// Agent: READS sec-ch-ua sec-ch-ua-mobile sec-ch-ua-platform sec-ch-ua-platform-version sec-ch-ua-model from HeaderMap.

pub fn client_hints_from_headers(headers: &HeaderMap) -> ClientHintHeaders {
    ClientHintHeaders {
        sec_ch_ua: header_value(headers, "sec-ch-ua"),
        sec_ch_ua_mobile: header_value(headers, "sec-ch-ua-mobile"),
        sec_ch_ua_platform: header_value(headers, "sec-ch-ua-platform"),
        sec_ch_ua_platform_version: header_value(headers, "sec-ch-ua-platform-version"),
        sec_ch_ua_model: header_value(headers, "sec-ch-ua-model"),
    }
}

fn header_value(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

// Human: We prefer explicit client metadata, then Client Hints, then UA heuristics so every login gets a readable label.
// Agent: CALLS parse_user_agent; MERGES ClientDeviceReport + ClientHintHeaders; RETURNS DeviceIdentity with device_name fallback label.

pub fn resolve_device_identity(
    user_agent: Option<&str>,
    client: &ClientDeviceReport,
    hints: &ClientHintHeaders,
) -> DeviceIdentity {
    let ua = user_agent.unwrap_or("").trim();
    let parsed = parse_user_agent(ua, hints);
    let mut merged = merge_client_report(client, parsed);
    if merged.device_name.is_none() {
        merged.device_name = Some(build_display_label(&merged, ua));
    }
    merged
}

// Human: Stored sessions may predate device columns — backfill display fields from user_agent when listing without rewriting DB rows.
// Agent: IF any device_* missing AND user_agent present THEN resolve_device_identity with empty client/hints.

pub fn enrich_stored_fields(
    device_name: Option<String>,
    device_type: Option<String>,
    device_os: Option<String>,
    device_browser: Option<String>,
    user_agent: Option<&str>,
) -> DeviceIdentity {
    let has_all = device_name.is_some()
        && device_type.is_some()
        && device_os.is_some()
        && device_browser.is_some();
    if has_all {
        return DeviceIdentity {
            device_name,
            device_type,
            device_os,
            device_browser,
        };
    }

    let ua = user_agent.filter(|s| !s.trim().is_empty());
    if ua.is_none() && device_name.is_some() {
        return DeviceIdentity {
            device_name,
            device_type,
            device_os,
            device_browser,
        };
    }

    let resolved = resolve_device_identity(ua, &ClientDeviceReport::default(), &ClientHintHeaders::default());
    DeviceIdentity {
        device_name: device_name.or(resolved.device_name),
        device_type: device_type.or(resolved.device_type),
        device_os: device_os.or(resolved.device_os),
        device_browser: device_browser.or(resolved.device_browser),
    }
}

// Human: Native apps and browsers can send partial metadata; only override parsed values when the client supplied a non-empty field.
// Agent: MERGE Option fields client-wins-when-some; PRESERVES parsed gaps filled by other side.

fn merge_client_report(client: &ClientDeviceReport, parsed: DeviceIdentity) -> DeviceIdentity {
    DeviceIdentity {
        device_name: non_empty(client.device_name.clone()).or(parsed.device_name),
        device_type: non_empty(client.device_type.clone()).or(parsed.device_type),
        device_os: non_empty(client.device_os.clone()).or(parsed.device_os),
        device_browser: non_empty(client.device_browser.clone()).or(parsed.device_browser),
    }
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|s| !s.trim().is_empty())
}

// Human: User-facing session titles use “Platform · Browser” so users recognize familiar device names at a glance.
// Agent: JOINS device_os/device_type + device_browser with middle dot; FALLBACK truncated UA or “Unknown device”.

pub fn build_display_label(identity: &DeviceIdentity, user_agent: &str) -> String {
    let platform = identity
        .device_os
        .as_deref()
        .or(identity.device_type.as_deref());
    let app = identity.device_browser.as_deref();

    match (platform, app) {
        (Some(p), Some(b)) if !p.eq_ignore_ascii_case(b) => format!("{p} · {b}"),
        (Some(p), Some(_)) => p.to_string(),
        (Some(p), None) => p.to_string(),
        (None, Some(b)) => b.to_string(),
        (None, None) => truncate_user_agent(user_agent),
    }
}

fn truncate_user_agent(ua: &str) -> String {
    let trimmed = ua.trim();
    if trimmed.is_empty() {
        return "Unknown device".to_string();
    }
    if trimmed.len() <= 80 {
        return trimmed.to_string();
    }
    format!("{}…", &trimmed[..77])
}

// Human: True when the session belongs to a native Cloudwrkz client (longer TTL) rather than a web browser login.
// Agent: TRUE when UA contains Cloudwrkz-iOS OR device_name/browser mentions Cloudwrkz App.

pub fn is_native_app_session(identity: &DeviceIdentity, user_agent: Option<&str>) -> bool {
    if identity
        .device_name
        .as_deref()
        .is_some_and(|n| n.contains("Cloudwrkz App"))
    {
        return true;
    }
    if identity
        .device_browser
        .as_deref()
        .is_some_and(|b| b.contains("Cloudwrkz App"))
    {
        return true;
    }
    user_agent
        .map(|ua| ua.contains("Cloudwrkz-iOS/") || ua.contains("Cloudwrkz-Android/"))
        .unwrap_or(false)
}

struct ParsedUa {
    device_type: Option<String>,
    device_os: Option<String>,
    device_browser: Option<String>,
    device_name: Option<String>,
}

fn parse_user_agent(ua: &str, hints: &ClientHintHeaders) -> DeviceIdentity {
    if ua.is_empty() {
        return hints_only_identity(hints);
    }

    let ua_lc = ua.to_ascii_lowercase();

    if let Some(identity) = parse_cloudwrkz_native(ua) {
        return identity;
    }

    if let Some(identity) = parse_http_tool(&ua_lc, ua) {
        return identity;
    }

    let mut parsed = ParsedUa {
        device_type: None,
        device_os: None,
        device_browser: None,
        device_name: None,
    };

    apply_client_hints(hints, &mut parsed);
    detect_device_class(ua, &ua_lc, hints, &mut parsed);
    detect_os(ua, &ua_lc, hints, &mut parsed);
    detect_browser(ua, &ua_lc, hints, &mut parsed);

    DeviceIdentity {
        device_name: parsed.device_name,
        device_type: parsed.device_type,
        device_os: parsed.device_os,
        device_browser: parsed.device_browser,
    }
}

fn hints_only_identity(hints: &ClientHintHeaders) -> DeviceIdentity {
    let mut parsed = ParsedUa {
        device_type: None,
        device_os: None,
        device_browser: None,
        device_name: None,
    };
    apply_client_hints(hints, &mut parsed);
    DeviceIdentity {
        device_name: None,
        device_type: parsed.device_type,
        device_os: parsed.device_os,
        device_browser: parsed.device_browser,
    }
}

fn parse_cloudwrkz_native(ua: &str) -> Option<DeviceIdentity> {
    if let Some(ios) = parse_cloudwrkz_ios(ua) {
        return Some(ios);
    }
    if ua.contains("Cloudwrkz-Android/") {
        return Some(DeviceIdentity {
            device_name: Some("Mobile Android (Cloudwrkz App)".into()),
            device_type: Some("mobile".into()),
            device_os: Some("Android".into()),
            device_browser: Some("Cloudwrkz App".into()),
        });
    }
    None
}

fn parse_cloudwrkz_ios(ua: &str) -> Option<DeviceIdentity> {
    if !ua.contains("Cloudwrkz-iOS/") {
        return None;
    }
    let model = ua
        .rsplit(';')
        .next()
        .map(|s| s.trim().trim_end_matches(')'))
        .filter(|s| !s.is_empty())
        .unwrap_or("iOS device");
    let friendly = map_apple_hardware(model).unwrap_or_else(|| model.to_string());
    let device_type = if friendly.to_ascii_lowercase().contains("ipad") {
        "tablet"
    } else {
        "mobile"
    };
    Some(DeviceIdentity {
        device_name: Some(format!("{friendly} (Cloudwrkz App)")),
        device_type: Some(device_type.into()),
        device_os: Some("iOS".into()),
        device_browser: Some("Cloudwrkz App".into()),
    })
}

fn parse_http_tool(ua_lc: &str, _ua: &str) -> Option<DeviceIdentity> {
    let (browser, device_type) = if ua_lc.starts_with("curl/") {
        ("curl", "desktop")
    } else if ua_lc.starts_with("wget/") {
        ("wget", "desktop")
    } else if ua_lc.contains("postman") {
        ("Postman", "desktop")
    } else if ua_lc.contains("insomnia") {
        ("Insomnia", "desktop")
    } else if ua_lc.contains("httpie") {
        ("HTTPie", "desktop")
    } else if ua_lc.contains("python-requests") {
        ("Python requests", "desktop")
    } else if ua_lc.contains("axios/") {
        ("Axios", "desktop")
    } else if ua_lc.contains("go-http-client") {
        ("Go HTTP client", "desktop")
    } else if ua_lc.contains("reqwest/") {
        ("Reqwest", "desktop")
    } else if ua_lc.contains("cloudwrkz-cli") {
        ("Cloudwrkz CLI", "desktop")
    } else {
        return None;
    };

    Some(DeviceIdentity {
        device_name: Some(format!("{browser} client")),
        device_type: Some(device_type.into()),
        device_os: Some("Unknown OS".into()),
        device_browser: Some(browser.into()),
    })
}

fn apply_client_hints(hints: &ClientHintHeaders, parsed: &mut ParsedUa) {
    if let Some(platform) = hints.sec_ch_ua_platform.as_deref() {
        let cleaned = strip_quotes(platform);
        if !cleaned.is_empty() {
            parsed.device_os = Some(normalize_platform_name(&cleaned));
        }
    }

    if let Some(model) = hints.sec_ch_ua_model.as_deref() {
        let cleaned = strip_quotes(model);
        if !cleaned.is_empty() && cleaned != "\"\"" {
            parsed.device_os = Some(format_android_model(&cleaned));
        }
    }

    if let Some(mobile) = hints.sec_ch_ua_mobile.as_deref() {
        match mobile.trim() {
            "?1" => parsed.device_type = Some("mobile".into()),
            "?0" if parsed.device_type.is_none() => parsed.device_type = Some("desktop".into()),
            _ => {}
        }
    }

    if let Some(ch_ua) = hints.sec_ch_ua.as_deref() {
        if let Some(brand) = primary_chromium_brand(ch_ua) {
            parsed.device_browser = Some(brand);
        }
    }
}

fn detect_device_class(ua: &str, ua_lc: &str, hints: &ClientHintHeaders, parsed: &mut ParsedUa) {
    if parsed.device_type.is_some() {
        return;
    }

    if ua_lc.contains("ipad")
        || ua.contains("iPad")
        || hints
            .sec_ch_ua_model
            .as_deref()
            .is_some_and(|m| m.to_ascii_lowercase().contains("ipad"))
    {
        parsed.device_type = Some("tablet".into());
        return;
    }

    if ua_lc.contains("tablet")
        || ua_lc.contains("kindle")
        || ua_lc.contains("silk/")
        || ua_lc.contains("playbook")
    {
        parsed.device_type = Some("tablet".into());
        return;
    }

    if ua_lc.contains("mobile")
        || ua_lc.contains("iphone")
        || ua_lc.contains("ipod")
        || ua_lc.contains("android")
        || ua_lc.contains("phone")
        || hints.sec_ch_ua_mobile.as_deref() == Some("?1")
    {
        parsed.device_type = Some("mobile".into());
        return;
    }

    parsed.device_type = Some("desktop".into());
}

fn detect_os(ua: &str, ua_lc: &str, hints: &ClientHintHeaders, parsed: &mut ParsedUa) {
    if parsed.device_os.is_some() {
        return;
    }

    if ua_lc.contains("iphone") || ua_lc.contains("ipod") {
        parsed.device_os = Some(format!("iPhone · iOS {}", extract_ios_version(ua)));
        return;
    }

    if ua_lc.contains("ipad") {
        parsed.device_os = Some(format!("iPad · iPadOS {}", extract_ios_version(ua)));
        return;
    }

    if ua_lc.contains("android") {
        parsed.device_os = Some(format_android_from_ua(ua));
        return;
    }

    if ua_lc.contains("cros") {
        parsed.device_os = Some("Chrome OS".into());
        return;
    }

    if ua_lc.contains("mac os x") || ua_lc.contains("macintosh") {
        parsed.device_os = Some(format!("macOS {}", extract_mac_version(ua)));
        return;
    }

    if ua_lc.contains("windows nt") {
        parsed.device_os = Some(format_windows_version(ua));
        return;
    }

    if ua_lc.contains("linux") && !ua_lc.contains("android") {
        parsed.device_os = Some(detect_linux_distro(ua));
        return;
    }

    if let Some(platform) = hints.sec_ch_ua_platform.as_deref() {
        let cleaned = strip_quotes(platform);
        if !cleaned.is_empty() {
            parsed.device_os = Some(normalize_platform_name(&cleaned));
        }
    }
}

fn detect_browser(ua: &str, ua_lc: &str, hints: &ClientHintHeaders, parsed: &mut ParsedUa) {
    if parsed.device_browser.is_some() {
        return;
    }

    if ua_lc.contains("edg/") || ua_lc.contains("edga/") || ua_lc.contains("edgios/") {
        parsed.device_browser = Some(format!("Microsoft Edge {}", extract_version_after(ua, "Edg/")));
        return;
    }

    if ua_lc.contains("opr/") || ua_lc.contains("opios/") {
        parsed.device_browser = Some(format!("Opera {}", extract_version_after(ua, "OPR/")));
        return;
    }

    if ua_lc.contains("firefox/") || ua_lc.contains("fxios/") {
        parsed.device_browser = Some(format!("Firefox {}", extract_version_after(ua, "Firefox/")));
        return;
    }

    if ua_lc.contains("crios/") {
        parsed.device_browser = Some(format!("Chrome {}", extract_version_after(ua, "CriOS/")));
        return;
    }

    if ua_lc.contains("chrome/") && !ua_lc.contains("chromium/") {
        parsed.device_browser = Some(format!("Chrome {}", extract_version_after(ua, "Chrome/")));
        return;
    }

    if ua_lc.contains("safari/") && ua_lc.contains("version/") {
        parsed.device_browser = Some(format!("Safari {}", extract_version_after(ua, "Version/")));
        return;
    }

    if ua_lc.contains("safari/") {
        parsed.device_browser = Some("Safari".into());
        return;
    }

    if let Some(ch_ua) = hints.sec_ch_ua.as_deref() {
        if let Some(brand) = primary_chromium_brand(ch_ua) {
            parsed.device_browser = Some(brand);
        }
    }
}

fn primary_chromium_brand(sec_ch_ua: &str) -> Option<String> {
    let mut brands: Vec<(String, String)> = Vec::new();
    for part in sec_ch_ua.split(',') {
        let part = part.trim();
        if let Some((name, ver)) = part.split_once(';') {
            let name = strip_quotes(name.trim());
            let ver = strip_quotes(ver.trim().trim_start_matches("v"));
            if name.is_empty() {
                continue;
            }
            if name.eq_ignore_ascii_case("Not A(Brand)")
                || name.eq_ignore_ascii_case("Not)A;Brand")
                || name.contains("Not A;Brand")
            {
                continue;
            }
            brands.push((name, ver));
        }
    }
    brands.sort_by(|a, b| {
        let rank = |name: &str| match name.to_ascii_lowercase().as_str() {
            "google chrome" => 0,
            "microsoft edge" => 1,
            "opera" => 2,
            "chromium" => 3,
            _ => 4,
        };
        rank(&a.0).cmp(&rank(&b.0))
    });
    brands.first().map(|(name, ver)| {
        if ver.is_empty() {
            name.clone()
        } else {
            format!("{name} {ver}")
        }
    })
}

fn extract_version_after(ua: &str, needle: &str) -> String {
    ua.split(needle)
        .nth(1)
        .and_then(|rest| rest.split([' ', ';', ')']).next())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "unknown".into())
}

fn extract_ios_version(ua: &str) -> String {
    if let Some(idx) = ua.find("OS ") {
        let rest = &ua[idx + 3..];
        let ver = rest
            .split([' ', '_'])
            .take(3)
            .collect::<Vec<_>>()
            .join(".");
        if !ver.is_empty() {
            return ver;
        }
    }
    "unknown".into()
}

fn extract_mac_version(ua: &str) -> String {
    if let Some(idx) = ua.find("Mac OS X ") {
        let rest = &ua[idx + 9..];
        let ver = rest
            .split([' ', '_', ';', ')'])
            .take(3)
            .filter(|p| !p.is_empty())
            .collect::<Vec<_>>()
            .join(".");
        if !ver.is_empty() {
            return ver;
        }
    }
    if let Some(idx) = ua.find("Macintosh; Intel Mac OS X ") {
        let rest = &ua[idx + 26..];
        let ver = rest
            .split([' ', '_', ';', ')'])
            .take(3)
            .filter(|p| !p.is_empty())
            .collect::<Vec<_>>()
            .join(".");
        if !ver.is_empty() {
            return ver;
        }
    }
    "unknown".into()
}

fn format_windows_version(ua: &str) -> String {
    let nt = ua
        .split("Windows NT ")
        .nth(1)
        .and_then(|rest| rest.split([';', ')', ' ']).next())
        .unwrap_or("10.0");
    let label = match nt {
        "10.0" if ua.contains("Windows 11") => "11",
        "10.0" => "10/11",
        "6.3" => "8.1",
        "6.2" => "8",
        "6.1" => "7",
        other => other,
    };
    format!("Windows {label}")
}

fn detect_linux_distro(ua: &str) -> String {
    let ua_lc = ua.to_ascii_lowercase();
    if ua_lc.contains("ubuntu") {
        return "Linux (Ubuntu)".into();
    }
    if ua_lc.contains("fedora") {
        return "Linux (Fedora)".into();
    }
    if ua_lc.contains("debian") {
        return "Linux (Debian)".into();
    }
    "Linux".into()
}

fn format_android_from_ua(ua: &str) -> String {
    let version = ua
        .split("Android ")
        .nth(1)
        .and_then(|rest| rest.split([';', ')', ' ']).next())
        .unwrap_or("unknown");
    if let Some(model) = extract_android_model(ua) {
        return format!("{model} · Android {version}");
    }
    format!("Android {version}")
}

fn extract_android_model(ua: &str) -> Option<String> {
    if let Some(start) = ua.find("; ") {
        let after = &ua[start + 2..];
        if let Some(end) = after.find(" Build/") {
            let model = after[..end].trim();
            if !model.is_empty()
                && !model.eq_ignore_ascii_case("linux")
                && !model.eq_ignore_ascii_case("android")
                && !model.starts_with("Android ")
            {
                return Some(model.to_string());
            }
        }
    }
    if let Some(model) = ua.split("Android ").nth(1) {
        let model = model.split(';').nth(1)?.trim();
        if !model.is_empty() && model != "K" {
            return Some(model.to_string());
        }
    }
    None
}

fn format_android_model(model: &str) -> String {
    let cleaned = strip_quotes(model);
    if cleaned.is_empty() {
        "Android".into()
    } else {
        format!("{cleaned} · Android")
    }
}

fn normalize_platform_name(platform: &str) -> String {
    match platform.trim().trim_matches('"') {
        "macOS" | "Mac OS X" => "macOS".into(),
        "Windows" => "Windows".into(),
        "Android" => "Android".into(),
        "Chrome OS" | "Chromium OS" => "Chrome OS".into(),
        "iOS" => "iOS".into(),
        other => other.to_string(),
    }
}

fn strip_quotes(value: &str) -> String {
    value.trim().trim_matches('"').trim().to_string()
}

fn map_apple_hardware(identifier: &str) -> Option<String> {
    match identifier {
        "iPhone16,1" => Some("iPhone 15 Pro".into()),
        "iPhone16,2" => Some("iPhone 15 Pro Max".into()),
        "iPhone15,4" => Some("iPhone 15".into()),
        "iPhone15,5" => Some("iPhone 15 Plus".into()),
        "iPhone15,2" => Some("iPhone 14 Pro".into()),
        "iPhone15,3" => Some("iPhone 14 Pro Max".into()),
        "iPhone14,7" => Some("iPhone 14".into()),
        "iPhone14,8" => Some("iPhone 14 Plus".into()),
        "iPad14,1" | "iPad14,2" => Some("iPad mini".into()),
        "iPad13,18" | "iPad13,19" => Some("iPad (10th gen)".into()),
        "iPad14,3" | "iPad14,4" => Some("iPad Pro 11".into()),
        "iPad14,5" | "iPad14,6" => Some("iPad Pro 12.9".into()),
        id if id.starts_with("iPhone") => Some("iPhone".into()),
        id if id.starts_with("iPad") => Some("iPad".into()),
        id if id.starts_with("iPod") => Some("iPod touch".into()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_macos_chrome() {
        let ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
        let id = resolve_device_identity(Some(ua), &ClientDeviceReport::default(), &ClientHintHeaders::default());
        assert_eq!(id.device_type.as_deref(), Some("desktop"));
        assert!(id.device_os.as_deref().unwrap_or("").contains("macOS"));
        assert!(id.device_browser.as_deref().unwrap_or("").contains("Chrome"));
        assert!(id.device_name.as_deref().unwrap_or("").contains('·'));
    }

    #[test]
    fn parses_iphone_safari() {
        let ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1";
        let id = resolve_device_identity(Some(ua), &ClientDeviceReport::default(), &ClientHintHeaders::default());
        assert_eq!(id.device_type.as_deref(), Some("mobile"));
        assert!(id.device_os.as_deref().unwrap_or("").contains("iPhone"));
        assert!(id.device_browser.as_deref().unwrap_or("").contains("Safari"));
    }

    #[test]
    fn parses_cloudwrkz_ios() {
        let ua = "Cloudwrkz-iOS/1.2 (42; iOS 17.4; iPhone16,1)";
        let id = resolve_device_identity(Some(ua), &ClientDeviceReport::default(), &ClientHintHeaders::default());
        assert_eq!(id.device_type.as_deref(), Some("mobile"));
        assert_eq!(id.device_browser.as_deref(), Some("Cloudwrkz App"));
        assert!(id.device_name.as_deref().unwrap_or("").contains("iPhone 15 Pro"));
    }

    #[test]
    fn client_report_overrides_parsed_browser() {
        let ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";
        let client = ClientDeviceReport {
            device_browser: Some("Cloudwrkz App".into()),
            device_name: Some("Mobile iOS (Cloudwrkz App)".into()),
            device_type: Some("mobile".into()),
            device_os: Some("iOS".into()),
        };
        let id = resolve_device_identity(Some(ua), &client, &ClientHintHeaders::default());
        assert_eq!(id.device_browser.as_deref(), Some("Cloudwrkz App"));
        assert_eq!(id.device_name.as_deref(), Some("Mobile iOS (Cloudwrkz App)"));
    }

    #[test]
    fn enriches_missing_fields_from_user_agent() {
        let ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0";
        let id = enrich_stored_fields(None, None, None, None, Some(ua));
        assert!(id.device_name.is_some());
        assert_eq!(id.device_type.as_deref(), Some("desktop"));
        assert!(id.device_os.as_deref().unwrap_or("").contains("Windows"));
        assert!(id.device_browser.as_deref().unwrap_or("").contains("Firefox"));
    }

    #[test]
    fn uses_client_hints_when_present() {
        let hints = ClientHintHeaders {
            sec_ch_ua: Some(r#""Google Chrome";v="131", "Chromium";v="131""#.into()),
            sec_ch_ua_mobile: Some("?0".into()),
            sec_ch_ua_platform: Some("\"macOS\"".into()),
            ..Default::default()
        };
        let id = resolve_device_identity(Some(""), &ClientDeviceReport::default(), &hints);
        assert_eq!(id.device_type.as_deref(), Some("desktop"));
        assert_eq!(id.device_os.as_deref(), Some("macOS"));
        assert!(id.device_browser.as_deref().unwrap_or("").contains("Chrome"));
    }

    #[test]
    fn detects_native_app_for_ttl() {
        let id = resolve_device_identity(
            Some("Cloudwrkz-iOS/1.0 (1; iOS 17.0; iPhone15,2)"),
            &ClientDeviceReport::default(),
            &ClientHintHeaders::default(),
        );
        assert!(is_native_app_session(&id, Some("Cloudwrkz-iOS/1.0")));
    }
}
