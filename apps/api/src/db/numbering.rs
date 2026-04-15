use sqlx::{Postgres, Transaction};

pub async fn next_ticket_number(tx: &mut Transaction<'_, Postgres>) -> Result<String, sqlx::Error> {
    let n: i64 = sqlx::query_scalar("SELECT nextval('ticket_number_seq')")
        .fetch_one(&mut **tx)
        .await?;
    Ok(format!("TSK-{n:06}"))
}

pub async fn next_todo_number(tx: &mut Transaction<'_, Postgres>) -> Result<String, sqlx::Error> {
    let n: i64 = sqlx::query_scalar("SELECT nextval('todo_number_seq')")
        .fetch_one(&mut **tx)
        .await?;
    Ok(format!("#TDO-{n:06}"))
}
