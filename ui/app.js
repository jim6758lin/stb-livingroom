(function () {
  const timeEl = document.getElementById("tv-time");
  const dateEl = document.getElementById("tv-date");
  const qrContainer = document.getElementById("qr-container");
  const lanUrlText = document.getElementById("lan-url-text");
  const mdnsUrlText = document.getElementById("mdns-url-text");
  const clientCountText = document.getElementById("client-count-text");
  const channelsGrid = document.getElementById("tv-channels-grid");
  const searchInput = document.getElementById("tv-search-input");
  const searchPlayBtn = document.getElementById("tv-search-play-btn");
  const searchListBtn = document.getElementById("tv-search-list-btn");
  const minimizeBtn = document.getElementById("btn-minimize");

  let lastQrUrl = "";
  let lastChannelsJson = "";

  function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const mins = String(now.getMinutes()).padStart(2, "0");
    timeEl.textContent = `${hours}:${mins}`;

    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const day = weekdays[now.getDay()];
    dateEl.textContent = `${month}月${date}日 (星期${day})`;
  }

  updateClock();
  setInterval(updateClock, 1000);

  async function invokeTauri(cmd, args) {
    if (window.__TAURI__ && window.__TAURI__.core) {
      return await window.__TAURI__.core.invoke(cmd, args || {});
    }
    return null;
  }

  function renderChannels(channels) {
    const serialized = JSON.stringify(channels);
    if (serialized === lastChannelsJson) return;
    lastChannelsJson = serialized;

    channelsGrid.innerHTML = "";
    channels.forEach((ch) => {
      const btn = document.createElement("button");
      btn.className = "channel-card";
      const tagLabel =
        ch.mode === "live_search"
          ? "🔴 智慧直播尋址"
          : ch.mode === "search_play"
          ? "🎵 自動連續播放"
          : "📺 直接播放";

      btn.innerHTML = `
        <div class="channel-card-top">
          <span class="channel-icon">${ch.icon || "📺"}</span>
          <span class="channel-name">${escapeHtml(ch.name)}</span>
        </div>
        <span class="channel-tag">${tagLabel}</span>
      `;
      btn.addEventListener("click", () => {
        invokeTauri("launch_channel", { channelId: ch.id });
      });
      channelsGrid.appendChild(btn);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function refreshStbInfo() {
    try {
      const info = await invokeTauri("get_stb_info");
      if (!info) return;

      lanUrlText.textContent = info.base_url;
      mdnsUrlText.textContent = info.mdns_url;

      if (info.connected_clients > 0) {
        clientCountText.textContent = `已連線 ${info.connected_clients} 台手機遙控器`;
      } else {
        clientCountText.textContent = "遙控服務待命中 · 可隨時用手機喚醒";
      }

      if (info.pairing_url !== lastQrUrl && info.qr_svg) {
        lastQrUrl = info.pairing_url;
        qrContainer.innerHTML = info.qr_svg;
      }

      if (Array.isArray(info.channels)) {
        renderChannels(info.channels);
      }
    } catch (err) {
      console.error("Failed to fetch STB info:", err);
    }
  }

  refreshStbInfo();
  setInterval(refreshStbInfo, 2500);

  function triggerSearch(autoplay) {
    const query = (searchInput.value || "").trim();
    if (!query) {
      searchInput.focus();
      return;
    }
    invokeTauri("search_youtube", { query, autoplay });
  }

  searchPlayBtn.addEventListener("click", () => triggerSearch(true));
  searchListBtn.addEventListener("click", () => triggerSearch(false));
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      triggerSearch(true);
    }
  });

  minimizeBtn.addEventListener("click", () => {
    invokeTauri("minimize_to_desktop");
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      invokeTauri("minimize_to_desktop");
    }
  });
})();
