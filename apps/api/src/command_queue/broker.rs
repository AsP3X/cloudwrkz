use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use axum::http::StatusCode;
use sqlx::PgPool;
use tokio::sync::{mpsc, oneshot, Mutex};

use crate::error::AppError;

use super::idempotency::IdempotencyStore;

/// Serializable mutation outcome for JSON APIs (status + body).
#[derive(Clone, Debug)]
pub struct JsonMutationResult {
    pub status: StatusCode,
    pub body: serde_json::Value,
}

impl JsonMutationResult {
    pub fn new(status: StatusCode, body: serde_json::Value) -> Self {
        Self { status, body }
    }

    pub fn ok(body: serde_json::Value) -> Self {
        Self {
            status: StatusCode::OK,
            body,
        }
    }

    pub fn created(body: serde_json::Value) -> Self {
        Self {
            status: StatusCode::CREATED,
            body,
        }
    }
}

#[derive(Clone)]
pub struct MutationRunContext {
    pub user_id: String,
    pub route: String,
    pub idempotency_key: Option<String>,
    pub body_hash: u64,
}

struct Job {
    fut: Pin<Box<dyn Future<Output = Result<JsonMutationResult, AppError>> + Send>>,
    done: oneshot::Sender<Result<JsonMutationResult, AppError>>,
}

/// One FIFO worker per shard key; bounded channel; mutation wall-clock timeout.
#[derive(Clone)]
pub struct MutationBroker {
    shards: Arc<Mutex<HashMap<String, mpsc::Sender<Job>>>>,
    pub idempotency: IdempotencyStore,
    mutation_tx_max_ms: u64,
    pub lock_timeout_ms: u64,
    pub statement_timeout_ms: u64,
    queue_capacity: usize,
}

impl MutationBroker {
    pub fn new(
        idempotency: IdempotencyStore,
        mutation_tx_max_ms: u64,
        lock_timeout_ms: u64,
        statement_timeout_ms: u64,
        queue_capacity: usize,
    ) -> Self {
        Self {
            shards: Arc::new(Mutex::new(HashMap::new())),
            idempotency,
            mutation_tx_max_ms: mutation_tx_max_ms.clamp(1_000, 600_000),
            lock_timeout_ms: lock_timeout_ms.clamp(100, 120_000),
            statement_timeout_ms: statement_timeout_ms.clamp(100, 600_000),
            queue_capacity: queue_capacity.clamp(8, 65_536),
        }
    }

    async fn sender_for_shard(&self, key: String) -> Result<mpsc::Sender<Job>, AppError> {
        let mut map = self.shards.lock().await;
        if let Some(tx) = map.get(&key) {
            return Ok(tx.clone());
        }
        let (tx, rx) = mpsc::channel::<Job>(self.queue_capacity);
        let tx_ret = tx.clone();
        let max_ms = self.mutation_tx_max_ms;
        tokio::spawn(shard_worker(rx, max_ms));
        map.insert(key, tx_ret.clone());
        Ok(tx_ret)
    }

    pub async fn run<F, Fut>(
        &self,
        shard_key: impl Into<String>,
        pool: &PgPool,
        ctx: MutationRunContext,
        f: F,
    ) -> Result<JsonMutationResult, AppError>
    where
        F: FnOnce(PgPool) -> Fut + Send + 'static,
        Fut: Future<Output = Result<JsonMutationResult, AppError>> + Send + 'static,
    {
        if let Some(ref ik) = ctx.idempotency_key {
            if !ik.trim().is_empty() {
                if let Some(cached) = self
                    .idempotency
                    .get(&ctx.user_id, ik, &ctx.route, ctx.body_hash)
                    .await
                {
                    return Ok(cached);
                }
            }
        }

        let shard = shard_key.into();
        let shard_for_log = shard.clone();
        let pool = pool.clone();
        let (done_tx, done_rx) = oneshot::channel();
        let max_ms = self.mutation_tx_max_ms;
        let fut: Pin<Box<dyn Future<Output = Result<JsonMutationResult, AppError>> + Send>> =
            Box::pin(async move {
                let lock_started = std::time::Instant::now();
                tracing::debug!(
                    event = "mutation.execute",
                    shard = %shard_for_log,
                    "mutation started"
                );
                let out = tokio::time::timeout(Duration::from_millis(max_ms), f(pool)).await;
                let res = match out {
                    Ok(inner) => inner,
                    Err(_) => Err(AppError::gateway_timeout(
                        "Database mutation timed out; please retry.",
                    )),
                };
                tracing::debug!(
                    event = "mutation.done",
                    shard = %shard_for_log,
                    elapsed_ms = lock_started.elapsed().as_millis() as u64,
                    ok = res.is_ok(),
                    "mutation finished"
                );
                res
            });

        let job = Job {
            fut,
            done: done_tx,
        };

        let sender = self.sender_for_shard(shard).await?;
        sender
            .send(job)
            .await
            .map_err(|_| AppError::service_unavailable("Mutation queue is full; try again."))?;

        let result = done_rx
            .await
            .map_err(|_| AppError::internal("Mutation worker stopped"))?;

        if let Ok(ref ok) = result {
            if ok.status.is_success() {
                if let Some(ref ik) = ctx.idempotency_key {
                    if !ik.trim().is_empty() {
                        self.idempotency
                            .put(
                                &ctx.user_id,
                                ik,
                                &ctx.route,
                                ctx.body_hash,
                                ok.clone(),
                            )
                            .await;
                    }
                }
            }
        }

        result
    }
}

async fn shard_worker(mut rx: mpsc::Receiver<Job>, _max_ms: u64) {
    while let Some(Job { fut, done }) = rx.recv().await {
        let res = fut.await;
        let _ = done.send(res);
    }
}
