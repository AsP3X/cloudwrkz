use std::time::{SystemTime, UNIX_EPOCH};

// Human: API rows use the same sortable string id style Prisma clients expect so web and DB migrations stay aligned.
// Agent: PREFIX c + base36(ms since UNIX_EPOCH) + 16 random base36 chars; USES SystemTime::now; PANICS if clock before epoch.

/// Generate a CUID-like identifier compatible with Prisma's cuid() default.
/// Format: 25-char lowercase alphanumeric string.
pub fn new_cuid() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let random_part: String = (0..16)
        .map(|_| {
            let idx = rand::random::<u8>() % 36;
            if idx < 10 {
                (b'0' + idx) as char
            } else {
                (b'a' + idx - 10) as char
            }
        })
        .collect();

    format!("c{}{}", base36(timestamp as u64), random_part)
}

// Human: Encodes the millisecond timestamp into a short lowercase string using division/modulo base 36.
// Agent: SPECIAL-CASE n==0 -> "0"; ELSE collects remainders against ASCII 0-9a-z then reverses into UTF-8 String.

fn base36(mut n: u64) -> String {
    if n == 0 {
        return "0".to_string();
    }
    let chars = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut result = Vec::new();
    while n > 0 {
        result.push(chars[(n % 36) as usize]);
        n /= 36;
    }
    result.reverse();
    String::from_utf8(result).unwrap()
}
