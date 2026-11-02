(function () {
  const TOKEN_KEY = "stb_pairing_token";

  // 1. 讀取網址上的 Token 並永久儲存於 localStorage，隨即抹除網址列參數保護資安
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get("token");
  if (urlToken) {
    try {
      localStorage.setItem(TOKEN_KEY, urlToken);
    } catch (e) {}
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  function getSavedToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return urlToken || "";
    }
  }

  // DOM 元素
  const statusDot = document.getElementById("status-dot");
  const connText = document.getElementById("conn-text");
  const offlineOverlay = document.getElementById("offline-overlay");
  const overlayIcon = document.getElementById("overlay-icon");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayDesc = document.getElementById("overlay-desc");
  const btnReconnect = document.getElementById("btn-reconnect");
  const nowPlayingTitle = document.getElementById("now-playing-title");
  const channelsGrid = document.getElementById("remote-channels-grid");
  const searchInput = document.getElementById("remote-search-input");
  const toastEl = document.getElementById("toast-msg");

  let ws = null;
  let isConnected = false;
  let reconnectTimer = null;
  let offlineShowTimer = null;
  let toastTimer = null;
  let lastSearchQuery = "";
  let currentTvTitle = "待機首頁";
  let currentTvUrl = "";

  // 2. 震動回饋與頂部提示
  function feedback(label) {
    try {
      if (navigator.vibrate) {
        navigator.vibrate(45);
      }
    } catch (e) {}
    if (label) {
      showToast(label);
    }
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.add("hidden");
    }, 1400);
  }

  // 3. 斷線與認證錯誤顯示控制
  function showOfflineWarning(isAuthError) {
    offlineOverlay.classList.remove("hidden");
    if (isAuthError) {
      overlayIcon.textContent = "🔒";
      overlayTitle.textContent = "需要掃描電視 QR Code 配對";
      overlayDesc.innerHTML = `
        <p>這支手機尚未配對，或電視配對碼已更新：</p>
        <ol>
          <li>請看客廳電視待機畫面左側的 <strong>QR Code</strong></li>
          <li>打開手機相機<strong>重新掃描一次</strong>即可永久記憶！</li>
        </ol>
      `;
    } else {
      overlayIcon.textContent = "⚠️";
      overlayTitle.textContent = "連不上客廳電視！";
      overlayDesc.innerHTML = `
        <p>請幫我檢查這兩件事：</p>
        <ol>
          <li>📱 手機有沒有連上<strong>家裡的 Wi-Fi</strong>？</li>
          <li>💻 客廳的電腦有沒有<strong>開機</strong>？</li>
        </ol>
      `;
    }
  }

  function hideOfflineWarning() {
    if (offlineShowTimer) {
      clearTimeout(offlineShowTimer);
      offlineShowTimer = null;
    }
    offlineOverlay.classList.add("hidden");
  }

  // 4. WebSocket 連線管理
  function connectWebSocket() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    const token = getSavedToken();
    if (!token) {
      statusDot.className = "status-dot offline";
      connText.textContent = "尚未配對電視";
      showOfflineWarning(true);
      return;
    }

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;

    try {
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      ws = new WebSocket(wsUrl);
    } catch (err) {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      isConnected = true;
      statusDot.className = "status-dot online";
      connText.textContent = "🟢 已連線客廳電視";
      hideOfflineWarning();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "auth_error") {
          isConnected = false;
          statusDot.className = "status-dot offline";
          connText.textContent = "配對憑證失效";
          showOfflineWarning(true);
          return;
        }
        if (msg.type === "state_sync") {
          if (msg.current_title) {
            currentTvTitle = msg.current_title;
            nowPlayingTitle.textContent = msg.current_title;
          }
          if (msg.current_url !== undefined) {
            currentTvUrl = msg.current_url;
          }
          if (Array.isArray(msg.channels)) {
            renderChannels(msg.channels);
          }
        }
      } catch (e) {}
    };

    ws.onclose = () => {
      isConnected = false;
      statusDot.className = "status-dot offline";
      connText.textContent = "正在重新連線電視...";
      if (!offlineShowTimer) {
        offlineShowTimer = setTimeout(() => {
          if (!isConnected) showOfflineWarning(false);
        }, 2500);
      }
      scheduleReconnect();
    };

    ws.onerror = () => {
      // 由 onclose 統一處理重連
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWebSocket, 2000);
  }

  function sendCommand(action, payload, toastLabel) {
    feedback(toastLabel);
    const data = Object.assign({ action }, payload || {});
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    } else {
      showOfflineWarning(false);
      connectWebSocket();
    }
  }

  // 5. 渲染常用頻道大按鈕
  function renderChannels(channels) {
    channelsGrid.innerHTML = "";
    channels.forEach((ch) => {
      const wrap = document.createElement("div");
      wrap.className = "remote-channel-item";

      const btn = document.createElement("button");
      btn.className = "remote-channel-btn";
      btn.innerHTML = `<span>${ch.icon || "📺"}</span><span>${escapeHtml(ch.name)}</span>`;
      btn.addEventListener("click", () => {
        sendCommand("launch_channel", { channel_id: ch.id }, `📺 切換：${ch.name}`);
      });
      wrap.appendChild(btn);

      if (ch.custom) {
        const delBtn = document.createElement("button");
        delBtn.className = "del-channel-btn";
        delBtn.textContent = "×";
        delBtn.title = "刪除此自訂頻道";
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm(`確定要刪除「${ch.name}」常用按鈕嗎？`)) {
            sendCommand("delete_channel", { channel_id: ch.id }, `🗑 已刪除：${ch.name}`);
          }
        });
        wrap.appendChild(delBtn);
      }

      channelsGrid.appendChild(wrap);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // 6. 綁定所有按鈕事件
  btnReconnect.addEventListener("click", () => {
    feedback("🔄 正在重新連線...");
    connectWebSocket();
  });

  document.getElementById("btn-wake-tv").addEventListener("click", () => {
    sendCommand("wake_tv", {}, "📺 已喚醒電視畫面");
  });

  document.getElementById("btn-play-pause").addEventListener("click", () => {
    sendCommand("toggle_play", {}, "⏯ 暫停 / 繼續播放");
  });

  document.getElementById("btn-skip-ad").addEventListener("click", () => {
    sendCommand("skip_ad", {}, "⏭ 已點擊略過廣告");
  });

  document.getElementById("btn-vol-up").addEventListener("click", () => {
    sendCommand("volume_up", {}, "🔊 大聲一點");
  });

  document.getElementById("btn-vol-down").addEventListener("click", () => {
    sendCommand("volume_down", {}, "🔉 小聲一點");
  });

  document.getElementById("btn-mute").addEventListener("click", () => {
    sendCommand("volume_mute", {}, "🔇 靜音切換");
  });

  document.getElementById("btn-seek-back").addEventListener("click", () => {
    sendCommand("seek", { seconds: -10 }, "⏪ 倒退 10 秒");
  });

  document.getElementById("btn-seek-fwd").addEventListener("click", () => {
    sendCommand("seek", { seconds: 10 }, "⏩ 快轉 10 秒");
  });

  document.getElementById("btn-fullscreen").addEventListener("click", () => {
    sendCommand("toggle_fullscreen", {}, "🖥 切換電視滿版");
  });

  document.getElementById("btn-subtitles").addEventListener("click", () => {
    sendCommand("toggle_subtitles", {}, "💬 字幕開／關");
  });

  document.getElementById("btn-speed-slower").addEventListener("click", () => {
    sendCommand("change_speed", { mode: "slower" }, "🐢 放慢播放速度");
  });

  document.getElementById("btn-speed-normal").addEventListener("click", () => {
    sendCommand("change_speed", { mode: "normal" }, "⚡ 恢復正常速度 (1x)");
  });

  document.getElementById("btn-speed-faster").addEventListener("click", () => {
    sendCommand("change_speed", { mode: "faster" }, "🐇 加快播放速度");
  });

  // 搜尋與語音輸入
  function doSearch(autoplay) {
    const q = (searchInput.value || "").trim();
    if (!q) {
      feedback("⚠️ 請先點輸入框說話或打字");
      searchInput.focus();
      return;
    }
    lastSearchQuery = q;
    searchInput.blur();
    sendCommand(
      "search_youtube",
      { query: q, autoplay },
      autoplay ? `▶️ 直接播放：${q}` : `🔍 搜尋列表：${q}`
    );
  }

  document.getElementById("btn-search-direct").addEventListener("click", () => doSearch(true));
  document.getElementById("btn-search-list").addEventListener("click", () => doSearch(false));
  document.getElementById("btn-clear-search").addEventListener("click", () => {
    searchInput.value = "";
    searchInput.focus();
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      doSearch(true);
    }
  });

  // 搜尋列表數字選片
  document.querySelectorAll(".num-pick-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-idx") || "1", 10);
      sendCommand("select_video", { index: idx }, `📺 播放第 ${idx} 部影片`);
    });
  });

  document.getElementById("btn-scroll-up").addEventListener("click", () => {
    sendCommand("scroll", { delta: -550 }, "⬆️ 往上滑動");
  });

  document.getElementById("btn-scroll-down").addEventListener("click", () => {
    sendCommand("scroll", { delta: 550 }, "⬇️ 往下滑動");
  });

  // 存為常用頻道按鈕
  document.getElementById("btn-save-favorite").addEventListener("click", () => {
    feedback();
    let defaultName = currentTvTitle
      .replace(/\s*-\s*YouTube$/i, "")
      .replace(/^\(\d+\)\s*/, "")
      .trim();
    if (!defaultName || defaultName === "待機首頁" || defaultName.includes("客廳電視盒")) {
      defaultName = lastSearchQuery || "我的最愛頻道";
    }
    const name = prompt("請輸入要顯示在遙控器上的頻道按鈕名稱：", defaultName.slice(0, 14));
    if (!name || !name.trim()) return;
    sendCommand(
      "save_favorite",
      { name: name.trim(), fallback_query: lastSearchQuery },
      `⭐ 已新增常用頻道：${name.trim()}`
    );
  });

  // 回首頁與退出電視
  document.getElementById("btn-tv-home").addEventListener("click", () => {
    sendCommand("go_home", {}, "🏠 電視已返回待機首頁");
  });

  document.getElementById("btn-tv-exit").addEventListener("click", () => {
    sendCommand("minimize_to_desktop", {}, "🚪 已退回電腦桌面");
  });

  // 當手機從背景切回前景時立即檢查連線
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (!ws || ws.readyState !== WebSocket.OPEN)) {
      connectWebSocket();
    }
  });

  // 註冊 PWA Service Worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  connectWebSocket();
})();
