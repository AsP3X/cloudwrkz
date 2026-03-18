use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ErrorEnvelope {
    pub error: ErrorBody,
}

#[derive(Debug, Serialize)]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<serde_json::Value>,
}

#[derive(Debug)]
pub struct AppError {
    pub status: StatusCode,
    pub code: String,
    pub message: String,
    pub fields: Option<serde_json::Value>,
}

impl AppError {
    pub fn unauthorized(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            code: "UNAUTHORIZED".into(),
            message: msg.into(),
            fields: None,
        }
    }

    pub fn forbidden(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            code: "FORBIDDEN".into(),
            message: msg.into(),
            fields: None,
        }
    }

    pub fn not_found(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            code: "NOT_FOUND".into(),
            message: msg.into(),
            fields: None,
        }
    }

    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: "BAD_REQUEST".into(),
            message: msg.into(),
            fields: None,
        }
    }

    pub fn validation(msg: impl Into<String>, fields: serde_json::Value) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: "VALIDATION_ERROR".into(),
            message: msg.into(),
            fields: Some(fields),
        }
    }

    pub fn conflict(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            code: "CONFLICT".into(),
            message: msg.into(),
            fields: None,
        }
    }

    pub fn too_many_requests(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::TOO_MANY_REQUESTS,
            code: "RATE_LIMIT".into(),
            message: msg.into(),
            fields: None,
        }
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "INTERNAL_ERROR".into(),
            message: msg.into(),
            fields: None,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let body = ErrorEnvelope {
            error: ErrorBody {
                code: self.code,
                message: self.message,
                fields: self.fields,
            },
        };
        (self.status, Json(body)).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        tracing::error!("Database error: {:?}", err);
        Self::internal("A database error occurred")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation_error_has_fields() {
        let e = AppError::validation("Invalid", serde_json::json!({"x": ["required"]}));
        assert_eq!(e.code, "VALIDATION_ERROR");
        assert_eq!(e.message, "Invalid");
        assert!(e.fields.is_some());
    }
}
