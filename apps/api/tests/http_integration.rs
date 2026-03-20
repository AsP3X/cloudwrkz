//! Router + PostgreSQL integration tests. Requires `DATABASE_URL` (same as `sqlx migrate`).
//!
//! Run: `cd apps/api && DATABASE_URL=postgres://... cargo test`

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use sqlx::PgPool;
use std::time::Instant;
use tower::ServiceExt;
use uuid::Uuid;

use cloudwrkz_api::auth::password;
use cloudwrkz_api::build_http_app;
use cloudwrkz_api::AppConfig;

fn test_config(database_url: String) -> AppConfig {
    AppConfig {
        database_url,
        api_host: "127.0.0.1".into(),
        api_port: 8080,
        cors_origins: vec![],
        cookie_domain: None,
        cookie_secure: false,
        session_max_age_secs: 3600,
        max_body_size: 1024 * 1024,
        api_region: None,
        api_nodes_available: 1,
        diagnostics_health_token: None,
        auth_rate_limit_refill_period: std::time::Duration::from_secs(60),
        auth_rate_limit_burst: 200,
    }
}

fn req_get(uri: &str) -> Request<Body> {
    Request::builder()
        .method("GET")
        .uri(uri)
        .header("x-forwarded-for", "203.0.113.42")
        .body(Body::empty())
        .unwrap()
}

fn req_get_bearer(uri: &str, token: &str) -> Request<Body> {
    Request::builder()
        .method("GET")
        .uri(uri)
        .header("x-forwarded-for", "203.0.113.42")
        .header("authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap()
}

async fn seed_user_with_session(
    pool: &PgPool,
    email: &str,
    role: &str,
) -> Result<String, sqlx::Error> {
    let user_id = Uuid::new_v4().to_string();
    let hash = password::hash_password("integration-test-password").expect("hash password");
    sqlx::query(
        r#"INSERT INTO users (id, email, email_verified, name, password, role, status, created_at, updated_at)
           VALUES ($1, $2, true, 'Integration', $3, $4::"Role", 'ACTIVE', NOW(), NOW())"#,
    )
    .bind(&user_id)
    .bind(email)
    .bind(&hash)
    .bind(role)
    .execute(pool)
    .await?;

    let token = format!("sess_{}", Uuid::new_v4());
    let session_id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"INSERT INTO sessions (id, token, user_id, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, NOW() + interval '1 day', NOW(), NOW())"#,
    )
    .bind(&session_id)
    .bind(&token)
    .bind(&user_id)
    .execute(pool)
    .await?;

    Ok(token)
}

async fn grant_permission(pool: &PgPool, user_id: &str, perm_key: &str) -> Result<(), sqlx::Error> {
    let perm_id: String =
        sqlx::query_scalar("SELECT id FROM permissions WHERE key = $1")
            .bind(perm_key)
            .fetch_one(pool)
            .await?;
    let up_id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"INSERT INTO user_permissions (id, user_id, permission_id, created_at)
           VALUES ($1, $2, $3, NOW())"#,
    )
    .bind(&up_id)
    .bind(user_id)
    .bind(&perm_id)
    .execute(pool)
    .await?;
    Ok(())
}

#[sqlx::test(migrations = "./migrations")]
async fn me_without_token_returns_401(pool: PgPool) {
    let app = build_http_app(
        pool.clone(),
        test_config(std::env::var("DATABASE_URL").expect("DATABASE_URL set by sqlx::test")),
        Instant::now(),
    );
    let res = app.oneshot(req_get("/api/v1/me")).await.expect("oneshot");
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_statistics_without_token_returns_401(pool: PgPool) {
    let app = build_http_app(
        pool.clone(),
        test_config(std::env::var("DATABASE_URL").expect("DATABASE_URL set by sqlx::test")),
        Instant::now(),
    );
    let res = app
        .oneshot(req_get("/api/v1/admin/statistics"))
        .await
        .expect("oneshot");
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn me_with_valid_session_returns_200(pool: PgPool) {
    let token = seed_user_with_session(&pool, "me-test@example.com", "USER")
        .await
        .expect("seed");
    let app = build_http_app(
        pool.clone(),
        test_config(std::env::var("DATABASE_URL").expect("DATABASE_URL set by sqlx::test")),
        Instant::now(),
    );
    let res = app
        .oneshot(req_get_bearer("/api/v1/me", &token))
        .await
        .expect("oneshot");
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body).expect("json");
    assert_eq!(v["email"], "me-test@example.com");
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_statistics_for_non_admin_returns_403(pool: PgPool) {
    let token = seed_user_with_session(&pool, "user-only@example.com", "USER")
        .await
        .expect("seed");
    let app = build_http_app(
        pool.clone(),
        test_config(std::env::var("DATABASE_URL").expect("DATABASE_URL set by sqlx::test")),
        Instant::now(),
    );
    let res = app
        .oneshot(req_get_bearer("/api/v1/admin/statistics", &token))
        .await
        .expect("oneshot");
    assert_eq!(res.status(), StatusCode::FORBIDDEN);
}

#[sqlx::test(migrations = "./migrations")]
async fn list_permissions_with_explicit_grant_succeeds(pool: PgPool) {
    let email = "perm-view@example.com";
    let token = seed_user_with_session(&pool, email, "USER")
        .await
        .expect("seed");

    let uid: String = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
        .bind(email)
        .fetch_one(&pool)
        .await
        .expect("user row");
    grant_permission(&pool, &uid, "admin.permissions.view")
        .await
        .expect("grant");

    let app = build_http_app(
        pool.clone(),
        test_config(std::env::var("DATABASE_URL").expect("DATABASE_URL set by sqlx::test")),
        Instant::now(),
    );
    let res = app
        .oneshot(req_get_bearer("/api/v1/admin/permissions", &token))
        .await
        .expect("oneshot");
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body).expect("json");
    assert!(v["permissions"].is_array());
}

#[sqlx::test(migrations = "./migrations")]
async fn baseline_security_headers_on_responses(pool: PgPool) {
    let app = build_http_app(
        pool.clone(),
        test_config(std::env::var("DATABASE_URL").expect("DATABASE_URL set by sqlx::test")),
        Instant::now(),
    );
    let res = app.oneshot(req_get("/api/v1/ping")).await.expect("oneshot");
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(
        res.headers()
            .get("x-content-type-options")
            .and_then(|h: &axum::http::HeaderValue| h.to_str().ok()),
        Some("nosniff")
    );
    assert!(res.headers().get("referrer-policy").is_some());
    assert!(res.headers().get("permissions-policy").is_some());
}
