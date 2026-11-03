use crate::{
    config::{build_channel_url, ChannelItem},
    system_ctrl, SharedState,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub fn wake_tv_window(state: &SharedState) {
    system_ctrl::set_keep_awake(true);
    if let Some(win) = state.get_main_window() {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.maximize();
        let _ = win.set_focus();
    }
}

pub fn minimize_tv_window(state: &SharedState) {
    system_ctrl::set_keep_awake(false);
    if let Some(win) = state.get_main_window() {
        let _ = win.eval(
            "try { const v = document.querySelector('video'); if (v && !v.paused) v.pause(); } catch(e) {}",
        );
        let _ = win.set_fullscreen(false);
        let _ = win.minimize();
    }
}

pub fn show_tv_osd(state: &SharedState, message: &str) {
    if let Some(win) = state.get_main_window() {
        if let Ok(escaped) = serde_json::to_string(message) {
            let js = format!(
                "if (window.__STB_OSD__) {{ window.__STB_OSD__.show({}); }}",
                escaped
            );
            let _ = win.eval(&js);
        }
    }
}

pub fn navigate_tv(state: &SharedState, url_str: &str, title_hint: &str) {
    wake_tv_window(state);
    if let Ok(mut t) = state.current_title.lock() {
        *t = title_hint.to_string();
    }
    if let Ok(mut u) = state.current_url.lock() {
        *u = url_str.to_string();
    }
    state.broadcast_state();

    if let Some(win) = state.get_main_window() {
        if let Ok(parsed) = url_str.parse::<tauri::Url>() {
            let _ = win.navigate(parsed);
        }
    }
}

pub fn go_home_screen(state: &SharedState) {
    wake_tv_window(state);
    if let Ok(mut t) = state.current_title.lock() {
        *t = "待機首頁".to_string();
    }
    if let Ok(mut u) = state.current_url.lock() {
        u.clear();
    }
    state.broadcast_state();

    if let Some(win) = state.get_main_window() {
        let _ = win.eval("window.location.replace('http://tauri.localhost/index.html');");
        if let Ok(parsed) = "tauri://localhost/index.html".parse::<tauri::Url>() {
            let _ = win.navigate(parsed);
        }
    }
}

pub fn handle_remote_command(state: &SharedState, cmd: serde_json::Value) {
    let action = cmd
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    match action {
        "wake_tv" => {
            wake_tv_window(state);
            show_tv_osd(state, "📺 電視畫面已喚醒");
        }
        "launch_channel" => {
            let channel_id = cmd
                .get("channel_id")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let found = state
                .channels
                .lock()
                .ok()
                .and_then(|list| list.iter().find(|c| c.id == channel_id).cloned());

            if let Some(ch) = found {
                let target_url = build_channel_url(&ch);
                navigate_tv(state, &target_url, &ch.name);
                show_tv_osd(state, &format!("📺 正在切換：{}", ch.name));
            }
        }
        "search_youtube" => {
            let query = cmd
                .get("query")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .trim();
            let autoplay = cmd
                .get("autoplay")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            if !query.is_empty() {
                let target_url = crate::config::build_search_url(query, autoplay);
                navigate_tv(state, &target_url, &format!("搜尋：{}", query));
                show_tv_osd(state, &format!("🔍 搜尋：{}", query));
            }
        }
        "toggle_play" => {
            wake_tv_window(state);
            if let Some(win) = state.get_main_window() {
                let _ = win.eval("window.__STB_CTRL__ && window.__STB_CTRL__.togglePlay();");
            }
        }
        "skip_ad" => {
            wake_tv_window(state);
            if let Some(win) = state.get_main_window() {
                let _ =
                    win.eval("window.__STB_CTRL__ && window.__STB_CTRL__.prepareSkipAdClick();");
                let win_clone = win.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_millis(75)).await;
                    let title = win_clone.title().unwrap_or_default();
                    let (rx, ry) = parse_skip_coords_from_title(&title).unwrap_or((0.935, 0.865));
                    if let (Ok(pos), Ok(size)) =
                        (win_clone.inner_position(), win_clone.inner_size())
                    {
                        let target_x = pos.x + (size.width as f64 * rx).round() as i32;
                        let target_y = pos.y + (size.height as f64 * ry).round() as i32;
                        system_ctrl::click_screen_point(target_x, target_y);
                    }
                });
            }
        }
        "volume_up" => {
            system_ctrl::volume_up();
            show_tv_osd(state, "🔊 系統音量調大");
        }
        "volume_down" => {
            system_ctrl::volume_down();
            show_tv_osd(state, "🔉 系統音量調小");
        }
        "volume_mute" => {
            system_ctrl::volume_mute();
            show_tv_osd(state, "🔇 系統靜音切換");
        }
        "seek" => {
            let seconds = cmd.get("seconds").and_then(|v| v.as_i64()).unwrap_or(10);
            if let Some(win) = state.get_main_window() {
                let _ = win.eval(&format!(
                    "window.__STB_CTRL__ && window.__STB_CTRL__.seek({});",
                    seconds
                ));
            }
        }
        "change_speed" => {
            let mode = cmd
                .get("mode")
                .and_then(|v| v.as_str())
                .unwrap_or("normal");
            let safe_mode = match mode {
                "slower" => "slower",
                "faster" => "faster",
                _ => "normal",
            };
            wake_tv_window(state);
            if let Some(win) = state.get_main_window() {
                let _ = win.eval(&format!(
                    "window.__STB_CTRL__ && window.__STB_CTRL__.changeSpeed('{}');",
                    safe_mode
                ));
            }
        }
        "toggle_subtitles" => {
            wake_tv_window(state);
            if let Some(win) = state.get_main_window() {
                let _ = win.eval("window.__STB_CTRL__ && window.__STB_CTRL__.toggleSubtitles();");
            }
        }
        "toggle_fullscreen" => {
            wake_tv_window(state);
            if let Some(win) = state.get_main_window() {
                let is_fs = win.is_fullscreen().unwrap_or(false);
                let _ = win.set_fullscreen(!is_fs);
                let _ = win.eval("window.__STB_CTRL__ && window.__STB_CTRL__.toggleFullscreen();");
            }
        }
        "select_video" => {
            let index = cmd.get("index").and_then(|v| v.as_u64()).unwrap_or(1);
            wake_tv_window(state);
            if let Some(win) = state.get_main_window() {
                let _ = win.eval(&format!(
                    "window.__STB_CTRL__ && window.__STB_CTRL__.selectVideoByIndex({});",
                    index
                ));
            }
        }
        "move_focus" => {
            let dir = cmd
                .get("dir")
                .and_then(|v| v.as_str())
                .unwrap_or("down");
            let safe_dir = match dir {
                "up" => "up",
                "left" => "left",
                "right" => "right",
                _ => "down",
            };
            wake_tv_window(state);
            if let Some(win) = state.get_main_window() {
                let _ = win.eval(&format!(
                    "window.__STB_CTRL__ && window.__STB_CTRL__.moveFocus('{}');",
                    safe_dir
                ));
            }
        }
        "activate_focused" => {
            wake_tv_window(state);
            if let Some(win) = state.get_main_window() {
                let _ = win.eval("window.__STB_CTRL__ && window.__STB_CTRL__.activateFocused();");
            }
        }
        "scroll" => {
            let delta = cmd.get("delta").and_then(|v| v.as_i64()).unwrap_or(500);
            if let Some(win) = state.get_main_window() {
                let _ = win.eval(&format!(
                    "window.__STB_CTRL__ && window.__STB_CTRL__.scrollPage({});",
                    delta
                ));
            }
        }
        "save_favorite" => {
            let name = cmd
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .trim();
            let fallback_query = cmd
                .get("fallback_query")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .trim();

            if !name.is_empty() {
                let current_url = state
                    .current_url
                    .lock()
                    .map(|u| u.clone())
                    .unwrap_or_default();

                let (mode, target) = if current_url.contains("youtube.com/watch") {
                    ("direct_url".to_string(), current_url)
                } else if !fallback_query.is_empty() {
                    ("search_play".to_string(), fallback_query.to_string())
                } else {
                    ("search_play".to_string(), name.to_string())
                };

                let ts = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis())
                    .unwrap_or(0);
                let new_item = ChannelItem {
                    id: format!("custom-{}", ts),
                    name: name.to_string(),
                    icon: "⭐".to_string(),
                    mode,
                    target,
                    custom: true,
                };

                if let Ok(mut list) = state.channels.lock() {
                    list.push(new_item);
                    crate::config::save_channels(&list);
                }
                state.broadcast_state();
                show_tv_osd(state, &format!("⭐ 已加入常用頻道：{}", name));
            }
        }
        "delete_channel" => {
            let channel_id = cmd
                .get("channel_id")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            if !channel_id.is_empty() {
                if let Ok(mut list) = state.channels.lock() {
                    list.retain(|c| c.id != channel_id);
                    crate::config::save_channels(&list);
                }
                state.broadcast_state();
                show_tv_osd(state, "🗑 已刪除自訂頻道");
            }
        }
        "go_home" => {
            go_home_screen(state);
            show_tv_osd(state, "🏠 已返回電視待機首頁");
        }
        "minimize_to_desktop" => {
            minimize_tv_window(state);
        }
        _ => {}
    }
}

