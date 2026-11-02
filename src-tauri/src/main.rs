#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod server;
mod system_ctrl;
mod tv_control;

pub use tv_control::*;

use config::{
    detect_lan_ip, detect_mdns_hostname, generate_qr_svg,
    load_channels, load_or_create_pairing_token, reset_pairing_token, ChannelItem,
};
use serde::Serialize;
use serde_json::json;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tokio::sync::broadcast;

pub type SharedState = Arc<AppState>;

pub struct AppState {
    pub port: u16,
    pub pairing_token: Mutex<String>,
    pub channels: Mutex<Vec<ChannelItem>>,
    pub current_title: Mutex<String>,
    pub current_url: Mutex<String>,
    pub connected_clients: AtomicUsize,
    pub broadcast_tx: broadcast::Sender<String>,
    pub app_handle: Mutex<Option<AppHandle>>,
}

impl AppState {
    pub fn new(port: u16) -> Self {
        let token = load_or_create_pairing_token();
        let channels = load_channels();
        let (tx, _) = broadcast::channel(64);
        Self {
            port,
            pairing_token: Mutex::new(token),
            channels: Mutex::new(channels),
            current_title: Mutex::new("待機首頁".to_string()),
            current_url: Mutex::new(String::new()),
            connected_clients: AtomicUsize::new(0),
            broadcast_tx: tx,
            app_handle: Mutex::new(None),
        }
    }

