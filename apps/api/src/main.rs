// Human: The binary entrypoint only forwards to the library `run()` so integration tests and the server share one startup path.
// Agent: TOKIO main; AWAITS cloudwrkz_api::run; EXITS when server shuts down.
#[tokio::main]
async fn main() {
    cloudwrkz_api::run().await;
}