pub fn parse_skip_coords_from_title(title: &str) -> Option<(f64, f64)> {
    let start_marker = "[STB_SKIP:";
    let start = title.find(start_marker)? + start_marker.len();
    let rest = &title[start..];
    let end = rest.find(']')?;
    let pair = &rest[..end];
    let mut parts = pair.split(',');
    let rx: f64 = parts.next()?.trim().parse().ok()?;
    let ry: f64 = parts.next()?.trim().parse().ok()?;
    if (0.01..=1.0).contains(&rx) && (0.01..=1.0).contains(&ry) {
        Some((rx, ry))
    } else {
        None
    }
}

pub fn strip_skip_marker(title: &str) -> String {
    let mut s = title.to_string();
    if let Some(idx) = s.find("[STB_SKIP:") {
        s = s[..idx].trim().to_string();
    }
    if let Some(idx) = s.find("[STB_CMD:EXIT]") {
        s = s[..idx].trim().to_string();
    }
    s
}

pub fn spawn_background_monitors(state: SharedState) {
    let state_esc = state.clone();
    tauri::async_runtime::spawn(async move {
        let mut was_pressed = false;
        loop {
            tokio::time::sleep(Duration::from_millis(100)).await;
            let pressed = system_ctrl::is_escape_pressed();
            if let Some(win) = state_esc.get_main_window() {
                let title = win.title().unwrap_or_default();
                if title.contains("[STB_CMD:EXIT]") {
                    let _ = win.eval(
                        "document.title = document.title.replace(/\\s*\\[STB_CMD:EXIT\\]/g, '');",
                    );
                    minimize_tv_window(&state_esc);
                    continue;
                }
                if pressed && !was_pressed {
                    let is_focused = win.is_focused().unwrap_or(false);
                    let is_minimized = win.is_minimized().unwrap_or(false);
                    if is_focused && !is_minimized {
                        minimize_tv_window(&state_esc);
                    }
                }
            }
            was_pressed = pressed;
        }
    });

    let state_sync = state.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(1500)).await;
            if let Some(win) = state_sync.get_main_window() {
                let url_str = win.url().map(|u| u.to_string()).unwrap_or_default();
                let raw_title = strip_skip_marker(&win.title().unwrap_or_default());

                let clean_title = if url_str.contains("tauri.localhost")
                    || url_str.starts_with("tauri://")
                    || raw_title.contains("待機首頁")
                {
                    "待機首頁".to_string()
                } else if !raw_title.trim().is_empty() {
                    raw_title
                        .replace(" - YouTube", "")
                        .trim()
                        .to_string()
                } else {
                    "電視播放中".to_string()
                };

                let mut changed = false;
                if let Ok(mut t) = state_sync.current_title.lock() {
                    if *t != clean_title {
                        *t = clean_title;
                        changed = true;
                    }
                }
                if let Ok(mut u) = state_sync.current_url.lock() {
                    if *u != url_str {
                        *u = url_str;
                        changed = true;
                    }
                }
                if changed {
                    state_sync.broadcast_state();
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AppState;
    use serde_json::json;
    use std::sync::Arc;

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
}
