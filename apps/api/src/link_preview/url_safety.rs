//! SSRF guards for outbound link preview HTTP and screenshot capture.

// Human: We only fetch public http(s) URLs so scrapers cannot probe localhost or private networks.
// Agent: PARSES Url; REQUIRES http/https; REJECTS loopback private link-local metadata hosts.

use std::net::IpAddr;
use url::Url;

// Human: Bookmark URLs must be normal web pages reachable from the API container, not internal services.
// Agent: RETURNS false for non-http(s), missing host, localhost, .local, and private/link-local IPs.

pub fn url_safe_for_outbound_fetch(url_str: &str) -> bool {
    let Ok(parsed) = Url::parse(url_str.trim()) else {
        return false;
    };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return false;
    }
    let Some(host) = parsed.host_str() else {
        return false;
    };
    let host_lc = host.to_lowercase();
    if host_lc == "localhost" || host_lc.ends_with(".localhost") || host_lc.ends_with(".local") {
        return false;
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        return !ip_is_blocked(ip);
    }
    true
}

fn ip_is_blocked(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4.is_unspecified()
        }
        IpAddr::V6(v6) => {
            v6.is_loopback() || v6.is_unspecified() || v6.is_unique_local()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_loopback() {
        assert!(!url_safe_for_outbound_fetch("http://127.0.0.1/"));
        assert!(!url_safe_for_outbound_fetch("http://localhost/"));
    }

    #[test]
    fn allows_https_public() {
        assert!(url_safe_for_outbound_fetch("https://example.com/page"));
    }

    #[test]
    fn blocks_file_scheme() {
        assert!(!url_safe_for_outbound_fetch("file:///etc/passwd"));
    }
}
