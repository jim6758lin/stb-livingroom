use qrcode::render::svg;
use qrcode::QrCode;
use rand::distributions::Alphanumeric;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::net::UdpSocket;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelItem {
    pub id: String,
    pub name: String,
    pub icon: String,
    /// "live_search" | "search_play" | "direct_url"
    pub mode: String,
    pub target: String,
    pub custom: bool,
}

pub fn get_app_data_dir() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(std::env::temp_dir);
    let dir = base.join("com.stb.livingroom");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn load_or_create_pairing_token() -> String {
    if let Ok(env_token) = std::env::var("STB_PAIRING_TOKEN") {
        let trimmed = env_token.trim();
        if !trimmed.is_empty() && trimmed != "YOUR_CUSTOM_TOKEN_HERE" {
            return trimmed.to_string();
        }
    }

    let token_path = get_app_data_dir().join("pairing_token.txt");
    if let Ok(existing) = fs::read_to_string(&token_path) {
        let trimmed = existing.trim();
        if trimmed.len() >= 16 {
            return trimmed.to_string();
        }
    }

    reset_pairing_token()
}

pub fn reset_pairing_token() -> String {
    let new_token: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(24)
        .map(char::from)
        .collect();

    let token_path = get_app_data_dir().join("pairing_token.txt");
    let _ = fs::write(&token_path, &new_token);
    new_token
}

pub fn default_channels() -> Vec<ChannelItem> {
    vec![
        ChannelItem {
            id: "ttv-news".into(),
            name: "台視新聞直播".into(),
            icon: "📰".into(),
            mode: "live_search".into(),
            target: "台視新聞 TTV NEWS 24小時直播".into(),
            custom: false,
        },
        ChannelItem {
            id: "ftv-news".into(),
            name: "民視新聞直播".into(),
            icon: "📰".into(),
            mode: "live_search".into(),
            target: "民視新聞 FTV 新聞直播".into(),
            custom: false,
        },
        ChannelItem {
            id: "ctv-news".into(),
            name: "中視新聞直播".into(),
            icon: "📰".into(),
            mode: "live_search".into(),
            target: "中視新聞 CTV NEWS 24小時直播".into(),
            custom: false,
        },
        ChannelItem {
            id: "cts-news".into(),
            name: "華視新聞直播".into(),
            icon: "📰".into(),
            mode: "live_search".into(),
            target: "華視新聞 CTS 24小時直播".into(),
            custom: false,
        },
        ChannelItem {
            id: "pts-news".into(),
            name: "公視新聞直播".into(),
            icon: "📰".into(),
            mode: "live_search".into(),
            target: "公視新聞 PTS 24小時直播".into(),
            custom: false,
        },
        ChannelItem {
            id: "ebc-news".into(),
            name: "東森新聞直播".into(),
            icon: "📰".into(),
            mode: "live_search".into(),
            target: "東森新聞 51 頻道 24小時直播".into(),
            custom: false,
        },
        ChannelItem {
            id: "set-news".into(),
            name: "三立新聞直播".into(),
            icon: "📰".into(),
            mode: "live_search".into(),
            target: "三立新聞 LIVE 24小時直播".into(),
            custom: false,
        },
        ChannelItem {
            id: "tvbs-news".into(),
            name: "TVBS新聞直播".into(),
            icon: "📰".into(),
            mode: "live_search".into(),
            target: "TVBS NEWS 24小時直播".into(),
            custom: false,
        },
        ChannelItem {
            id: "taiwanese-oldies".into(),
            name: "經典台語老歌".into(),
            icon: "🎵".into(),
            mode: "search_play".into(),
            target: "經典台語老歌精選合輯 金曲".into(),
            custom: false,
        },
        ChannelItem {
            id: "mandarin-oldies".into(),
            name: "懷舊國語金曲".into(),
            icon: "🎵".into(),
            mode: "search_play".into(),
            target: "鄧麗君 費玉清 鳳飛飛 經典國語老歌合輯".into(),
            custom: false,
        },
    ]
}

pub fn load_channels() -> Vec<ChannelItem> {
    let path = get_app_data_dir().join("channels.json");
    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(parsed) = serde_json::from_str::<Vec<ChannelItem>>(&raw) {
            if !parsed.is_empty() {
                return parsed;
            }
        }
    }
    let defaults = default_channels();
    save_channels(&defaults);
    defaults
}

pub fn save_channels(channels: &[ChannelItem]) {
    let path = get_app_data_dir().join("channels.json");
    if let Ok(json) = serde_json::to_string_pretty(channels) {
        let _ = fs::write(path, json);
    }
}

pub fn build_channel_url(channel: &ChannelItem) -> String {
    match channel.mode.as_str() {
        "direct_url" if channel.target.starts_with("http") => channel.target.clone(),
        "live_search" => {
            let encoded = urlencoding::encode(&channel.target);
            format!(
                "https://www.youtube.com/results?search_query={}&stb_autoplay=1&stb_live=1",
                encoded
            )
        }
        _ => {
            let encoded = urlencoding::encode(&channel.target);
            format!(
                "https://www.youtube.com/results?search_query={}&stb_autoplay=1",
                encoded
            )
        }
    }
}

pub fn build_search_url(query: &str, autoplay: bool) -> String {
    let encoded = urlencoding::encode(query.trim());
    if autoplay {
        format!(
            "https://www.youtube.com/results?search_query={}&stb_autoplay=1",
            encoded
        )
    } else {
        format!(
            "https://www.youtube.com/results?search_query={}&stb_autoplay=0",
            encoded
        )
    }
}

/// 透過本機路由表查詢區域網路 IPv4 位址（UDP connect 不會實際發送任何網路封包）
pub fn detect_lan_ip() -> String {
    // 優先使用常見的外部/閘道位址探測預設路由，提升不同路由器與網段的相容性
    let probe_targets = [
        "8.8.8.8:80",
        "1.1.1.1:80",
        "192.168.1.1:80",
        "192.168.0.1:80",
        "192.168.2.1:80",
        "10.0.0.1:80",
        "192.168.1.254:80",
    ];

    for target in probe_targets {
        if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
            if socket.connect(target).is_ok() {
                if let Ok(addr) = socket.local_addr() {
                    let ip = addr.ip().to_string();
                    if ip != "0.0.0.0" && ip != "127.0.0.1" && !ip.starts_with("169.254.") {
                        return ip;
                    }
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

pub fn detect_mdns_hostname() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "livingroom-tv".to_string())
        .to_lowercase()
}

pub fn generate_qr_svg(url: &str) -> String {
    match QrCode::new(url.as_bytes()) {
        Ok(code) => code
            .render::<svg::Color>()
            .min_dimensions(240, 240)
            .quiet_zone(true)
            .dark_color(svg::Color("#0f172a"))
            .light_color(svg::Color("#ffffff"))
            .build(),
        Err(_) => String::new(),
    }
}
