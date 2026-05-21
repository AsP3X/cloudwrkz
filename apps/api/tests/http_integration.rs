//! Router + PostgreSQL integration tests. Requires `DATABASE_URL` (same as `sqlx migrate`).
//!
//! Run: `cd apps/api && DATABASE_URL=postgres://... cargo test`

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Instant;
use tower::ServiceExt;
use uuid::Uuid;

use cloudwrkz_api::AppConfig;
use cloudwrkz_api::AppState;
use cloudwrkz_api::auth::password;
use cloudwrkz_api::build_http_app;
use cloudwrkz_api::mutation_broker_for_config;
use cloudwrkz_api::spawn_job_queue_supervisor;

fn test_app_state(pool: PgPool) -> AppState {
    let cfg = test_config(std::env::var("DATABASE_URL").expect("DATABASE_URL set by sqlx::test"));
    let mb = mutation_broker_for_config(&cfg);
    let sup = spawn_job_queue_supervisor(pool.clone(), cfg.clone(), mb.clone(), 2, 2);
    AppState::new(pool, cfg, Instant::now(), mb, sup)
}

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
        mutation_tx_max_ms: 30_000,
        mutation_lock_timeout_ms: 8_000,
        mutation_statement_timeout_ms: 25_000,
        mutation_queue_capacity: 1024,
        idempotency_max_entries: 4096,
        idempotency_ttl_secs: 86_400,
        github_api_token: None,
        github_anonymous_max_requests_per_hour: 60,
        job_queue_worker_count: 2,
        job_queue_github_max_concurrent: 1,
        job_queue_github_min_start_interval_secs: None,
        public_web_app_url: None,
        http_request_log_enabled: false,
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

fn req_patch_ticket_json(token: &str, ticket_id: &str, json_body: &str) -> Request<Body> {
    Request::builder()
        .method("PATCH")
        .uri(format!("/api/v1/tickets/{ticket_id}"))
        .header("x-forwarded-for", "203.0.113.42")
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::from(json_body.to_string()))
        .unwrap()
}

fn req_post_tickets_json(
    token: &str,
    json_body: &str,
    idempotency_key: Option<&str>,
) -> Request<Body> {
    let mut b = Request::builder()
        .method("POST")
        .uri("/api/v1/tickets")
        .header("x-forwarded-for", "203.0.113.42")
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json");
    if let Some(k) = idempotency_key {
        b = b.header("idempotency-key", k);
    }
    b.body(Body::from(json_body.to_string())).unwrap()
}

fn req_post_todos_json(token: &str, json_body: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/api/v1/todos")
        .header("x-forwarded-for", "203.0.113.42")
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::from(json_body.to_string()))
        .unwrap()
}

fn req_patch_todo_json(token: &str, todo_id: &str, json_body: &str) -> Request<Body> {
    Request::builder()
        .method("PATCH")
        .uri(format!("/api/v1/todos/{todo_id}"))
        .header("x-forwarded-for", "203.0.113.42")
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::from(json_body.to_string()))
        .unwrap()
}

fn req_post_time_tracking_json(token: &str, json_body: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/api/v1/time-tracking")
        .header("x-forwarded-for", "203.0.113.42")
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::from(json_body.to_string()))
        .unwrap()
}

