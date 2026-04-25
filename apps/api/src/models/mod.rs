// Human: ORM-facing structs for rows the API reads or writes; each submodule maps to a domain table or view shape.
// Agent: RE-EXPORTS serde/sqlx row types for audit, employees, links, tickets, todos, time entries, users, notifications.
pub mod audit_log;
pub mod link;
pub mod notification;
pub mod ticket;
pub mod time_entry;
pub mod todo;
pub mod user;
