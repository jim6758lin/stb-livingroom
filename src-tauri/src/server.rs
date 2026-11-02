use crate::{handle_remote_command, SharedState};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{header, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::net::SocketAddr;
use std::sync::atomic::Ordering;

const REMOTE_INDEX_HTML: &str = include_str!("../../remote/index.html");
const REMOTE_STYLE_CSS: &str = include_str!("../../remote/style.css");
const REMOTE_APP_JS: &str = include_str!("../../remote/app.js");
const REMOTE_MANIFEST_JSON: &str = include_str!("../../remote/manifest.json");
const REMOTE_SW_JS: &str = include_str!("../../remote/sw.js");
const REMOTE_ICON_SVG: &str = include_str!("../../remote/icon.svg");
const REMOTE_ICON_192_PNG: &[u8] = include_bytes!("../../remote/icon-192.png");
const REMOTE_ICON_512_PNG: &[u8] = include_bytes!("../../remote/icon-512.png");

#[derive(Deserialize, Default)]
pub struct WsAuthQuery {
    pub token: Option<String>,
}

pub fn build_router(state: SharedState) -> Router {
    Router::new()
        .route("/", get(serve_index))
        .route("/index.html", get(serve_index))
        .route("/style.css", get(serve_css))
        .route("/app.js", get(serve_js))
        .route("/manifest.json", get(serve_manifest))
        .route("/sw.js", get(serve_sw))
        .route("/icon.svg", get(serve_icon))
        .route("/icon-192.png", get(serve_icon_192))
        .route("/icon-512.png", get(serve_icon_512))
        .route("/ws", get(ws_handler))
        .with_state(state)
        .layer(axum::middleware::from_fn(add_security_headers))
}

pub async fn start_axum_server(state: SharedState, port: u16) {
    let app = build_router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => {
            tracing::info!("remote server listening on port {}", port);
            if let Err(err) = axum::serve(listener, app).await {
                tracing::error!("remote server failed on port {}: {}", port, err);
            }
        }
        Err(err) => {
            tracing::error!(
                "failed to bind remote server port {} ({}): {}",
                port, "possibly in use", err
            );
        }
    }
}

async fn serve_index() -> Html<&'static str> {
    Html(REMOTE_INDEX_HTML)
}

async fn serve_css() -> Response {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
        REMOTE_STYLE_CSS,
    )
        .into_response()
}

async fn serve_js() -> Response {
    (
        StatusCode::OK,
        [(
            header::CONTENT_TYPE,
            "application/javascript; charset=utf-8",
        )],
        REMOTE_APP_JS,
    )
        .into_response()
}

async fn serve_manifest() -> Response {
    (
        StatusCode::OK,
        [(
            header::CONTENT_TYPE,
            "application/manifest+json; charset=utf-8",
        )],
        REMOTE_MANIFEST_JSON,
    )
        .into_response()
}

async fn serve_sw() -> Response {
    (
        StatusCode::OK,
        [(
            header::CONTENT_TYPE,
            "application/javascript; charset=utf-8",
        )],
        REMOTE_SW_JS,
    )
        .into_response()
}

async fn serve_icon() -> Response {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "image/svg+xml")],
        REMOTE_ICON_SVG,
    )
        .into_response()
}

async fn serve_icon_192() -> Response {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "image/png")],
        REMOTE_ICON_192_PNG,
    )
        .into_response()
}

async fn serve_icon_512() -> Response {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "image/png")],
        REMOTE_ICON_512_PNG,
    )
        .into_response()
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsAuthQuery>,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    let provided = query.token.unwrap_or_default();
    ws.on_upgrade(move |socket| handle_ws_client(socket, provided, state))
}

async fn add_security_headers(
    req: axum::http::Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> Response {
    let mut res = next.run(req).await;
    let headers = res.headers_mut();
    let _ = headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        axum::http::HeaderValue::from_static("nosniff"),
    );
    let _ = headers.insert(
        header::HeaderName::from_static("content-security-policy"),
        axum::http::HeaderValue::from_static(
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self'; media-src 'self'",
        ),
    );
    res
}

async fn handle_ws_client(socket: WebSocket, provided_token: String, state: SharedState) {
    let expected_token = state.get_token();
    if provided_token.is_empty() || provided_token != expected_token {
        let (mut sender, _) = socket.split();
        let _ = sender
            .send(Message::Text(r#"{"type":"auth_error"}"#.to_string()))
            .await;
        let _ = sender.close().await;
        return;
    }

    state.connected_clients.fetch_add(1, Ordering::SeqCst);
    let mut rx = state.broadcast_tx.subscribe();
    let (mut sender, mut receiver) = socket.split();

    // 初次連入立即同步電視端狀態與常用頻道清單
    let initial_sync = state.build_state_sync_json();
    let _ = sender.send(Message::Text(initial_sync)).await;

    let send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    let state_clone = state.clone();
    while let Some(Ok(msg)) = receiver.next().await {
        if let Message::Text(text) = msg {
            if let Ok(cmd) = serde_json::from_str::<serde_json::Value>(&text) {
                handle_remote_command(&state_clone, cmd);
            }
        }
    }

    send_task.abort();
    state.connected_clients.fetch_sub(1, Ordering::SeqCst);
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::AppState;
    use std::sync::Arc;

    #[tokio::test]
    async fn test_pwa_http_endpoints() {
        let state = Arc::new(AppState::new(0));
        let app = build_router(state);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });

        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
        stream
            .write_all(b"GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).await.unwrap();
        let resp = String::from_utf8_lossy(&buf);
        assert!(resp.starts_with("HTTP/1.1 200 OK"));
        assert!(resp.contains("客廳電視遙控器"));
    }
}
