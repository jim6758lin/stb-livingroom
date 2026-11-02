/// 跨平台系統級電源管理（防休眠）、作業系統主音量控制與實體滑鼠點擊模擬模組
/// 同時支援 Windows、Linux (樹莓派 Raspberry Pi / Ubuntu) 與 macOS

#[cfg(target_os = "windows")]
mod imp {
    use std::mem::size_of;
    use windows_sys::Win32::System::Power::{
        SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT,
        KEYEVENTF_KEYUP, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEINPUT, VK_ESCAPE,
        VK_VOLUME_DOWN, VK_VOLUME_MUTE, VK_VOLUME_UP,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::SetCursorPos;

    pub fn set_keep_awake(active: bool) {
        unsafe {
            if active {
                SetThreadExecutionState(ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED);
            } else {
                SetThreadExecutionState(ES_CONTINUOUS);
            }
        }
    }

    fn tap_virtual_key(vk: u16, times: usize) {
        unsafe {
            for _ in 0..times {
                let inputs = [
                    INPUT {
                        r#type: INPUT_KEYBOARD,
                        Anonymous: INPUT_0 {
                            ki: KEYBDINPUT {
                                wVk: vk,
                                wScan: 0,
                                dwFlags: 0,
                                time: 0,
                                dwExtraInfo: 0,
                            },
                        },
                    },
                    INPUT {
                        r#type: INPUT_KEYBOARD,
                        Anonymous: INPUT_0 {
                            ki: KEYBDINPUT {
                                wVk: vk,
                                wScan: 0,
                                dwFlags: KEYEVENTF_KEYUP,
                                time: 0,
                                dwExtraInfo: 0,
                            },
                        },
                    },
                ];
                SendInput(
                    inputs.len() as u32,
                    inputs.as_ptr(),
                    size_of::<INPUT>() as i32,
                );
            }
        }
    }

    pub fn volume_up() {
        tap_virtual_key(VK_VOLUME_UP, 3);
    }

    pub fn volume_down() {
        tap_virtual_key(VK_VOLUME_DOWN, 3);
    }

    pub fn volume_mute() {
        tap_virtual_key(VK_VOLUME_MUTE, 1);
    }

    pub fn is_escape_pressed() -> bool {
        unsafe { (GetAsyncKeyState(VK_ESCAPE as i32) as u16 & 0x8000) != 0 }
    }

    pub fn click_screen_point(x: i32, y: i32) {
        unsafe {
            SetCursorPos(x, y);
            let inputs = [
                INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            dx: 0,
                            dy: 0,
                            mouseData: 0,
                            dwFlags: MOUSEEVENTF_LEFTDOWN,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                },
                INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            dx: 0,
                            dy: 0,
                            mouseData: 0,
                            dwFlags: MOUSEEVENTF_LEFTUP,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                },
            ];
            SendInput(
                inputs.len() as u32,
                inputs.as_ptr(),
                size_of::<INPUT>() as i32,
            );
        }
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use std::process::Command;

    pub fn set_keep_awake(active: bool) {
        if active {
            // macOS 內建防休眠工具 caffeinate (-d 防止螢幕睡眠, -i 防止系統閒置睡眠)
            let _ = Command::new("pkill").args(["-f", "caffeinate -d -i"]).status();
            let _ = Command::new("caffeinate").args(["-d", "-i"]).spawn();
        } else {
            let _ = Command::new("pkill").args(["-f", "caffeinate -d -i"]).spawn();
        }
    }

    pub fn volume_up() {
        let _ = Command::new("osascript")
            .args([
                "-e",
                "set volume output volume ((output volume of (get volume settings)) + 7)",
            ])
            .spawn();
    }

    pub fn volume_down() {
        let _ = Command::new("osascript")
            .args([
                "-e",
                "set volume output volume ((output volume of (get volume settings)) - 7)",
            ])
            .spawn();
    }

    pub fn volume_mute() {
        let _ = Command::new("osascript")
            .args([
                "-e",
                "set volume output muted (not (output muted of (get volume settings)))",
            ])
            .spawn();
    }

    pub fn is_escape_pressed() -> bool {
        false
    }

    pub fn click_screen_point(x: i32, y: i32) {
        // 若安裝了 cliclick 則執行硬體點擊
        let _ = Command::new("cliclick")
            .arg(format!("c:{},{}", x, y))
            .spawn();
    }
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
mod imp {
    use std::process::Command;

    pub fn set_keep_awake(active: bool) {
        if active {
            let _ = Command::new("xset").args(["s", "off", "-dpms"]).spawn();
        } else {
            let _ = Command::new("xset").args(["s", "on", "+dpms"]).spawn();
        }
    }

    pub fn volume_up() {
        let _ = Command::new("pactl")
            .args(["set-sink-volume", "@DEFAULT_SINK@", "+6%"])
            .spawn()
            .or_else(|_| {
                Command::new("amixer")
                    .args(["-D", "pulse", "sset", "Master", "6%+"])
                    .spawn()
            })
            .or_else(|_| {
                Command::new("amixer")
                    .args(["sset", "Master", "6%+"])
                    .spawn()
            });
    }

    pub fn volume_down() {
        let _ = Command::new("pactl")
            .args(["set-sink-volume", "@DEFAULT_SINK@", "-6%"])
            .spawn()
            .or_else(|_| {
                Command::new("amixer")
                    .args(["-D", "pulse", "sset", "Master", "6%-"])
                    .spawn()
            })
            .or_else(|_| {
                Command::new("amixer")
                    .args(["sset", "Master", "6%-"])
                    .spawn()
            });
    }

    pub fn volume_mute() {
        let _ = Command::new("pactl")
            .args(["set-sink-mute", "@DEFAULT_SINK@", "toggle"])
            .spawn()
            .or_else(|_| {
                Command::new("amixer")
                    .args(["-D", "pulse", "sset", "Master", "toggle"])
                    .spawn()
            })
            .or_else(|_| {
                Command::new("amixer")
                    .args(["sset", "Master", "toggle"])
                    .spawn()
            });
    }

    pub fn is_escape_pressed() -> bool {
        false
    }

    pub fn click_screen_point(x: i32, y: i32) {
        let _ = Command::new("xdotool")
            .args(["mousemove", &x.to_string(), &y.to_string(), "click", "1"])
            .spawn();
    }
}

pub use imp::{
    click_screen_point, is_escape_pressed, set_keep_awake, volume_down, volume_mute, volume_up,
};
