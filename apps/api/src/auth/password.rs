use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};

// Human: New passwords are hashed with Argon2id using per-password random salts; verification accepts legacy bcrypt strings too.
// Agent: hash_password USES SaltString+Argon2::default; verify_password DISPATCHES $2a/$2b to verify_bcrypt ELSE Argon2 verify.

pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2.hash_password(password.as_bytes(), &salt)?;
    Ok(hash.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, argon2::password_hash::Error> {
    // Human: Older accounts may still store bcrypt digests, so we branch on the prefix before using Argon2’s verifier.
    // Agent: PREFIX $2b$ or $2a$ -> verify_bcrypt; ELSE PasswordHash parse + Argon2::default.verify_password -> bool.
    // Support both argon2 and bcrypt hashes (bcrypt starts with "$2b$" or "$2a$")
    if hash.starts_with("$2b$") || hash.starts_with("$2a$") {
        return verify_bcrypt(password, hash);
    }
    let parsed = PasswordHash::new(hash)?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

// Human: Bcrypt hashes are still parsed through the `password-hash` crate’s `PasswordHash` wrapper for a single verification API surface.
// Agent: CALLS PasswordHash::new(hash); THEN Argon2::default.verify_password(password bytes, parsed) -> is_ok.

fn verify_bcrypt(password: &str, hash: &str) -> Result<bool, argon2::password_hash::Error> {
    let parsed = PasswordHash::new(hash)?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}
