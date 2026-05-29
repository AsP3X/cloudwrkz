use axum::{
    Router,
    extract::Path,
    http::{StatusCode, header},
    response::IntoResponse,
    routing::get,
};

use crate::error::AppError;
use crate::link_preview::favicons_dir;
use crate::routes::AppState;

// Human: Serves uploaded favicon bytes saved on disk for link previews; failures return the same JSON error envelope as other `/api/v1` routes.
// Agent: GET /favicons/{filename}; READS public/uploads/favicons after stripping .. and /; HTTP 200 + Content-Type + bytes OR AppError NOT_FOUND JSON.

pub fn router() -> Router<AppState> {
    Router::new().route("/favicons/{filename}", get(serve_favicon))
}

async fn serve_favicon(Path(filename): Path<String>) -> impl IntoResponse {
    // Human: Path segments are sanitized so a crafted filename cannot escape the favicon upload directory.
    // Agent: REPLACES ".." and "/" in filename; BUILDS path under public/uploads/favicons; READS file async.
    let safe_name = filename.replace("..", "").replace('/', "");
    let path = favicons_dir().join(&safe_name);

    match tokio::fs::read(&path).await {
        Ok(bytes) => {
            // Human: Content-Type is inferred from the file extension so browsers render icons instead of downloading octet-stream blindly.
            // Agent: BRANCHES on .ico / .png / .svg suffix of safe_name; DEFAULT application/octet-stream; RETURNS 200 + CONTENT_TYPE + body.
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
        Err(_) => {
            // Human: Missing files surface as structured `AppError` JSON instead of a plain-text body mixed into the versioned API.
            // Agent: MAPS fs read failure to NOT_FOUND; MESSAGE "Favicon not found"; NO stack details in body.
            AppError::not_found("Favicon not found").into_response()
        }
    }
}
