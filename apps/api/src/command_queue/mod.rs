//! Per-node ordered mutation queue with bounded per-shard workers and optional idempotency.

mod broker;
mod idempotency;
mod mutation_jobs;

pub use broker::{JsonMutationResult, MutationBroker, MutationRunContext};
pub use idempotency::IdempotencyStore;
pub use mutation_jobs::{
    mutation_response, run_mutation_defer, MutationHandlerOutput, MutationJobStatusResponse,
    MutationJobs,
};

/// `SET LOCAL` for queued write transactions: lock wait + statement cap (session ends at COMMIT).
pub async fn apply_mutation_tx_settings(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    lock_timeout_ms: u64,
    statement_timeout_ms: u64,
) -> Result<(), sqlx::Error> {
    let lock_ms = lock_timeout_ms.clamp(100, 120_000);
    let stmt_ms = statement_timeout_ms.clamp(100, 600_000);
    let lock = format!("{lock_ms}ms");
    let stmt = format!("{stmt_ms}ms");
    sqlx::query(&format!("SET LOCAL lock_timeout = '{lock}'"))
        .execute(&mut **tx)
        .await?;
    sqlx::query(&format!("SET LOCAL statement_timeout = '{stmt}'"))
        .execute(&mut **tx)
        .await?;
    Ok(())
}