    pub fn get_token(&self) -> String {
        self.pairing_token
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    pub fn build_state_sync_json(&self) -> String {
        let channels = self
            .channels
            .lock()
            .map(|c| c.clone())
            .unwrap_or_default();
        let title = self
            .current_title
            .lock()
            .map(|t| t.clone())
            .unwrap_or_else(|_| "待機首頁".to_string());
        let url = self
            .current_url
            .lock()
            .map(|u| u.clone())
            .unwrap_or_default();

        json!({
            "type": "state_sync",
            "current_title": title,
            "current_url": url,
            "channels": channels,
        })
        .to_string()
    }

    pub fn broadcast_state(&self) {
        let msg = self.build_state_sync_json();
        let _ = self.broadcast_tx.send(msg);
    }

    pub fn get_main_window(&self) -> Option<WebviewWindow> {
        let handle = self.app_handle.lock().ok()?.clone()?;
        handle.get_webview_window("main")
    }
}

#[derive(Serialize)]
struct StbDashboardInfo {
    base_url: String,
    mdns_url: String,
    pairing_url: String,
    qr_svg: String,
    connected_clients: usize,
    channels: Vec<ChannelItem>,
}

#[tauri::command]
fn get_stb_info(state: tauri::State<'_, SharedState>) -> StbDashboardInfo {
    let ip = detect_lan_ip();
    let host = detect_mdns_hostname();
    let port = state.port;
    let token = state.get_token();

    let base_url = format!("http://{}:{}", ip, port);
    let mdns_url = format!("http://{}.local:{}", host, port);
    let pairing_url = format!("{}/?token={}", base_url, urlencoding::encode(&token));
    let qr_svg = generate_qr_svg(&pairing_url);
    let connected_clients = state.connected_clients.load(Ordering::SeqCst);
    let channels = state
        .channels
        .lock()
        .map(|c| c.clone())
        .unwrap_or_default();

    StbDashboardInfo {
        base_url,
        mdns_url,
        pairing_url,
        qr_svg,
        connected_clients,
        channels,
    }
}

#[tauri::command]
fn launch_channel(channel_id: String, state: tauri::State<'_, SharedState>) {
    handle_remote_command(
        &state,
        json!({
            "action": "launch_channel",
            "channel_id": channel_id
        }),
    );
}

#[tauri::command]
fn search_youtube(query: String, autoplay: bool, state: tauri::State<'_, SharedState>) {
    handle_remote_command(
        &state,
        json!({
            "action": "search_youtube",
            "query": query,
            "autoplay": autoplay
        }),
    );
}

#[tauri::command]
fn minimize_to_desktop(state: tauri::State<'_, SharedState>) {
    minimize_tv_window(&state);
}

fn setup_tray(app: &AppHandle, state: SharedState) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show_tv", "📺 顯示電視畫面 (喚醒)", true, None::<&str>)?;
    let home_item = MenuItem::with_id(
        app,
        "go_home",
        "📱 顯示手機配對 QR Code (待機首頁)",
        true,
        None::<&str>,
    )?;
    let reset_item = MenuItem::with_id(
        app,
        "reset_token",
        "🔄 重置遙控器配對碼",
        true,
        None::<&str>,
    )?;
    let hide_item = MenuItem::with_id(
        app,
        "hide_tv",
        "🚪 退回桌面待命 (最小化)",
        true,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, "quit", "❌ 完全結束程式", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&show_item, &home_item, &reset_item, &hide_item, &quit_item],
    )?;

    let state_for_menu = state.clone();
    let state_for_click = state.clone();

    let mut tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("客廳電視盒 (STB) - 背景待命中")
        .on_menu_event(move |app_handle, event| match event.id.as_ref() {
            "show_tv" => {
                wake_tv_window(&state_for_menu);
            }
            "go_home" => {
                go_home_screen(&state_for_menu);
            }
            "reset_token" => {
                let new_token = reset_pairing_token();
                if let Ok(mut guard) = state_for_menu.pairing_token.lock() {
                    *guard = new_token;
                }
                let _ = state_for_menu
                    .broadcast_tx
                    .send(r#"{"type":"auth_error"}"#.to_string());
                go_home_screen(&state_for_menu);
                show_tv_osd(
                    &state_for_menu,
                    "🔄 配對碼已更新！請用手機重新掃描 QR Code",
                );
            }
            "hide_tv" => {
                minimize_tv_window(&state_for_menu);
            }
            "quit" => {
                system_ctrl::set_keep_awake(false);
                app_handle.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(move |_tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                wake_tv_window(&state_for_click);
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    tray_builder.build(app)?;
    Ok(())
}

fn main() {
    let port: u16 = std::env::var("STB_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8765);

    let shared_state = Arc::new(AppState::new(port));
    let state_for_setup = shared_state.clone();

    tauri::Builder::default()
        .manage(shared_state)
        .invoke_handler(tauri::generate_handler![
            get_stb_info,
            launch_channel,
            search_youtube,
            minimize_to_desktop,
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();
            if let Ok(mut guard) = state_for_setup.app_handle.lock() {
                *guard = Some(app_handle.clone());
            }

            // 建立主電視視窗，注入 YouTube 自動跳廣告與 OSD 腳本，並開放自動有聲播放
            let mut win_builder =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("客廳電視盒 (STB) - 待機首頁")
                    .inner_size(1280.0, 720.0)
                    .maximized(true)
                    .initialization_script(include_str!("youtube_helper.js"));

            #[cfg(windows)]
            {
                win_builder = win_builder
                    .additional_browser_args("--autoplay-policy=no-user-gesture-required");
            }

            let window = win_builder.build()?;

            // 攔截視窗關閉按鈕：最小化退回系統匣待命，確保長輩隨時可用手機喚醒
            let state_for_close = state_for_setup.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    minimize_tv_window(&state_for_close);
                }
            });

            // 啟動系統防休眠與系統匣常駐圖示
            system_ctrl::set_keep_awake(true);
            let _ = setup_tray(&app_handle, state_for_setup.clone());

            // 啟動內網 Axum HTTP / WebSocket 遙控器伺服器
            let state_for_server = state_for_setup.clone();
            tauri::async_runtime::spawn(async move {
                server::start_axum_server(state_for_server, port).await;
            });

            // 啟動背景 Esc 鍵與標題同步監控
            spawn_background_monitors(state_for_setup.clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("啟動 STB 客廳電視盒應用程式失敗");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{build_channel_url, build_search_url};
    #[test]
    fn test_pairing_token_generation_and_persistence() {
        let token1 = load_or_create_pairing_token();
        assert!(token1.len() >= 16);
        let token2 = load_or_create_pairing_token();
        assert_eq!(token1, token2, "持久化 Token 重複讀取應保持一致，免除長輩重掃 QR Code");
    }

    #[test]
    fn test_qr_svg_generation() {
        let svg = generate_qr_svg("http://192.168.1.100:8765/?token=testDummyToken123456");
        assert!(svg.contains("<svg"));
        assert!(svg.contains("</svg>"));
    }

    #[test]
    fn test_channel_and_search_url_builders() {
        let live_ch = ChannelItem {
            id: "ttv".into(),
            name: "台視新聞".into(),
            icon: "📰".into(),
            mode: "live_search".into(),
            target: "台視新聞 24小時直播".into(),
            custom: false,
        };
        let url = build_channel_url(&live_ch);
        assert!(url.starts_with("https://www.youtube.com/results?search_query="));
        assert!(url.contains("stb_autoplay=1"));
        assert!(url.contains("stb_live=1"));

        let search_url = build_search_url("包青天", true);
        assert!(search_url.contains("stb_autoplay=1"));
        let list_url = build_search_url("包青天", false);
        assert!(list_url.contains("stb_autoplay=0"));
    }

    #[test]
    fn test_default_channels_loaded() {
        let channels = load_channels();
        assert!(!channels.is_empty());
        assert!(channels.iter().any(|c| c.name.contains("台視新聞")));
    }

    #[test]
    fn test_parse_skip_coords_from_title() {
        let title = "台視新聞 - YouTube [STB_SKIP:0.9350,0.8650]";
        let coords = parse_skip_coords_from_title(title).expect("應成功解析跳過廣告按鈕座標比例");
        assert!((coords.0 - 0.9350).abs() < 1e-4);
        assert!((coords.1 - 0.8650).abs() < 1e-4);
        assert_eq!(strip_skip_marker(title), "台視新聞 - YouTube");
    }

    #[test]
    fn test_save_and_delete_custom_favorite_channel() {
        let state = Arc::new(AppState::new(8765));
        let before_len = state.channels.lock().unwrap().len();

        handle_remote_command(
            &state,
            json!({
                "action": "save_favorite",
                "name": "測試長輩最愛老歌",
                "fallback_query": "費玉清精選"
            }),
        );

        let custom_id = {
            let list = state.channels.lock().unwrap();
            assert_eq!(list.len(), before_len + 1);
            let added = list.last().unwrap();
            assert_eq!(added.name, "測試長輩最愛老歌");
            assert!(added.custom);
            added.id.clone()
        };

        handle_remote_command(
            &state,
            json!({
                "action": "delete_channel",
                "channel_id": custom_id
            }),
        );

        let after_len = state.channels.lock().unwrap().len();
        assert_eq!(after_len, before_len);
    }

    #[tokio::test]
    async fn test_pwa_http_endpoints() {
        let state = Arc::new(AppState::new(0));
        let app = server::build_router(state);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });

        // 透過標準 TCP stream 驗證內嵌 PWA 首頁與 manifest 正常回應 200 OK
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
