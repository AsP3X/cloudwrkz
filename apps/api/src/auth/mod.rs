// Human: This module tree holds everything HTTP handlers need to authenticate users and run queued auth work in the background.
// Agent: RE-EXPORTS session tokens, Axum extractors, login/register/QR queues, password hashing, and QR execute helpers.
pub mod bg_job_record;
pub mod extractors;
pub mod login_queue;
pub mod password;
pub mod qr_finalize_queue;
pub mod qr_login_execute;
pub mod register_queue;
pub mod session;
