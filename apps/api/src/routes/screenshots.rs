use axum::{
    Router,
    extract::Path,
    http::{StatusCode, header},
    response::IntoResponse,
    routing::get,
};

use crate::error::AppError;
use crate::routes::AppState;

// Human: Serves prerendered link screenshot PNGs written by the website metadata scraper.
// Agent: GET /screenshots/{filename}; READS public/uploads/link-screenshots; SANITIZES filename; HTTP 200 image/png.

pub fn router() -> Router<AppState> {
    Router::new().route("/screenshots/{filename}", get(serve_screenshot))
}

async fn serve_screenshot(Path(filename): Path<String>) -> impl IntoResponse {
    let safe_name = filename.replace("..", "").replace('/', "");
    if !safe_name.starts_with("screenshot-") || !safe_name.ends_with(".png") {
        return AppError::not_found("Screenshot not found").into_response();
    }
    let path = std::path::Path::new("public/uploads/link-screenshots").join(&safe_name);

    match tokio::fs::read(&path).await {
        Ok(bytes) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "image/png")],
            bytes,
        )
            .into_response(),
        Err(_) => AppError::not_found("Screenshot not found").into_response(),
    }
}
