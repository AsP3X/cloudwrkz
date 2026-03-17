use axum::{
    extract::Path,
    http::{header, StatusCode},
    response::IntoResponse,
    routing::get,
    Router,
};

use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/favicons/{filename}", get(serve_favicon))
}

async fn serve_favicon(Path(filename): Path<String>) -> impl IntoResponse {
    let safe_name = filename.replace("..", "").replace('/', "");
    let path = std::path::Path::new("public/uploads/favicons").join(&safe_name);

    match tokio::fs::read(&path).await {
        Ok(bytes) => {
            let content_type = if safe_name.ends_with(".ico") {
                "image/x-icon"
            } else if safe_name.ends_with(".png") {
                "image/png"
            } else if safe_name.ends_with(".svg") {
                "image/svg+xml"
            } else {
                "application/octet-stream"
            };

            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, content_type)],
                bytes,
            )
                .into_response()
        }
        Err(_) => (StatusCode::NOT_FOUND, "Not found").into_response(),
    }
}
