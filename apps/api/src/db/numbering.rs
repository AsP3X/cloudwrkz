use sqlx::{Postgres, Transaction};

// Human: Human-readable ticket and todo numbers come from Postgres sequences so concurrent creates never collide inside a transaction.
// Agent: MODULE provides next_ticket_number and next_todo_number; BOTH use nextval + zero-padded format! on open tx.

pub async fn next_ticket_number(tx: &mut Transaction<'_, Postgres>) -> Result<String, sqlx::Error> {
    // Human: Ticket numbers are stable public identifiers (`TSK-000123`) chosen inside the same DB transaction as the insert.
    // Agent: READS nextval('ticket_number_seq'); RETURNS TSK- + 6-digit zero-padded i64.
    let n: i64 = sqlx::query_scalar("SELECT nextval('ticket_number_seq')")
        .fetch_one(&mut **tx)
        .await?;
    Ok(format!("TSK-{n:06}"))
}

// Human: Allocates the next monotonic todo display number while holding the surrounding DB transaction.
// Agent: READS nextval('todo_number_seq'); RETURNS formatted #TDO- string; WRITES nothing beyond sequence advance.

pub async fn next_todo_number(tx: &mut Transaction<'_, Postgres>) -> Result<String, sqlx::Error> {
    let n: i64 = sqlx::query_scalar("SELECT nextval('todo_number_seq')")
        .fetch_one(&mut **tx)
        .await?;
    Ok(format!("#TDO-{n:06}"))
}
