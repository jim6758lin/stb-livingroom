// STB 電視端全域注入輔助腳本 (OSD 顯示、YouTube 自動跳廣告、手動右下角強制點擊跳廣告、智慧直播點播、免滑鼠全螢幕)
(function () {
  if (window.__STB_HELPER_INITIALIZED__) return;
  window.__STB_HELPER_INITIALIZED__ = true;

  // =========================================================================
  // 1. 電視端超大 OSD (On-Screen Display) 視覺回饋模組
  // =========================================================================
  let osdTimer = null;

  function ensureOsdElement() {
    let el = document.getElementById("__stb_osd_banner__");
    if (!el && document.body) {
      el = document.createElement("div");
      el.id = "__stb_osd_banner__";
      el.style.cssText = [
        "position: fixed",
        "top: 36px",
        "left: 50%",
        "transform: translateX(-50%) translateY(-20px)",
        "background: rgba(15, 23, 42, 0.94)",
        "color: #facc15",
        "border: 3px solid #facc15",
        "border-radius: 24px",
        "padding: 18px 42px",
        "font-family: 'Microsoft JhengHei', 'PingFang TC', sans-serif",
        "font-size: 40px",
        "font-weight: 900",
        "letter-spacing: 1.5px",
        "box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75)",
        "z-index: 2147483647",
        "pointer-events: none",
        "opacity: 0",
        "transition: opacity 0.22s ease, transform 0.22s ease",
        "white-space: nowrap",
        "max-width: 90vw",
        "overflow: hidden",
        "text-overflow: ellipsis",
        "text-align: center"
      ].join(";");
      document.body.appendChild(el);
    }
    return el;
  }

  window.__STB_OSD__ = {
    show: function (message, durationMs) {
      const run = () => {
        const el = ensureOsdElement();
        if (!el) return;
        el.textContent = message;
        el.style.opacity = "1";
        el.style.transform = "translateX(-50%) translateY(0)";
        if (osdTimer) clearTimeout(osdTimer);
        osdTimer = setTimeout(() => {
          el.style.opacity = "0";
          el.style.transform = "translateX(-50%) translateY(-20px)";
        }, durationMs || 2400);
      };
      if (document.body) {
        run();
      } else {
        window.addEventListener("DOMContentLoaded", run, { once: true });
      }
    }
  };

  // 顯示視覺點擊準星光圈（pointer-events: none 絕不阻擋系統真實滑鼠點擊）
  function showClickRipple(x, y) {
    if (!document.body) return;
    const ripple = document.createElement("div");
    ripple.style.cssText = [
      "position: fixed",
      `left: ${Math.round(x - 36)}px`,
      `top: ${Math.round(y - 36)}px`,
      "width: 72px",
      "height: 72px",
      "border-radius: 50%",
      "border: 5px solid #facc15",
      "background: rgba(250, 204, 21, 0.35)",
      "box-shadow: 0 0 25px #facc15",
      "z-index: 2147483646",
      "pointer-events: none",
      "transition: transform 0.45s ease, opacity 0.45s ease"
    ].join(";");
    document.body.appendChild(ripple);
    requestAnimationFrame(() => {
      ripple.style.transform = "scale(1.5)";
      ripple.style.opacity = "0";
    });
    setTimeout(() => {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
    }, 500);
  }

  // =========================================================================
  // 2. 免滑鼠全螢幕劇院模式 (CSS 100vw x 100vh 滿版播放器)
  // =========================================================================
  function injectStbStyles() {
    if (document.getElementById("__stb_custom_styles__")) return;
    if (!document.head) return;
    const style = document.createElement("style");
    style.id = "__stb_custom_styles__";
    style.textContent = `
      html.stb-tv-fullscreen,
      html.stb-tv-fullscreen body {
        overflow: hidden !important;
        background: #000 !important;
      }
      html.stb-tv-fullscreen #masthead-container,
      html.stb-tv-fullscreen ytd-masthead,
      html.stb-tv-fullscreen #secondary,
      html.stb-tv-fullscreen #below,
      html.stb-tv-fullscreen #comments,
      html.stb-tv-fullscreen #chat {
        display: none !important;
      }
      html.stb-tv-fullscreen #movie_player,
      html.stb-tv-fullscreen .html5-video-player {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 2147483000 !important;
        background: #000 !important;
      }
      html.stb-tv-fullscreen video.html5-main-video {
        width: 100vw !important;
        height: 100vh !important;
        left: 0 !important;
        top: 0 !important;
        object-fit: contain !important;
      }
      /* 適老化大字幕強化：讓 YouTube CC 字幕在電視上更大、更清晰好讀 */
      .ytp-caption-window-container .ytp-caption-segment {
        font-size: 36px !important;
        font-weight: 800 !important;
        color: #facc15 !important;
        background: rgba(15, 23, 42, 0.85) !important;
        padding: 4px 12px !important;
        border-radius: 8px !important;
        text-shadow: 0 2px 4px #000 !important;
      }
      .stb-num-badge {
        position: absolute;
        top: 10px;
        left: 10px;
        background: #facc15;
        color: #0f172a;
        border: 3px solid #ffffff;
        border-radius: 14px;
        padding: 6px 16px;
        font-size: 28px;
        font-weight: 900;
        z-index: 9999;
        box-shadow: 0 6px 18px rgba(0,0,0,0.75);
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  // =========================================================================
  // 3. 尋找並點擊 YouTube「略過廣告」按鈕核心邏輯
  // =========================================================================
  function findSkipAdButton() {
    const selectors = [
      ".ytp-skip-ad-button",
      ".ytp-ad-skip-button",
      ".ytp-ad-skip-button-modern",
      ".ytp-ad-skip-button-container button",
      ".ytp-ad-skip-button-slot button",
      "button.ytp-ad-skip-button-modern",
      "button[id^='skip-button']",
      "[id^='skip-button'] button",
      "[id^='skip-button']",
      ".ytp-ad-overlay-close-button"
    ];

    for (const sel of selectors) {
      const nodes = document.querySelectorAll(sel);
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        if (rect.width > 12 && rect.height > 12 && rect.bottom > 0 && rect.right > 0) {
          return node;
        }
      }
    }

    // 備援：以按鈕文字（「略過」、「Skip」）在播放器內搜尋
    const container = document.querySelector("#movie_player") || document.body;
    if (container) {
      const candidates = container.querySelectorAll("button, [role='button'], .ytp-ad-module div");
      for (const el of candidates) {
        const txt = ((el.innerText || el.textContent || "") + " " + (el.getAttribute("aria-label") || "")).trim();
        if (
          (txt.includes("略過") || txt.toLowerCase().includes("skip ad") || txt.toLowerCase() === "skip") &&
          txt.length < 25
        ) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 15 && rect.height > 15) {
            return el;
          }
        }
      }
    }
    return null;
  }

  function dispatchFullClick(el) {
    if (!el) return;
    try {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const opts = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: cx,
        clientY: cy
      };
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new PointerEvent("pointerup", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.click();
    } catch (e) {
      try {
        el.click();
      } catch (_) {}
    }
  }

  // =========================================================================
  // 4. 遙控器操作 API (window.__STB_CTRL__)
  // =========================================================================
  let lastTogglePlayTime = 0;
  const SPEED_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  window.__STB_USER_RATE__ = 1.0;

  window.__STB_CTRL__ = {
    togglePlay: function () {
      const now = Date.now();
      // 防連點保護：400ms 內忽略重複觸發，避免手機誤觸連點兩次
      if (now - lastTogglePlayTime < 400) return;
      lastTogglePlayTime = now;

      const video = document.querySelector("video");
      if (!video) {
        window.__STB_OSD__.show("⚠️ 目前畫面沒有播放中的影片");
        return;
      }
      if (video.paused) {
        video.muted = false;
        video.volume = 1.0;
        video.play().catch(() => {});
        window.__STB_OSD__.show("▶️ 繼續播放");
      } else {
        video.pause();
        window.__STB_OSD__.show("⏸ 已暫停播放");
      }
    },

    // 調整播放速度 ("slower" | "normal" | "faster")
    changeSpeed: function (mode) {
      const video = document.querySelector("video");
      if (!video) {
        window.__STB_OSD__.show("⚠️ 目前畫面沒有播放中的影片");
        return;
      }

      let current = window.__STB_USER_RATE__ || video.playbackRate || 1.0;
      let idx = SPEED_STEPS.findIndex((s) => Math.abs(s - current) < 0.08);
      if (idx === -1) idx = 2; // 預設 1.0x

      if (mode === "slower") {
        idx = Math.max(0, idx - 1);
      } else if (mode === "faster") {
        idx = Math.min(SPEED_STEPS.length - 1, idx + 1);
      } else {
        idx = 2; // normal = 1.0x
      }

      const nextRate = SPEED_STEPS[idx];
      window.__STB_USER_RATE__ = nextRate;
      video.playbackRate = nextRate;

      const player = document.querySelector("#movie_player");
      if (player && typeof player.setPlaybackRate === "function") {
        try {
          player.setPlaybackRate(nextRate);
        } catch (e) {}
      }

      if (nextRate === 1.0) {
        window.__STB_OSD__.show("⚡ 播放速度：1.0x（正常速度）");
      } else if (nextRate < 1.0) {
        window.__STB_OSD__.show(`🐢 播放速度：${nextRate}x（放慢）`);
      } else {
        window.__STB_OSD__.show(`🐇 播放速度：${nextRate}x（加快）`);
      }
    },

    // 開關 YouTube CC 字幕
    toggleSubtitles: function () {
      const subBtn = document.querySelector(".ytp-subtitles-button");
      if (subBtn) {
        const label = (subBtn.getAttribute("aria-label") || "") + " " + (subBtn.getAttribute("title") || "");
        const isUnavailable =
          subBtn.disabled ||
          subBtn.style.display === "none" ||
          label.includes("無法使用") ||
          label.toLowerCase().includes("unavailable");

        if (isUnavailable) {
          window.__STB_OSD__.show("⚠️ 此節目沒有提供 CC 字幕");
          return;
        }

        dispatchFullClick(subBtn);
        setTimeout(() => {
          const pressed = subBtn.getAttribute("aria-pressed") === "true";
          if (pressed) {
            window.__STB_OSD__.show("💬 字幕：已開啟（大字體模式）");
          } else {
            window.__STB_OSD__.show("💬 字幕：已關閉");
          }
        }, 120);
        return;
      }

      // 備援：標準 HTML5 video textTracks
      const video = document.querySelector("video");
      if (video && video.textTracks && video.textTracks.length > 0) {
        const track = video.textTracks[0];
        if (track.mode === "showing") {
          track.mode = "hidden";
          window.__STB_OSD__.show("💬 字幕：已關閉");
        } else {
          track.mode = "showing";
          window.__STB_OSD__.show("💬 字幕：已開啟");
        }
      } else {
        window.__STB_OSD__.show("⚠️ 此節目沒有提供字幕");
      }
    },

    // 手動強制點擊右下角「略過廣告」（結合 DOM 點擊 + 廣告快轉 + 回傳座標供 Rust 執行真實 OS 滑鼠點擊）
    prepareSkipAdClick: function () {
      const player = document.querySelector("#movie_player");
      const video = document.querySelector("video");
      const skipBtn = findSkipAdButton();

      let clickX = window.innerWidth - 88;
      let clickY = window.innerHeight - 115;

      if (skipBtn) {
        const rect = skipBtn.getBoundingClientRect();
        clickX = rect.left + rect.width / 2;
        clickY = rect.top + rect.height / 2;
        dispatchFullClick(skipBtn);
      } else if (player) {
        // 若 YouTube 隱藏了選擇器，直接鎖定播放器右下角「略過廣告」標準熱區座標
        const pRect = player.getBoundingClientRect();
        clickX = pRect.right - 88;
        clickY = pRect.bottom - 112;
        const hitEl = document.elementFromPoint(clickX, clickY);
        if (hitEl) dispatchFullClick(hitEl);
      }

      // 若目前正在播放廣告影片，同步強制快轉到底
      const isAdShowing =
        (player && player.classList.contains("ad-showing")) ||
        document.querySelector(".ytp-ad-player-overlay, .ytp-ad-player-overlay-layout") !== null;

      if (isAdShowing && video) {
        try {
          video.playbackRate = 16.0;
          if (video.duration && !isNaN(video.duration) && isFinite(video.duration)) {
            video.currentTime = Math.max(0, video.duration - 0.1);
          }
        } catch (e) {}
      }

      showClickRipple(clickX, clickY);
      window.__STB_OSD__.show("⏭ 已點擊右下角「略過廣告」！");

      // 將目標點擊位置的視窗比例寫入 document.title 供 Rust 後端讀取並觸發 OS 真實滑鼠左鍵點擊
      const ratioX = Math.max(0.05, Math.min(0.99, clickX / Math.max(1, window.innerWidth)));
      const ratioY = Math.max(0.05, Math.min(0.99, clickY / Math.max(1, window.innerHeight)));
      const cleanTitle = document.title.replace(/\s*\[STB_SKIP:[^\]]+\]/g, "");
      document.title = `${cleanTitle} [STB_SKIP:${ratioX.toFixed(4)},${ratioY.toFixed(4)}]`;
      setTimeout(() => {
        document.title = document.title.replace(/\s*\[STB_SKIP:[^\]]+\]/g, "");
      }, 650);
    },

    seek: function (offsetSec) {
      const video = document.querySelector("video");
      if (!video) return;
      video.currentTime = Math.max(0, (video.currentTime || 0) + offsetSec);
      if (offsetSec > 0) {
        window.__STB_OSD__.show(`⏩ 快轉 ${offsetSec} 秒`);
      } else {
        window.__STB_OSD__.show(`⏪ 倒退 ${Math.abs(offsetSec)} 秒`);
      }
    },

    toggleFullscreen: function () {
      injectStbStyles();
      const root = document.documentElement;
      if (root.classList.contains("stb-tv-fullscreen")) {
        root.classList.remove("stb-tv-fullscreen");
        window.__STB_OSD__.show("🗗 切換為標準檢視模式");
      } else {
        root.classList.add("stb-tv-fullscreen");
        window.__STB_OSD__.show("🖥 已切換為全螢幕滿版電視模式");
      }
      window.dispatchEvent(new Event("resize"));
    },

    enableFullscreen: function () {
      injectStbStyles();
      document.documentElement.classList.add("stb-tv-fullscreen");
      window.dispatchEvent(new Event("resize"));
    },

    scrollPage: function (deltaY) {
      document.documentElement.classList.remove("stb-tv-fullscreen");
      window.scrollBy({ top: deltaY, behavior: "smooth" });
    },

    selectVideoByIndex: function (oneBasedIndex) {
      const cards = getVisibleVideoCards();
      const target = cards[oneBasedIndex - 1];
      if (!target) {
        window.__STB_OSD__.show(`⚠️ 找不到第 ${oneBasedIndex} 部影片`);
        return;
      }
      const link =
        target.querySelector("a#video-title") ||
        target.querySelector("a#thumbnail") ||
        target.querySelector("a[href*='/watch']");
      if (link && link.href) {
        const title = (link.textContent || "").trim() || `第 ${oneBasedIndex} 部影片`;
        window.__STB_OSD__.show(`📺 正在播放：${title.slice(0, 20)}`);
        window.location.href = link.href;
      }
    }
  };

  function getVisibleVideoCards() {
    const selectors = [
      "ytd-video-renderer",
      "ytd-rich-item-renderer",
      "ytd-grid-video-renderer",
      "ytd-playlist-renderer"
    ];
    const all = Array.from(document.querySelectorAll(selectors.join(",")));
    return all.filter((el) => {
      const link = el.querySelector("a[href*='/watch'], a[href*='/shorts']");
      return link && el.offsetParent !== null;
    });
  }

  // =========================================================================
  // 5. YouTube 自動化守護迴圈 (自動偵測廣告、自動點播、編號標記、防暫停)
  // =========================================================================
  let autoPlayTriggeredForUrl = "";
  let initializedWatchUrl = "";

  function runYouTubeGuardian() {
    if (!location.hostname.includes("youtube.com")) return;
    injectStbStyles();

    // (A) 自動偵測並嘗試略過廣告
    const skipBtn = findSkipAdButton();
    if (skipBtn) {
      dispatchFullClick(skipBtn);
    }

    const player = document.querySelector("#movie_player");
    const video = document.querySelector("video");
    const isAdShowing =
      (player && player.classList.contains("ad-showing")) ||
      document.querySelector(".ytp-ad-player-overlay, .ytp-ad-player-overlay-layout") !== null;

    if (video) {
      if (isAdShowing) {
        video.muted = true;
        if (video.playbackRate < 8.0) video.playbackRate = 8.0;
        if (video.duration && video.duration < 120 && !isNaN(video.duration)) {
          video.currentTime = Math.max(0, video.duration - 0.2);
        }
      } else {
        // 正常影片確保有聲音、維持使用者設定的播放倍速且音量 100%
        const desiredRate = window.__STB_USER_RATE__ || 1.0;
        if (Math.abs(video.playbackRate - desiredRate) > 0.05) {
          video.playbackRate = desiredRate;
        }
        if (video.muted) video.muted = false;
        if (video.volume < 0.95) video.volume = 1.0;
      }
    }

    // (B) 自動關閉「影片已暫停，要繼續觀看嗎？」對話框
    const confirmBtns = document.querySelectorAll(
      "yt-confirm-dialog-renderer #confirm-button button, tp-yt-paper-dialog #confirm-button button"
    );
    confirmBtns.forEach((btn) => {
      if (btn && btn.offsetParent !== null) {
        dispatchFullClick(btn);
        if (video && video.paused) video.play().catch(() => {});
      }
    });

    // (C) 若剛進入新的播放頁 (/watch)，僅在初次載入時套用滿版電視模式並啟動播放一次
    if (location.pathname.startsWith("/watch")) {
      if (initializedWatchUrl !== location.href) {
        initializedWatchUrl = location.href;
        document.documentElement.classList.add("stb-tv-fullscreen");
        setTimeout(() => {
          window.dispatchEvent(new Event("resize"));
          const v = document.querySelector("video");
          if (v && v.paused) {
            v.play().catch(() => {});
          }
        }, 400);
      }
    } else {
      initializedWatchUrl = "";
      document.documentElement.classList.remove("stb-tv-fullscreen");
    }

    // (D) 搜尋結果頁：智慧自動播放第一部影片 / 直播，或標上 [第 1~6 部] 大字標籤
    if (location.pathname.startsWith("/results")) {
      const params = new URLSearchParams(location.search);
      const wantAutoplay = params.get("stb_autoplay") === "1";
      const wantLive = params.get("stb_live") === "1";

      const cards = getVisibleVideoCards();
      if (cards.length > 0) {
        cards.slice(0, 8).forEach((card, idx) => {
          card.style.position = "relative";
          if (!card.querySelector(".stb-num-badge")) {
            const badge = document.createElement("div");
            badge.className = "stb-num-badge";
            badge.textContent = `按手機 [${idx + 1}] 播放`;
            card.appendChild(badge);
          }
        });

        if (wantAutoplay && autoPlayTriggeredForUrl !== location.href) {
          let chosenCard = cards[0];
          if (wantLive) {
            const liveCard = cards.find((c) => {
              const html = c.innerHTML || "";
              const text = c.innerText || "";
              return (
                html.includes("LIVE") ||
                html.includes("badge-style-type-live") ||
                text.includes("直播中") ||
                text.includes("LIVE")
              );
            });
            if (liveCard) chosenCard = liveCard;
          }

          const link =
            chosenCard.querySelector("a#video-title") ||
            chosenCard.querySelector("a#thumbnail") ||
            chosenCard.querySelector("a[href*='/watch']");

          if (link && link.href) {
            autoPlayTriggeredForUrl = location.href;
            const title = (link.textContent || "").trim() || "精選節目";
            window.__STB_OSD__.show(`📺 自動為您播放：${title.slice(0, 18)}`);
            setTimeout(() => {
              window.location.href = link.href;
            }, 350);
          }
        }
      }
    }
  }

  setInterval(runYouTubeGuardian, 800);

  // 跨平台 Esc 鍵退出信號（支援 Linux / 樹莓派 / macOS 在 YouTube 頁面按 Esc 直接最小化回桌面）
  window.addEventListener(
    "keydown",
    function (e) {
      if (e.key === "Escape") {
        if (!document.title.includes("[STB_CMD:EXIT]")) {
          document.title = document.title + " [STB_CMD:EXIT]";
        }
      }
    },
    true
  );
})();
