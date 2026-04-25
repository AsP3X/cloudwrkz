use rand::Rng;

// Human: Session and magic-link secrets are 32 random bytes shown as lowercase hex, matching what we store as hashes in the database.
// Agent: READS OS RNG 32 bytes; LOCAL hex encode no std dependency; RETURNS 64-char hex string.

pub fn generate_token() -> String {
    let mut rng = rand::rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.random::<u8>()).collect();
    hex::encode(&bytes)
}

mod hex {
    // Human: Tiny hex encoder keeps the session token helper free of extra crates for what is two nibbles per byte.
    // Agent: MAPS each u8 to two HEX_CHARS lookups; ALLOCATES String capacity len*2.

    const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";

    pub fn encode(bytes: &[u8]) -> String {
        let mut s = String::with_capacity(bytes.len() * 2);
        for &b in bytes {
            s.push(HEX_CHARS[(b >> 4) as usize] as char);
            s.push(HEX_CHARS[(b & 0x0f) as usize] as char);
        }
        s
    }
}
