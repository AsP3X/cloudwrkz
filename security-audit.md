---
title: CloudWrkz Security Audit
date: 2026-05-02
auditor: Claude Sonnet 4.6 (Anthropic)
project: cloudwrkz
branch: security/http-security-headers-hardening
status: complete
tags:
  - security
  - audit
  - cloudwrkz
  - findings
aliases:
  - Security Audit
  - Audit Report
---

# CloudWrkz Security Audit

> **Date:** 2026-05-02
> **Scope:** Full project and architecture — `apps/api/` (Rust/Axum), `apps/web-vite/` (React/TypeScript), infrastructure (Docker, GitHub Actions)
> **Branch:** `security/http-security-headers-hardening`
> **Auditor:** Automated security review (Claude Sonnet 4.6)

---

## Navigation

- [[#Architecture Overview]]
- [[#Threat Model]]
- [[#Confirmed Vulnerabilities]]
  - [[#VULN-001 — Arbitrary SQL Execution via Writable CTEs (Admin db_query)]]
  - [[#VULN-002 — Broken bcrypt Verification (Argon2 used in place of bcrypt)]]
  - [[#VULN-003 — SSRF via Unconstrained Link Metadata Fetch]]
  - [[#VULN-004 — MODERATOR Can Reset Any User Password Including ADMIN]]
  - [[#VULN-005 — MODERATOR Can Create ADMIN-Role Accounts (Privilege Escalation)]]
- [[#Architecture-Level Findings]]
  - [[#ARCH-001 — Session Tokens Stored Plaintext in Database]]
  - [[#ARCH-002 — Password Reset Tokens Stored Plaintext in Database]]
  - [[#ARCH-003 — COOKIE_SECURE Defaults to false]]
  - [[#ARCH-004 — No HSTS Header Configured]]
  - [[#ARCH-005 — Container Runs as Root]]
  - [[#ARCH-006 — No CI Image Signing or Vulnerability Scanning]]
- [[#Remediation Roadmap]]
- [[#False Positives Investigated]]

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CloudWrkz Platform                          │
│                                                                      │
│  ┌─────────────────┐         ┌──────────────────────────────────┐   │
│  │  apps/web-vite   │ ──────▶ │          apps/api                │   │
│  │  React + Vite    │  HTTPS  │  Rust · Axum 0.8 · sqlx 0.8    │   │
│  │  TypeScript      │         │  Port 8080 (plain TCP)          │   │
│  └─────────────────┘         └──────────────┬───────────────────┘   │
│                                             │ sqlx/rustls            │
│                                             ▼                        │
│                               ┌──────────────────────────┐          │
│                               │       PostgreSQL           │          │
│                               │  sessions (plaintext tok) │          │
│                               │  users (argon2 password)  │          │
│                               └──────────────────────────┘          │
└──────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Web framework | Axum | 0.8 |
| ORM / Query | sqlx | 0.8 (rustls TLS) |
| Password hashing | argon2 | 0.5 |
| Session tokens | rand (OS RNG) | 0.9 |
| Rate limiting | tower_governor | 0.8 |
| HTTP client | reqwest | 0.12 |
| Container base | debian:bookworm-slim | — |

### Authentication Architecture

```
Client Request
    │
    ▼
Authorization: Bearer <64-hex-char-token>
    OR
Cookie: session=<64-hex-char-token>
    │
    ▼
AuthUser extractor (extractors.rs)
    │ SELECT from sessions JOIN users WHERE token = $1
    ▼
CurrentUser { id, role, session_id }
    │
    ▼
Per-handler: check_permission() + role checks
```

**Session token entropy:** 256 bits (32 random bytes via OS RNG, hex-encoded).
**Session storage:** Plaintext in `sessions.token` (TEXT UNIQUE). See [[#ARCH-001 — Session Tokens Stored Plaintext in Database]].

### Role Hierarchy

```
ADMIN
  └─ Full system access, all admin routes
MODERATOR  ← ⚠ broken (see VULN-004, VULN-005)
  └─ Subset of admin access (password reset, user creation — unscoped)
AGENT
  └─ Elevated operational permissions
USER
  └─ Standard permissions via group membership
```

### Security Headers (as configured)

| Header | Value | Method |
|--------|-------|--------|
| `X-Content-Type-Options` | `nosniff` | Static |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Static |
| `Permissions-Policy` | camera/mic/payment/USB disabled | Static |
| `X-Frame-Options` | `SAMEORIGIN` (default) | Env-driven |
| `Content-Security-Policy` | `default-src 'self'; ...` | Env-driven |
| `Strict-Transport-Security` | **NOT SET** | — |

---

## Threat Model

### Trust Boundaries

```
[Public Internet]
        │  (unauthenticated)
        ▼
  /api/health          ← public, no auth
  /api/auth/*          ← login/register, rate-limited
        │  (authenticated session token)
        ▼
  /api/v1/*            ← standard user endpoints
        │  (employees.view / tickets.view / etc.)
        ▼
  /api/v1/admin/*      ← ADMIN or MODERATOR role
        │  (ADMIN only)
        ▼
  /api/v1/admin/db-query ← ⚠ VULN-001
  /api/v1/admin/users/{id}/reset-password ← ⚠ VULN-004
  /api/v1/admin/users (POST) ← ⚠ VULN-005
```

### Assets at Risk

| Asset | Sensitivity | Relevant Finding |
|-------|------------|-----------------|
| User passwords (argon2) | High | [[#VULN-002 — Broken bcrypt Verification (Argon2 used in place of bcrypt)]] |
| Session tokens (DB) | Critical | [[#ARCH-001 — Session Tokens Stored Plaintext in Database]] |
| Password reset tokens (DB) | Critical | [[#ARCH-002 — Password Reset Tokens Stored Plaintext in Database]] |
| All database data | Critical | [[#VULN-001 — Arbitrary SQL Execution via Writable CTEs (Admin db_query)]] |
| Internal network services | High | [[#VULN-003 — SSRF via Unconstrained Link Metadata Fetch]] |
| Admin account credentials | Critical | [[#VULN-004 — MODERATOR Can Reset Any User Password Including ADMIN]] |

---

## Confirmed Vulnerabilities

> Findings below passed a two-stage analysis: initial identification + independent false-positive filtering.
> All have confidence ≥ 8/10.

---

### VULN-001 — Arbitrary SQL Execution via Writable CTEs (Admin db_query)

**Tags:** `#sql-injection` `#high` `#admin`
**Related:** [[#Remediation Roadmap]] · [[#Threat Model]]

| Field | Value |
|-------|-------|
| **File** | `apps/api/src/routes/admin.rs:544–555` |
| **Severity** | HIGH |
| **Confidence** | 9/10 |
| **Category** | sql_injection |
| **Access Required** | `admin.db.view_entries` permission OR `ADMIN` role |

#### Description

The `POST /api/v1/admin/db-query` endpoint wraps the caller-supplied SQL string into a format string before execution:

```rust
// admin.rs:550-555
let rows: Vec<serde_json::Value> = sqlx::query_scalar(&format!(
    "SELECT row_to_json(t) FROM ({query}) t LIMIT 1000"
))
.fetch_all(&state.pool)
.await?;
```

The only guard is a `starts_with("SELECT")` prefix check. This check does **not** prevent writable CTEs, which are syntactically valid single SQL statements beginning with `WITH`:

> **Note:** sqlx prevents semicolon-separated multi-statements at the protocol level. However, writable CTEs (`WITH x AS (DELETE ... RETURNING *) SELECT * FROM x`) are a **single statement** and are not blocked.

#### Exploit Scenario

A user with `admin.db.view_entries` (read-only admin sub-permission) sends:

```json
POST /api/v1/admin/db-query
{
  "query": "WITH x AS (DELETE FROM users RETURNING id, email) SELECT * FROM x"
}
```

This bypasses the `SELECT` prefix check, executes a full table deletion, and returns the deleted rows. The endpoint is designed as a **read-only inspection tool**, making this a privilege boundary violation — a read-only sub-admin gains write access to all tables the database role can modify.

Additional vectors:
- `WITH x AS (UPDATE users SET role = 'ADMIN' WHERE email = 'attacker@example.com' RETURNING *) SELECT * FROM x`
- `SELECT pg_read_file('/etc/passwd')` — PostgreSQL superuser file read
- `SELECT * FROM users` — full credential database dump

#### Remediation

**Immediate:** Replace `format!()` with a parameterized placeholder. Use PostgreSQL's `pg_catalog.pg_execute_as_readonly()` or wrap execution in a read-only transaction:

```rust
// Use a read-only transaction to enforce read-only semantics at the DB level
let mut tx = state.pool.begin().await?;
sqlx::query("SET TRANSACTION READ ONLY").execute(&mut *tx).await?;
let rows = sqlx::query_scalar(&format!(
    "SELECT row_to_json(t) FROM ({query}) t LIMIT 1000"
))
.fetch_all(&mut *tx)
.await?;
tx.rollback().await?;
```

This ensures any writable CTE's side effects are rolled back even if the statement executes.

**Long-term:** Use a dedicated read-only PostgreSQL role with `GRANT SELECT` only, with no `INSERT`/`UPDATE`/`DELETE` grants.

---

### VULN-002 — Broken bcrypt Verification (Argon2 used in place of bcrypt)

**Tags:** `#broken-authentication` `#high` `#password`
**Related:** [[#Remediation Roadmap]] · [[#Architecture Overview]]

| Field | Value |
|-------|-------|
| **File** | `apps/api/src/auth/password.rs:32–37` |
| **Severity** | HIGH |
| **Confidence** | 9/10 |
| **Category** | broken_authentication |
| **Access Required** | None (affects all bcrypt-hashed accounts at login) |

#### Description

The `verify_bcrypt` function is intended to verify passwords stored as bcrypt hashes (`$2b$`/`$2a$` prefix), but calls `Argon2::default().verify_password()` — which is the Argon2 verification path, not bcrypt:

```rust
// password.rs:32-37
fn verify_bcrypt(password: &str, hash: &str) -> Result<bool, argon2::password_hash::Error> {
    let parsed = PasswordHash::new(hash)?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}
```

The `bcrypt` crate is **not present** in `Cargo.toml`. Argon2 will reject a bcrypt PHC string (algorithm identifier mismatch) and the function returns `false` for every bcrypt password, regardless of correctness.

The dispatch in `verify_password` routes any `$2b$`/`$2a$` hash to this function:

```rust
// password.rs:20-28
pub fn verify_password(password: &str, hash: &str) -> bool {
    if hash.starts_with("$2b$") || hash.starts_with("$2a$") {
        verify_bcrypt(password, hash).unwrap_or(false)  // always false
    } else {
        verify_argon2(password, hash).unwrap_or(false)
    }
}
```

#### Impact

Any user whose password hash in the database starts with `$2b$` or `$2a$` (bcrypt format — common in migrations from other systems) is permanently locked out. The function will never return `true` for any password, correct or not.

#### Exploit Scenario

1. An attacker knows (or observes) that a target account has a bcrypt-formatted password hash.
2. The account cannot be authenticated by its legitimate owner — the hash is irrecoverably locked.
3. An attacker with database write access can insert a bcrypt-format hash for a target account, making it permanently inaccessible without direct DB intervention.

#### Remediation

**Option A (preferred):** Remove bcrypt support entirely if no bcrypt-hashed users exist in production. Delete the `verify_bcrypt` function and the `$2b$`/`$2a$` branch.

**Option B:** Add the `bcrypt` crate and implement correct verification:

```toml
# Cargo.toml
bcrypt = "0.15"
```

```rust
fn verify_bcrypt(password: &str, hash: &str) -> bool {
    bcrypt::verify(password, hash).unwrap_or(false)
}
```

**Audit action:** Query `SELECT COUNT(*) FROM users WHERE password LIKE '$2b$%' OR password LIKE '$2a$%'` to determine actual impact.

---

### VULN-003 — SSRF via Unconstrained Link Metadata Fetch

**Tags:** `#ssrf` `#high` `#authenticated`
**Related:** [[#Remediation Roadmap]] · [[#Threat Model]]

| Field | Value |
|-------|-------|
| **File** | `apps/api/src/link_preview.rs:19–23` · `apps/api/src/routes/links.rs:508–554` |
| **Severity** | HIGH |
| **Confidence** | 9/10 |
| **Category** | ssrf |
| **Access Required** | Any authenticated user session |

#### Description

The `POST /api/v1/links/extract-metadata` endpoint fetches an arbitrary caller-supplied URL with no host/IP validation:

```rust
// link_preview.rs:19-23
let resp = client
    .get(url_str)          // url_str is raw user input
    .header("User-Agent", "CloudWrkz/1.0 Link Preview")
    .send()
    .await
    .map_err(|_| AppError::bad_request("Failed to fetch URL"))?;
```

The only validation is an empty-string check. No scheme whitelist, no IP range blocklist, no DNS resolution interception. `reqwest` follows redirects by default — a redirect chain from a public host to an internal address bypasses any future host-level filtering.

#### Exploit Scenario

**Internal network probe:**
```json
POST /api/v1/links/extract-metadata
Authorization: Bearer <valid-token>
{"url": "http://192.168.1.1/admin"}
```

The API server makes an outbound request to the internal router's admin panel. If the internal service returns HTML with a `<title>` tag, its content is reflected back in the response:
```json
{"title": "Router Admin Panel - TP-Link", "description": null, "favicon": null}
```

**AWS metadata exfiltration (IMDSv1):**
```json
{"url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/"}
```

On AWS without IMDSv2 enforcement, this returns IAM role credential names, which can be fetched in a follow-up request.

**Redirect-based bypass:**
```
Attacker hosts: https://attacker.com/redirect → http://10.0.0.50:8080/internal-admin
```
```json
{"url": "https://attacker.com/redirect"}
```

#### Remediation

Validate the resolved URL before making the request. Implement a DNS-resolution-based IP blocklist:

```rust
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()        // 127.0.0.0/8
            || v4.is_private()      // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
            || v4.is_link_local()   // 169.254.0.0/16 (AWS IMDS)
            || v4.is_multicast()
        }
        IpAddr::V6(v6) => v6.is_loopback() || v6.is_multicast(),
    }
}
```

Also: enforce `https://` scheme only, disable redirects (`redirect(Policy::none())`), and set a strict content-length limit.

---

### VULN-004 — MODERATOR Can Reset Any User Password Including ADMIN

**Tags:** `#privilege-escalation` `#medium` `#moderator` `#account-takeover`
**Related:** [[#VULN-005 — MODERATOR Can Create ADMIN-Role Accounts (Privilege Escalation)]] · [[#Remediation Roadmap]]

| Field | Value |
|-------|-------|
| **File** | `apps/api/src/routes/admin.rs:1575–1610` |
| **Severity** | MEDIUM (→ HIGH if MODERATOR accounts are broadly granted) |
| **Confidence** | 9/10 |
| **Category** | privilege_escalation / account_takeover |
| **Access Required** | `MODERATOR` role |

#### Description

The `POST /api/v1/admin/users/{id}/reset-password` handler checks only that the caller is `ADMIN` or `MODERATOR`, with no check on the target user's role:

```rust
// admin.rs:1580-1583
if user.role != "ADMIN" && user.role != "MODERATOR" {
    return Err(AppError::forbidden("Admin access required"));
}
// ← no check: what is the target user's role?

let n = sqlx::query("UPDATE users SET password = $1 WHERE id = $2")
    .bind(&hash)
    .bind(&id)          // raw path param — no role hierarchy check
    .execute(&state.pool)
    .await?;
```

The response returns the new plaintext password:
```rust
Ok(Json(serde_json::json!({ "plainPassword": plain })))  // admin.rs:1610
```

The existing session is forcibly deleted before the reset (`admin.rs:1594-1597`), completing the takeover — the legitimate owner is logged out while the attacker receives the new credential.

The design comment at `admin.rs:1189` states *"moderators get a subset, admins get full control"* — confirming the missing hierarchy check is unintentional.

#### Exploit Scenario

1. Attacker compromises a `MODERATOR` account (social engineering, credential stuffing, etc.).
2. Attacker calls `POST /api/v1/admin/users/<admin-user-id>/reset-password`.
3. Response contains `{ "plainPassword": "Xyz...123" }`.
4. Attacker logs in as the ADMIN account with the new password.
5. Target ADMIN is logged out; attacker has full system access.

**Combined with [[#VULN-005 — MODERATOR Can Create ADMIN-Role Accounts (Privilege Escalation)]]:** a MODERATOR can silently create a new ADMIN account without needing to touch existing ones.

#### Remediation

Add a role hierarchy check before executing the password reset:

```rust
// Fetch the target user's role first
let target = sqlx::query_scalar::<_, String>(
    "SELECT role FROM users WHERE id = $1"
)
.bind(&id)
.fetch_optional(&state.pool)
.await?
.ok_or(AppError::not_found("User not found"))?;

// MODERATOR cannot reset ADMIN or other MODERATOR passwords
if user.role == "MODERATOR" && (target == "ADMIN" || target == "MODERATOR") {
    return Err(AppError::forbidden("Insufficient role to reset this user's password"));
}
```

---

### VULN-005 — MODERATOR Can Create ADMIN-Role Accounts (Privilege Escalation)

**Tags:** `#privilege-escalation` `#medium` `#moderator`
**Related:** [[#VULN-004 — MODERATOR Can Reset Any User Password Including ADMIN]] · [[#Remediation Roadmap]]

| Field | Value |
|-------|-------|
| **File** | `apps/api/src/routes/admin.rs:1283–1350` |
| **Severity** | MEDIUM |
| **Confidence** | 9/10 |
| **Category** | privilege_escalation |
| **Access Required** | `MODERATOR` role + `admin.users.create` permission |

#### Description

The `POST /api/v1/admin/users` handler allows MODERATOR to create users with any role including `ADMIN`:

```rust
// admin.rs:1283-1308
if user.role != "ADMIN" && user.role != "MODERATOR" {
    return Err(AppError::forbidden("Admin access required"));
}
if user.role != "ADMIN"
    && !check_permission(&state.pool, &user.id, "admin.users.create").await
{
    return Err(AppError::forbidden("..."));
}

let role = body.role.to_uppercase();
if !matches!(role.as_str(), "USER" | "AGENT" | "ADMIN" | "MODERATOR") {
    return Err(AppError::bad_request("Invalid role"));
}
// role is inserted directly — no ceiling check for MODERATOR callers
```

A `MODERATOR` + `admin.users.create` → can create `ADMIN` role user → escalation complete.

#### Exploit Scenario

1. Attacker has a `MODERATOR` account with `admin.users.create` permission.
2. `POST /api/v1/admin/users` with `{"role": "ADMIN", "email": "backdoor@example.com", "password": "..."}`
3. New ADMIN account is created silently.
4. Attacker logs in with full ADMIN access.

This leaves no trace of the original MODERATOR account performing a suspicious action — only a new user creation in audit logs.

#### Remediation

Add a role ceiling check after the permission check:

```rust
// A caller cannot create a user with a role equal to or higher than their own
let caller_role_level = role_level(&user.role);
let target_role_level = role_level(&role);
if target_role_level >= caller_role_level && user.role != "ADMIN" {
    return Err(AppError::forbidden(
        "Cannot create a user with a role equal to or higher than your own"
    ));
}
```

Where `role_level` maps `USER=1, AGENT=2, MODERATOR=3, ADMIN=4`.

---

## Architecture-Level Findings

> These findings are structural/configuration issues identified during architecture review.
> They are not code-level exploits but represent systemic security debt.

---

### ARCH-001 — Session Tokens Stored Plaintext in Database

**Tags:** `#session-management` `#architecture` `#database`
**Related:** [[#ARCH-002 — Password Reset Tokens Stored Plaintext in Database]]

| Field | Value |
|-------|-------|
| **File** | `apps/api/migrations/001_initial_schema.sql` (`sessions.token` column) |
| **Severity** | MEDIUM |
| **Category** | session_management |

**Issue:** `sessions.token` is stored as `TEXT UNIQUE` — the raw plaintext session token. If the database is read-compromised (SQL injection, DB backup exposure, read replica breach), every active user session can be immediately hijacked.

**Recommended fix:** Store a SHA-256 hash of the session token in the database. Compare `sha256(presented_token)` against the stored hash. This is analogous to how password hashes work — the plaintext credential never persists.

```sql
-- Migration: add token_hash column
ALTER TABLE sessions ADD COLUMN token_hash TEXT UNIQUE;
-- Backfill: UPDATE sessions SET token_hash = encode(sha256(token::bytea), 'hex');
-- Then drop token column after cutover
```

---

### ARCH-002 — Password Reset Tokens Stored Plaintext in Database

**Tags:** `#token-management` `#architecture` `#database`
**Related:** [[#ARCH-001 — Session Tokens Stored Plaintext in Database]]

| Field | Value |
|-------|-------|
| **File** | `apps/api/migrations/001_initial_schema.sql` (`users.password_reset_token`, `users.email_verification_token`) |
| **Severity** | MEDIUM |
| **Category** | token_management |

**Issue:** `users.password_reset_token` and `users.email_verification_token` are stored as plaintext `TEXT` columns. A read-only database breach (backup exposure, SELECT permissions on a compromised replica) yields tokens that allow password reset or email verification bypass for any user who has a pending token.

**Recommended fix:** Store only the SHA-256 hash of these tokens (same pattern as [[#ARCH-001 — Session Tokens Stored Plaintext in Database]]).

---

### ARCH-003 — COOKIE_SECURE Defaults to false

**Tags:** `#cookie-security` `#configuration` `#architecture`
**Related:** [[#ARCH-004 — No HSTS Header Configured]]

| Field | Value |
|-------|-------|
| **File** | `apps/api/src/config.rs` (`COOKIE_SECURE` env var) |
| **Severity** | MEDIUM |
| **Category** | session_management |

**Issue:** `COOKIE_SECURE` defaults to `false`. In this default state, session cookies are not flagged with the `Secure` attribute, meaning they can be transmitted over plain HTTP. If the application is deployed without TLS termination (or a misconfigured reverse proxy allows HTTP), session cookies will be sent in cleartext.

**Recommended fix:** Default `COOKIE_SECURE` to `true`. Deployments that genuinely need HTTP-only (local dev) should explicitly opt out:

```rust
// config.rs
cookie_secure: env_bool("COOKIE_SECURE").unwrap_or(true),  // default true
```

---

### ARCH-004 — No HSTS Header Configured

**Tags:** `#hsts` `#tls` `#architecture`
**Related:** [[#ARCH-003 — COOKIE_SECURE Defaults to false]]

| Field | Value |
|-------|-------|
| **File** | `apps/api/src/lib.rs` (security headers middleware) |
| **Severity** | LOW |
| **Category** | transport_security |

**Issue:** No `Strict-Transport-Security` header is emitted anywhere in the middleware stack. Without HSTS, browsers will not automatically upgrade HTTP connections to HTTPS, and downgrade attacks (SSL stripping) remain possible on first visit or after cookie expiry.

**Recommended fix:** Add HSTS to the security headers middleware (only when TLS is in use):

```rust
// lib.rs — in the security headers block
.layer(SetResponseHeaderLayer::if_not_present(
    header::STRICT_TRANSPORT_SECURITY,
    HeaderValue::from_static("max-age=31536000; includeSubDomains"),
))
```

Consider conditionalizing on an `APP_ENV=production` flag to avoid HSTS on local HTTP dev environments.

---

### ARCH-005 — Container Runs as Root

**Tags:** `#container-security` `#docker` `#architecture`
**Related:** [[#ARCH-006 — No CI Image Signing or Vulnerability Scanning]]

| Field | Value |
|-------|-------|
| **File** | `apps/api/Dockerfile` |
| **Severity** | LOW |
| **Category** | container_security |

**Issue:** The API Dockerfile has no `USER` directive. The process runs as root (UID 0) inside the container. A container escape vulnerability or RCE would give the attacker root-level filesystem access.

**Recommended fix:**

```dockerfile
# Add to Dockerfile before CMD
RUN groupadd --gid 10001 cloudwrkz && \
    useradd --uid 10001 --gid cloudwrkz --shell /sbin/nologin cloudwrkz
USER cloudwrkz
```

---

### ARCH-006 — No CI Image Signing or Vulnerability Scanning

**Tags:** `#ci-cd` `#supply-chain` `#architecture`
**Related:** [[#ARCH-005 — Container Runs as Root]]

| Field | Value |
|-------|-------|
| **File** | `.github/workflows/docker-image-build.yml` |
| **Severity** | LOW |
| **Category** | supply_chain |

**Issues:**
1. No container image vulnerability scanning (Trivy, Grype, Snyk) in the CI pipeline — vulnerable OS packages in `debian:bookworm-slim` go undetected.
2. No image signing (Cosign/Sigstore) — image provenance cannot be verified; a registry compromise could silently substitute a malicious image.
3. The workflow builds `apps/web-vite/Dockerfile` (frontend) — the API Dockerfile (`apps/api/Dockerfile`) has no CI build job.

**Recommended fix:**
```yaml
# Add to docker-image-build.yml after push step
- name: Scan image for vulnerabilities
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ${{ env.IMAGE_NAME }}:${{ env.IMAGE_TAG }}
    exit-code: '1'
    severity: 'CRITICAL,HIGH'

- name: Sign image
  uses: sigstore/cosign-installer@main
  run: cosign sign --yes ${{ env.IMAGE_NAME }}@${{ steps.push.outputs.digest }}
```

---

## Remediation Roadmap

```
Priority P0 (Fix before production deployment)
├── VULN-001: Admin db_query writable CTE injection
│   └── Wrap execution in SET TRANSACTION READ ONLY
├── VULN-002: Broken bcrypt verification
│   └── Add bcrypt crate OR remove dead bcrypt path
└── VULN-003: SSRF in link metadata endpoint
    └── Add IP blocklist + scheme whitelist + disable redirects

Priority P1 (Fix within 1 sprint)
├── VULN-004: MODERATOR password reset scope
│   └── Add role hierarchy check before reset
├── VULN-005: MODERATOR user creation scope
│   └── Add role ceiling check in create_user
├── ARCH-001: Session tokens plaintext in DB
│   └── Hash tokens before storage (SHA-256)
└── ARCH-002: Reset tokens plaintext in DB
    └── Hash tokens before storage (SHA-256)

Priority P2 (Fix within 1 month)
├── ARCH-003: COOKIE_SECURE defaults to false
│   └── Flip default to true
├── ARCH-004: No HSTS header
│   └── Add Strict-Transport-Security to middleware
└── ARCH-005: Container runs as root
    └── Add non-root USER to Dockerfile

Priority P3 (Ongoing / next quarter)
└── ARCH-006: No CI image scanning or signing
    └── Add Trivy scan + Cosign signing to workflow
```

### Effort × Impact Matrix

```
         High Impact
              │
    VULN-001 ●│● VULN-003
    VULN-002  │
              │
    ──────────┼──────────
     Low      │       High
     Effort   │       Effort
              │
    VULN-004 ●│● ARCH-001
    VULN-005  │● ARCH-002
              │
         Low Impact
```

---

## False Positives Investigated

The following were investigated and determined to be false positives:

| Finding | Reason Excluded |
|---------|----------------|
| `db_row_update` / `db_row_delete` manual SQL escaping | `sanitize_identifier` enforces `[A-Za-z0-9_]` only; `standard_conforming_strings=on` makes backslash-quote bypass impossible in modern PostgreSQL |
| CORS wildcard (`CORS_ORIGINS` unset) | `allow_credentials(false)` neutralizes cookie-based attacks; Bearer token CORS bypass requires prior token possession, which is a separate XSS issue |
| `X-Forwarded-For` IP spoofing in audit logs | Affects only log field values — log spoofing exclusion applies; no security enforcement uses the extracted IP |
| IDOR on employee salary data | `employees.view` authorization is correctly enforced; salary visibility to `employees.view` holders is by design (Admin group only); `employees.view_self` correctly scopes self-access |
| Favicon path traversal | Sanitization blocks all known traversal vectors on Linux; working-directory risk is operational, not attacker-controlled |
| Public health endpoint fingerprinting | Intentional for load balancer probes; basic version info is low-risk |

---

## Appendix: Security Controls Inventory

### Present and Effective
- [x] Argon2id password hashing with random salt
- [x] 256-bit session token entropy (OS RNG)
- [x] Per-route permission checks via `check_permission()`
- [x] Rate limiting on auth endpoints (60 req/min, 30 burst)
- [x] `X-Content-Type-Options: nosniff`
- [x] `Referrer-Policy: strict-origin-when-cross-origin`
- [x] `Permissions-Policy` (camera, mic, payment disabled)
- [x] `Content-Security-Policy` (no `unsafe-inline`, no `unsafe-eval`)
- [x] `X-Frame-Options` (env-configurable)
- [x] sqlx parameterized queries (default pattern)
- [x] Admin route role gating
- [x] Audit log table with event tracking
- [x] Request ID and trace span correlation

### Missing or Deficient
- [ ] HSTS header ([[#ARCH-004 — No HSTS Header Configured]])
- [ ] `COOKIE_SECURE` default ([[#ARCH-003 — COOKIE_SECURE Defaults to false]])
- [ ] Session token hashing at rest ([[#ARCH-001 — Session Tokens Stored Plaintext in Database]])
- [ ] Reset token hashing at rest ([[#ARCH-002 — Password Reset Tokens Stored Plaintext in Database]])
- [ ] SSRF protection on outbound HTTP ([[#VULN-003 — SSRF via Unconstrained Link Metadata Fetch]])
- [ ] Role hierarchy enforcement in admin user management ([[#VULN-004 — MODERATOR Can Reset Any User Password Including ADMIN]], [[#VULN-005 — MODERATOR Can Create ADMIN-Role Accounts (Privilege Escalation)]])
- [ ] Read-only DB transaction enforcement in `db_query` ([[#VULN-001 — Arbitrary SQL Execution via Writable CTEs (Admin db_query)]])
- [ ] bcrypt verification correctness ([[#VULN-002 — Broken bcrypt Verification (Argon2 used in place of bcrypt)]])
- [ ] Non-root container user ([[#ARCH-005 — Container Runs as Root]])
- [ ] CI container scanning and signing ([[#ARCH-006 — No CI Image Signing or Vulnerability Scanning]])
