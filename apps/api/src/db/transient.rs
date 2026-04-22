//! Classify sqlx errors that are worth retrying when the database is briefly unavailable.
//! Used by [`crate::auth::login_queue`] and [`crate::auth::register_queue`] background jobs
//! (in addition to always-async POST /auth/login and /auth/register).

// Human: Only specific driver/Postgres signals count as transient so we do not retry deterministic SQL mistakes forever.
// Agent: MATCHES sqlx::Error variants PoolTimedOut, Io, Tls, Protocol; DB branch READS db.code() against SQLSTATE retry list.

pub fn is_transient_sqlx(err: &sqlx::Error) -> bool {
    match err {
        sqlx::Error::PoolTimedOut | sqlx::Error::Io(_) => true,
        sqlx::Error::Tls(_) => true,
        sqlx::Error::Database(db) => matches!(
            db.code().as_deref(),
            Some(
                "08000"
                    | "08003"
                    | "08006"
                    | "08001"
                    | "08004"
                    | "57P01"
                    | "57P02"
                    | "57P03"
                    | "53300"
                    | "40001"
                    | "40P01"
            )
        ),
        // Protocol / connection closed mid-flight
        sqlx::Error::Protocol(_) => true,
        _ => false,
    }
}