fn req_patch_time_entry_json(token: &str, entry_id: &str, json_body: &str) -> Request<Body> {
    Request::builder()
        .method("PATCH")
        .uri(format!("/api/v1/time-tracking/{entry_id}"))
        .header("x-forwarded-for", "203.0.113.42")
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::from(json_body.to_string()))
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
    let perm_id: String = sqlx::query_scalar("SELECT id FROM permissions WHERE key = $1")
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
    let app = build_http_app(test_app_state(pool.clone()));
    let res = app.oneshot(req_get("/api/v1/me")).await.expect("oneshot");
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_statistics_without_token_returns_401(pool: PgPool) {
    let app = build_http_app(test_app_state(pool.clone()));
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
    let app = build_http_app(test_app_state(pool.clone()));
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
    let app = build_http_app(test_app_state(pool.clone()));
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

    let app = build_http_app(test_app_state(pool.clone()));
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
async fn ticket_create_idempotent_returns_same_ticket(pool: PgPool) {
    let token = seed_user_with_session(&pool, "idem-ticket@example.com", "USER")
        .await
        .expect("seed");
    let app = build_http_app(test_app_state(pool.clone()));
    let body = r#"{"title":"Idempotent ticket"}"#;
    let res1 = app
        .clone()
        .oneshot(req_post_tickets_json(&token, body, Some("ticket-idem-1")))
        .await
        .expect("oneshot");
    assert_eq!(res1.status(), StatusCode::ACCEPTED);
    let b1 = res1.into_body().collect().await.unwrap().to_bytes();
    let q1: serde_json::Value = serde_json::from_slice(&b1).expect("json");
    assert_eq!(q1["job_type"], "ticket_create");
    let job1 = q1["job_id"].as_str().expect("job_id");
    let uri = format!("/api/v1/mutation-jobs/{job1}");
    let mut v1: Option<serde_json::Value> = None;
    for _ in 0..100 {
        tokio::time::sleep(std::time::Duration::from_millis(120)).await;
        let res = app
            .clone()
            .oneshot(req_get_bearer(&uri, &token))
            .await
            .expect("poll");
        if res.status() != StatusCode::OK {
            continue;
        }
        let body = res.into_body().collect().await.unwrap().to_bytes();
        let v: serde_json::Value = serde_json::from_slice(&body).expect("json");
        match v["status"].as_str() {
            Some("completed") => {
                v1 = Some(v["body"].clone());
                break;
            }
            Some("failed") => panic!("mutation job failed: {v:?}"),
            _ => {}
        }
    }
    let v1 = v1.expect("mutation job did not complete in time");

    let res2 = app
        .oneshot(req_post_tickets_json(&token, body, Some("ticket-idem-1")))
        .await
        .expect("oneshot");
    assert_eq!(res2.status(), StatusCode::CREATED);
    let b2 = res2.into_body().collect().await.unwrap().to_bytes();
    let v2: serde_json::Value = serde_json::from_slice(&b2).expect("json");

    assert_eq!(v1["id"], v2["id"]);
    assert_eq!(v1["ticket_number"], v2["ticket_number"]);
}

#[sqlx::test(migrations = "./migrations")]
async fn concurrent_ticket_creates_get_distinct_numbers(pool: PgPool) {
    let token = seed_user_with_session(&pool, "conc-ticket@example.com", "USER")
        .await
        .expect("seed");
    let app = Arc::new(build_http_app(test_app_state(pool.clone())));
    let t1 = token.clone();
    let app1 = app.clone();
    let h1 = tokio::spawn(async move {
        let req = req_post_tickets_json(&t1, r#"{"title":"Concurrent A"}"#, None);
        let res = (*app1).clone().oneshot(req).await.expect("oneshot");
        assert_eq!(res.status(), StatusCode::ACCEPTED);
        let b = res.into_body().collect().await.unwrap().to_bytes();
        let q: serde_json::Value = serde_json::from_slice(&b).expect("json");
        assert_eq!(q["job_type"], "ticket_create");
        let job_id = q["job_id"].as_str().expect("job_id").to_string();
        let uri = format!("/api/v1/mutation-jobs/{job_id}");
        let mut out: Option<serde_json::Value> = None;
        for _ in 0..100 {
            tokio::time::sleep(std::time::Duration::from_millis(120)).await;
            let res = (*app1)
                .clone()
                .oneshot(req_get_bearer(&uri, &t1))
                .await
                .expect("poll");
            if res.status() != StatusCode::OK {
                continue;
            }
            let body = res.into_body().collect().await.unwrap().to_bytes();
            let v: serde_json::Value = serde_json::from_slice(&body).expect("json");
            match v["status"].as_str() {
                Some("completed") => {
                    out = Some(v["body"].clone());
                    break;
                }
                Some("failed") => panic!("mutation job failed: {v:?}"),
                _ => {}
            }
        }
        out.expect("mutation job did not complete in time")
    });
    let t2 = token.clone();
    let app2 = app.clone();
    let h2 = tokio::spawn(async move {
        let req = req_post_tickets_json(&t2, r#"{"title":"Concurrent B"}"#, None);
        let res = (*app2).clone().oneshot(req).await.expect("oneshot");
        assert_eq!(res.status(), StatusCode::ACCEPTED);
        let b = res.into_body().collect().await.unwrap().to_bytes();
        let q: serde_json::Value = serde_json::from_slice(&b).expect("json");
        assert_eq!(q["job_type"], "ticket_create");
        let job_id = q["job_id"].as_str().expect("job_id").to_string();
        let uri = format!("/api/v1/mutation-jobs/{job_id}");
        let mut out: Option<serde_json::Value> = None;
        for _ in 0..100 {
            tokio::time::sleep(std::time::Duration::from_millis(120)).await;
            let res = (*app2)
                .clone()
                .oneshot(req_get_bearer(&uri, &t2))
                .await
                .expect("poll");
            if res.status() != StatusCode::OK {
                continue;
            }
            let body = res.into_body().collect().await.unwrap().to_bytes();
            let v: serde_json::Value = serde_json::from_slice(&body).expect("json");
            match v["status"].as_str() {
                Some("completed") => {
                    out = Some(v["body"].clone());
                    break;
                }
                Some("failed") => panic!("mutation job failed: {v:?}"),
                _ => {}
            }
        }
        out.expect("mutation job did not complete in time")
    });
    let (r1, r2) = tokio::join!(h1, h2);
    let v1 = r1.expect("task1");
    let v2 = r2.expect("task2");
    assert_ne!(v1["ticket_number"], v2["ticket_number"]);
}

/// Regression: ticket create must insert `background_jobs` so the admin Jobs page and workers see it.
#[sqlx::test(migrations = "./migrations")]
async fn post_ticket_inserts_ticket_create_background_job(pool: PgPool) {
    let token = seed_user_with_session(&pool, "ticket-bg-job@example.com", "USER")
        .await
        .expect("seed");
    let app = build_http_app(test_app_state(pool.clone()));
    let res = app
        .oneshot(req_post_tickets_json(
            &token,
            r#"{"title":"Background job row check"}"#,
            None,
        ))
        .await
        .expect("oneshot");
    assert_eq!(res.status(), StatusCode::ACCEPTED);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let q: serde_json::Value = serde_json::from_slice(&bytes).expect("json");
    assert_eq!(q["job_type"], "ticket_create");
    let job_id = q["job_id"].as_str().expect("job_id");

    let jt: String = sqlx::query_scalar("SELECT job_type FROM background_jobs WHERE id = $1")
        .bind(job_id)
        .fetch_one(&pool)
        .await
        .expect("background_jobs row");
    assert_eq!(jt, "ticket_create");
}

#[sqlx::test(migrations = "./migrations")]
async fn patch_ticket_enqueues_ticket_update_background_job(pool: PgPool) {
    let token = seed_user_with_session(&pool, "ticket-patch-bg@example.com", "USER")
        .await
        .expect("seed");
    let app = build_http_app(test_app_state(pool.clone()));

    let res = app
        .clone()
        .oneshot(req_post_tickets_json(
            &token,
            r#"{"title":"Ticket for patch job row"}"#,
            None,
        ))
        .await
        .expect("oneshot");
    assert_eq!(res.status(), StatusCode::ACCEPTED);
    let b = res.into_body().collect().await.unwrap().to_bytes();
    let q: serde_json::Value = serde_json::from_slice(&b).expect("json");
    let create_job = q["job_id"].as_str().expect("job_id").to_string();
    let uri = format!("/api/v1/mutation-jobs/{create_job}");
    let mut ticket_id: Option<String> = None;
    for _ in 0..100 {
        tokio::time::sleep(std::time::Duration::from_millis(120)).await;
        let res = app
            .clone()
            .oneshot(req_get_bearer(&uri, &token))
            .await
            .expect("poll");
        if res.status() != StatusCode::OK {
            continue;
        }
        let body = res.into_body().collect().await.unwrap().to_bytes();
        let v: serde_json::Value = serde_json::from_slice(&body).expect("json");
        match v["status"].as_str() {
            Some("completed") => {
                ticket_id = v["body"]["id"].as_str().map(String::from);
                break;
            }
            Some("failed") => panic!("mutation job failed: {v:?}"),
            _ => {}
        }
    }
    let ticket_id = ticket_id.expect("create job did not complete in time");

    let res = app
        .oneshot(req_patch_ticket_json(
            &token,
            &ticket_id,
            r#"{"title":"Updated via background job"}"#,
        ))
        .await
        .expect("patch");
    assert_eq!(res.status(), StatusCode::ACCEPTED);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let q: serde_json::Value = serde_json::from_slice(&bytes).expect("json");
    assert_eq!(q["job_type"], "ticket_update");
    let job_id = q["job_id"].as_str().expect("job_id");

    let jt: String = sqlx::query_scalar("SELECT job_type FROM background_jobs WHERE id = $1")
        .bind(job_id)
        .fetch_one(&pool)
        .await
        .expect("background_jobs row");
    assert_eq!(jt, "ticket_update");
}

#[sqlx::test(migrations = "./migrations")]
async fn patch_todo_enqueues_todo_update_background_job(pool: PgPool) {
    let token = seed_user_with_session(&pool, "todo-patch-bg@example.com", "USER")
        .await
        .expect("seed");
    let app = build_http_app(test_app_state(pool.clone()));

    let res = app
        .clone()
        .oneshot(req_post_todos_json(
            &token,
            r#"{"title":"Task for patch job row"}"#,
        ))
        .await
        .expect("oneshot");
    assert_eq!(res.status(), StatusCode::ACCEPTED);
    let b = res.into_body().collect().await.unwrap().to_bytes();
    let q: serde_json::Value = serde_json::from_slice(&b).expect("json");
    assert_eq!(q["job_type"], "todo_create");
    let create_job = q["job_id"].as_str().expect("job_id").to_string();
    let uri = format!("/api/v1/mutation-jobs/{create_job}");
    let mut todo_id: Option<String> = None;
    for _ in 0..100 {
        tokio::time::sleep(std::time::Duration::from_millis(120)).await;
        let res = app
            .clone()
            .oneshot(req_get_bearer(&uri, &token))
            .await
            .expect("poll");
        if res.status() != StatusCode::OK {
            continue;
        }
        let body = res.into_body().collect().await.unwrap().to_bytes();
        let v: serde_json::Value = serde_json::from_slice(&body).expect("json");
        match v["status"].as_str() {
            Some("completed") => {
                todo_id = v["body"]["id"].as_str().map(String::from);
                break;
            }
            Some("failed") => panic!("mutation job failed: {v:?}"),
            _ => {}
        }
    }
    let todo_id = todo_id.expect("create job did not complete in time");

    let res = app
        .oneshot(req_patch_todo_json(
            &token,
            &todo_id,
            r#"{"title":"Updated todo via background job"}"#,
        ))
        .await
        .expect("patch");
    assert_eq!(res.status(), StatusCode::ACCEPTED);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let q: serde_json::Value = serde_json::from_slice(&bytes).expect("json");
    assert_eq!(q["job_type"], "todo_update");
    let job_id = q["job_id"].as_str().expect("job_id");

    let jt: String = sqlx::query_scalar("SELECT job_type FROM background_jobs WHERE id = $1")
        .bind(job_id)
        .fetch_one(&pool)
        .await
        .expect("background_jobs row");
    assert_eq!(jt, "todo_update");
}

#[sqlx::test(migrations = "./migrations")]
async fn patch_time_entry_enqueues_time_entry_update_background_job(pool: PgPool) {
    let token = seed_user_with_session(&pool, "time-patch-bg@example.com", "USER")
        .await
        .expect("seed");
    let app = build_http_app(test_app_state(pool.clone()));

    let res = app
        .clone()
        .oneshot(req_post_time_tracking_json(
            &token,
            r#"{"name":"Timer for patch job row"}"#,
        ))
        .await
        .expect("oneshot");
    assert_eq!(res.status(), StatusCode::ACCEPTED);
    let b = res.into_body().collect().await.unwrap().to_bytes();
    let q: serde_json::Value = serde_json::from_slice(&b).expect("json");
    assert_eq!(q["job_type"], "time_entry_create_timer");
    let create_job = q["job_id"].as_str().expect("job_id").to_string();
    let uri = format!("/api/v1/mutation-jobs/{create_job}");
    let mut entry_id: Option<String> = None;
    for _ in 0..100 {
        tokio::time::sleep(std::time::Duration::from_millis(120)).await;
        let res = app
            .clone()
            .oneshot(req_get_bearer(&uri, &token))
            .await
            .expect("poll");
        if res.status() != StatusCode::OK {
            continue;
        }
        let body = res.into_body().collect().await.unwrap().to_bytes();
        let v: serde_json::Value = serde_json::from_slice(&body).expect("json");
        match v["status"].as_str() {
            Some("completed") => {
                entry_id = v["body"]["id"].as_str().map(String::from);
                break;
            }
            Some("failed") => panic!("mutation job failed: {v:?}"),
            _ => {}
        }
    }
    let entry_id = entry_id.expect("create job did not complete in time");

    let res = app
        .oneshot(req_patch_time_entry_json(
            &token,
            &entry_id,
            r#"{"name":"Updated timer via background job"}"#,
        ))
        .await
        .expect("patch");
    assert_eq!(res.status(), StatusCode::ACCEPTED);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let q: serde_json::Value = serde_json::from_slice(&bytes).expect("json");
    assert_eq!(q["job_type"], "time_entry_update");
    let job_id = q["job_id"].as_str().expect("job_id");

    let jt: String = sqlx::query_scalar("SELECT job_type FROM background_jobs WHERE id = $1")
        .bind(job_id)
        .fetch_one(&pool)
        .await
        .expect("background_jobs row");
    assert_eq!(jt, "time_entry_update");
}

fn req_post_json(uri: &str, token: &str, json_body: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("x-forwarded-for", "203.0.113.42")
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::from(json_body.to_string()))
        .unwrap()
}

async fn user_id_for_session_token(pool: &PgPool, token: &str) -> String {
    sqlx::query_scalar::<_, String>("SELECT user_id FROM sessions WHERE token = $1")
        .bind(token)
        .fetch_one(pool)
        .await
        .expect("session user_id")
}

#[sqlx::test(migrations = "./migrations")]
async fn db_schema_without_permission_returns_403(pool: PgPool) {
    let token = seed_user_with_session(&pool, "db-no-perm@example.com", "USER")
        .await
        .expect("seed");
    let app = build_http_app(test_app_state(pool));
    let res = app
        .oneshot(req_get_bearer("/api/v1/admin/db/schema", &token))
        .await
        .expect("oneshot");
    assert_eq!(res.status(), StatusCode::FORBIDDEN);
}

#[sqlx::test(migrations = "./migrations")]
async fn db_schema_with_view_permission_returns_tables(pool: PgPool) {
    let token = seed_user_with_session(&pool, "db-view@example.com", "USER")
        .await
        .expect("seed");
    let uid = user_id_for_session_token(&pool, &token).await;
    grant_permission(&pool, &uid, "admin.db.view")
        .await
        .expect("grant");
    let app = build_http_app(test_app_state(pool));
    let res = app
        .oneshot(req_get_bearer("/api/v1/admin/db/schema", &token))
        .await
        .expect("oneshot");
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body).expect("json");
    assert!(v["tables"].as_array().map(|a| !a.is_empty()).unwrap_or(false));
}

#[sqlx::test(migrations = "./migrations")]
async fn db_sql_rejects_writable_cte(pool: PgPool) {
    let token = seed_user_with_session(&pool, "db-sql@example.com", "USER")
        .await
        .expect("seed");
    let uid = user_id_for_session_token(&pool, &token).await;
    grant_permission(&pool, &uid, "admin.db.query")
        .await
        .expect("grant");
    let app = build_http_app(test_app_state(pool));
    let body = r#"{"query":"WITH x AS (DELETE FROM users RETURNING id) SELECT * FROM x"}"#;
    let res = app
        .oneshot(req_post_json("/api/v1/admin/db/sql", &token, body))
        .await
        .expect("oneshot");
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "./migrations")]
async fn legacy_db_query_endpoint_removed(pool: PgPool) {
    let token = seed_user_with_session(&pool, "db-legacy@example.com", "ADMIN")
        .await
        .expect("seed");
    let app = build_http_app(test_app_state(pool));
    let res = app
        .oneshot(req_post_json(
            "/api/v1/admin/db-query",
            &token,
            r#"{"query":"SELECT 1"}"#,
        ))
        .await
        .expect("oneshot");
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test(migrations = "./migrations")]
async fn baseline_security_headers_on_responses(pool: PgPool) {
    let app = build_http_app(test_app_state(pool.clone()));
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
