// STB 電視端全域注入輔助腳本
// 包含：OSD 視覺回饋、YouTube 自動/手動跳廣告、免滑鼠滿版、大字幕與語速控制、
// 十字方向鍵空間焦點導航 (Spatial D-Pad Navigation) + [1]~[6] 動態視野快捷鍵雙軌選片（完整支援一般影片、播放清單/合輯、Shorts）
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
        "font-size: 38px",
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
  // 2. 免滑鼠全螢幕劇院模式、大字幕與焦點外框樣式
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
      /* 適老化大字幕強化 */
      .ytp-caption-window-container .ytp-caption-segment {
        font-size: 36px !important;
        font-weight: 800 !important;
        color: #facc15 !important;
        background: rgba(15, 23, 42, 0.85) !important;
        padding: 4px 12px !important;
        border-radius: 8px !important;
        text-shadow: 0 2px 4px #000 !important;
      }
      /* [1]~[6] 數字快捷標籤 */
      .stb-num-badge {
        position: absolute;
        top: 8px;
        left: 8px;
        background: #facc15;
        color: #0f172a;
        border: 3px solid #ffffff;
        border-radius: 12px;
        padding: 4px 12px;
        font-size: 24px;
        font-weight: 900;
        z-index: 9998;
        box-shadow: 0 6px 16px rgba(0,0,0,0.75);
        pointer-events: none;
        line-height: 1.15;
      }
      /* 十字方向鍵目前 Focus 選取項目的超醒目外框與標籤 */
      .stb-focused-card {
        outline: 6px solid #f97316 !important;
        outline-offset: 4px !important;
        border-radius: 16px !important;
        box-shadow: 0 0 32px rgba(249, 115, 22, 0.9) !important;
        transition: outline 0.12s ease, box-shadow 0.12s ease !important;
      }
      .stb-focus-pill {
        position: absolute;
        top: 8px;
        right: 8px;
        background: #ea580c;
        color: #ffffff;
        border: 3px solid #fde047;
        border-radius: 12px;
        padding: 4px 14px;
        font-size: 22px;
        font-weight: 900;
        z-index: 9999;
        box-shadow: 0 6px 18px rgba(0,0,0,0.85);
        pointer-events: none;
        line-height: 1.15;
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
  // 4. 媒體卡片探索（支援：一般影片 + 新舊版播放清單/合輯 + Shorts 短影音）
  // =========================================================================
  const CARD_SELECTORS = [
    "ytd-video-renderer",
    "ytd-rich-item-renderer",
    "ytd-grid-video-renderer",
    "ytd-playlist-renderer",
    "ytd-radio-renderer",
    "yt-lockup-view-model",
    "ytm-shorts-lockup-view-model-v2",
    "ytm-shorts-lockup-view-model",
    "ytd-reel-item-renderer"
  ].join(",");

  let currentFocusEl = null;

  function getCardPlayUrl(card) {
    if (!card) return "";
    // 1. 優先尋找直接進入播放且帶播放清單或影片的連結
    const watchWithList = card.querySelector("a[href*='/watch?'][href*='list=']");
    if (watchWithList && watchWithList.href) return watchWithList.href;

    // 2. 一般影片或 Shorts 連結
    const directLink =
      card.querySelector("a#video-title") ||
      card.querySelector("a#video-title-link") ||
      card.querySelector("a.yt-lockup-metadata-view-model-wiz__title") ||
      card.querySelector("a.yt-lockup-view-model-wiz__content-image") ||
      card.querySelector("a.reel-item-endpoint") ||
      card.querySelector("a[href*='/watch?v=']") ||
      card.querySelector("a[href*='/shorts/']") ||
      card.querySelector("a[href*='/playlist?list=']");

    if (directLink && directLink.href) {
      return directLink.href;
    }
    return "";
  }

  function getCardTitle(card) {
    if (!card) return "精選影片";
    const titleEl =
      card.querySelector("#video-title") ||
      card.querySelector(".yt-lockup-metadata-view-model-wiz__title") ||
      card.querySelector(".shortsLockupViewModelHostMetadataTitle") ||
      card.querySelector("h3") ||
      card.querySelector("a[title]");
    if (titleEl) {
      const txt = (titleEl.textContent || titleEl.getAttribute("title") || "").trim();
      if (txt) return txt;
    }
    return "精選影片";
  }

  function getAllCandidateCards() {
    const raw = Array.from(document.querySelectorAll(CARD_SELECTORS));
    // 過濾掉巢狀重複元素（例如 ytd-rich-item-renderer 內部包著 yt-lockup-view-model 時只取外層或有效層）
    const valid = raw.filter((el) => {
      if (el.offsetParent === null) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 60) return false;
      return getCardPlayUrl(el) !== "";
    });

    const validSet = new Set(valid);
    return valid.filter((el) => {
      let p = el.parentElement;
      while (p) {
        if (validSet.has(p)) return false;
        p = p.parentElement;
      }
      return true;
    });
  }

  // 取得目前電視螢幕可視範圍內的卡片（由上而下、由左而右排序）
  function getViewportVideoCards() {
    const all = getAllCandidateCards();
    const viewH = window.innerHeight || 720;
    const viewW = window.innerWidth || 1280;

    let visible = all.filter((el) => {
      const rect = el.getBoundingClientRect();
      const centerY = rect.top + rect.height * 0.35;
      const centerX = rect.left + rect.width * 0.5;
      return centerY >= 55 && centerY <= viewH - 25 && centerX >= 10 && centerX <= viewW - 10;
    });

    if (visible.length === 0) {
      visible = all.filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.bottom > 70 && rect.top < viewH - 30 && rect.right > 20 && rect.left < viewW - 20;
      });
    }

    visible.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (Math.abs(ra.top - rb.top) > 45) {
        return ra.top - rb.top;
      }
      return ra.left - rb.left;
    });

    return visible;
  }

  // 設定目前十字鍵 Focus 的卡片
  function setFocusedCard(card, shouldScrollAndAnnounce) {
    if (!card) return;
    currentFocusEl = card;

    document.querySelectorAll(".stb-focused-card").forEach((el) => {
      if (el !== card) {
        el.classList.remove("stb-focused-card");
        const oldPill = el.querySelector(".stb-focus-pill");
        if (oldPill) oldPill.remove();
      }
    });

    card.style.position = "relative";
    card.classList.add("stb-focused-card");

    let pill = card.querySelector(".stb-focus-pill");
    if (!pill) {
      pill = document.createElement("div");
      pill.className = "stb-focus-pill";
      pill.textContent = "👉 按 [🆗確定] 播放";
      card.appendChild(pill);
    }

    if (shouldScrollAndAnnounce) {
      try {
        card.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      } catch (e) {}
      const title = getCardTitle(card);
      window.__STB_OSD__.show(`🎯 選中：${title.slice(0, 20)}`, 1800);
      setTimeout(updateViewportNumberBadges, 220);
      setTimeout(updateViewportNumberBadges, 500);
    }
  }

  // 動態更新目前電視畫面上的 [1]~[6] 號牌（並確保至少有一個預設 Focus 項目）
  function updateViewportNumberBadges() {
    if (!location.hostname.includes("youtube.com")) return;
    if (location.pathname.startsWith("/watch") || location.pathname.startsWith("/shorts")) return;

    const visibleCards = getViewportVideoCards();
    // 為了避免單一橫排 Shorts 把 1~6 號全部吃光：同一橫排 Shorts 最多分配 2 個快捷號碼，其餘留給上下正常影片（但十字方向鍵左右移仍可選取整排每一個 Short！）
    const badgeTargets = [];
    const shelfCounts = new Map();

    for (const card of visibleCards) {
      if (badgeTargets.length >= 6) break;
      const isShort =
        card.tagName.toLowerCase().includes("shorts") ||
        card.tagName.toLowerCase().includes("reel");
      if (isShort) {
        const shelf =
          card.closest("ytd-reel-shelf-renderer, grid-shelf-view-model, ytd-rich-shelf-renderer") ||
          card.parentElement;
        const count = shelfCounts.get(shelf) || 0;
        if (count >= 2) continue;
        shelfCounts.set(shelf, count + 1);
      }
      badgeTargets.push(card);
    }

    // 若不足 6 個則以剩餘可視卡片補滿
    if (badgeTargets.length < 6) {
      for (const card of visibleCards) {
        if (badgeTargets.length >= 6) break;
        if (!badgeTargets.includes(card)) {
          badgeTargets.push(card);
        }
      }
    }

    const inViewSet = new Set(badgeTargets);

    document.querySelectorAll("[data-stb-pick-index], .stb-num-badge").forEach((el) => {
      if (el.classList && el.classList.contains("stb-num-badge")) {
        const parent = el.parentElement;
        if (!parent || !inViewSet.has(parent)) {
          el.remove();
        }
      } else if (!inViewSet.has(el)) {
        el.removeAttribute("data-stb-pick-index");
      }
    });

    badgeTargets.forEach((card, idx) => {
      const num = idx + 1;
      card.style.position = "relative";
      card.setAttribute("data-stb-pick-index", String(num));

      let badge = card.querySelector(".stb-num-badge");
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "stb-num-badge";
        card.appendChild(badge);
      }
      const expectedText = `按 [${num}] 播`;
      if (badge.textContent !== expectedText) {
        badge.textContent = expectedText;
      }
    });

    // 若目前尚未有 Focus 項目（或原 Focus 已被移除），預設自動 Focus 在畫面第 1 部影片
    if (!currentFocusEl || !document.body.contains(currentFocusEl) || currentFocusEl.offsetParent === null) {
      if (badgeTargets.length > 0) {
        setFocusedCard(badgeTargets[0], false);
      } else if (visibleCards.length > 0) {
        setFocusedCard(visibleCards[0], false);
      }
    }
  }

  // 十字方向鍵空間導航演算法 ('up' | 'down' | 'left' | 'right')
  function navigateFocusByDirection(dir) {
    // 若正在觀看 Shorts 短影音全螢幕頁 (/shorts/xxx)，按上下鍵直接切換下一部/上一部 Short
    if (location.pathname.startsWith("/shorts")) {
      if (dir === "down" || dir === "right") {
        const nextBtn = document.querySelector("#navigation-button-down button, button[aria-label*='下一部'], button[aria-label*='Next']");
        if (nextBtn) dispatchFullClick(nextBtn);
        else window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
        window.__STB_OSD__.show("⬇️ 下一部短影音");
      } else if (dir === "up" || dir === "left") {
        const prevBtn = document.querySelector("#navigation-button-up button, button[aria-label*='上一部'], button[aria-label*='Previous']");
        if (prevBtn) dispatchFullClick(prevBtn);
        else window.scrollBy({ top: -window.innerHeight, behavior: "smooth" });
        window.__STB_OSD__.show("⬆️ 上一部短影音");
      }
      return;
    }

    const allCards = getAllCandidateCards();
    if (allCards.length === 0) {
      window.__STB_OSD__.show("⚠️ 目前畫面沒有可選取的影片");
      return;
    }

    if (!currentFocusEl || !document.body.contains(currentFocusEl)) {
      const visible = getViewportVideoCards();
      setFocusedCard(visible[0] || allCards[0], true);
      return;
    }

    const curRect = currentFocusEl.getBoundingClientRect();
    const curCenterX = curRect.left + curRect.width / 2;
    const curCenterY = curRect.top + curRect.height / 2;

    if (dir === "left" || dir === "right") {
      // 找出同一橫排（或同一個 Shorts 橫向專櫃）的卡片
      const sameRow = allCards.filter((c) => {
        if (c === currentFocusEl) return false;
        const r = c.getBoundingClientRect();
        const cy = r.top + r.height / 2;
        return Math.abs(cy - curCenterY) < Math.max(curRect.height, r.height) * 0.65;
      });

      const candidates = sameRow.filter((c) => {
        const r = c.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        return dir === "right" ? cx > curCenterX + 10 : cx < curCenterX - 10;
      });

      candidates.sort((a, b) => {
        const ax = a.getBoundingClientRect().left;
        const bx = b.getBoundingClientRect().left;
        return dir === "right" ? ax - bx : bx - ax;
      });

      if (candidates.length > 0) {
        const chosen = candidates[0];
        setFocusedCard(chosen, true);

        // 若選到 Shorts 橫向專櫃接近邊緣，自動觸發專櫃往右/往左滑動按鈕載入更多 Shorts
        const shelf = chosen.closest("ytd-reel-shelf-renderer, grid-shelf-view-model, ytd-rich-shelf-renderer");
        if (shelf) {
          const chosenRect = chosen.getBoundingClientRect();
          if (dir === "right" && chosenRect.right > window.innerWidth - 220) {
            const rightArrow = shelf.querySelector("#right-arrow button, button[aria-label*='Next'], button[aria-label*='下一個'], button[aria-label*='往右']");
            if (rightArrow) dispatchFullClick(rightArrow);
          } else if (dir === "left" && chosenRect.left < 220) {
            const leftArrow = shelf.querySelector("#left-arrow button, button[aria-label*='Previous'], button[aria-label*='上一個'], button[aria-label*='往左']");
            if (leftArrow) dispatchFullClick(leftArrow);
          }
        }
        return;
      } else {
        // 如果同一排已經在最邊緣，嘗試點擊該專櫃的橫向展開箭頭
        const shelf = currentFocusEl.closest("ytd-reel-shelf-renderer, grid-shelf-view-model, ytd-rich-shelf-renderer");
        if (shelf) {
          const arrowSel =
            dir === "right"
              ? "#right-arrow button, button[aria-label*='Next'], button[aria-label*='下一個']"
              : "#left-arrow button, button[aria-label*='Previous'], button[aria-label*='上一個']";
          const arrowBtn = shelf.querySelector(arrowSel);
          if (arrowBtn) {
            dispatchFullClick(arrowBtn);
            window.__STB_OSD__.show(dir === "right" ? "➡️ 滑出更多短影音..." : "⬅️ 往左滑回...");
            return;
          }
        }
        // 若不是橫排專櫃，往右視同下一個、往左視同上一個
        dir = dir === "right" ? "down" : "up";
      }
    }

    if (dir === "down" || dir === "up") {
      const verticalCandidates = allCards.filter((c) => {
        if (c === currentFocusEl) return false;
        const r = c.getBoundingClientRect();
        const cy = r.top + r.height / 2;
        if (dir === "down") {
          return cy > curCenterY + curRect.height * 0.45;
        } else {
          return cy < curCenterY - curRect.height * 0.45;
        }
      });

      if (verticalCandidates.length > 0) {
        // 先找出最接近的下一列 (row) 的垂直距離
        verticalCandidates.sort((a, b) => {
          const ay = a.getBoundingClientRect().top;
          const by = b.getBoundingClientRect().top;
          return dir === "down" ? ay - by : by - ay;
        });

        const nearestRowTop = verticalCandidates[0].getBoundingClientRect().top;
        const nearestRowCards = verticalCandidates.filter((c) => {
          return Math.abs(c.getBoundingClientRect().top - nearestRowTop) < 85;
        });

        // 在下一列中挑選水平位置最接近目前項目的卡片（若從一般影片進入 Shorts 橫排則優先選左側第一部）
        nearestRowCards.sort((a, b) => {
          const ax = a.getBoundingClientRect().left;
          const bx = b.getBoundingClientRect().left;
          return Math.abs(ax - curRect.left) - Math.abs(bx - curRect.left);
        });

        setFocusedCard(nearestRowCards[0], true);
      } else {
        // 已達目前載入列表底部/頂部，自動捲動頁面載入更多
        const delta = dir === "down" ? 550 : -550;
        window.scrollBy({ top: delta, behavior: "smooth" });
        window.__STB_OSD__.show(dir === "down" ? "⬇️ 往下載入更多影片..." : "⬆️ 已到頁面頂端");
        setTimeout(updateViewportNumberBadges, 350);
      }
    }
  }

  function playCardElement(card, labelPrefix) {
    if (!card) {
      window.__STB_OSD__.show("⚠️ 找不到可播放的影片");
      return;
    }
    const url = getCardPlayUrl(card);
    const title = getCardTitle(card);
    if (url) {
      window.__STB_OSD__.show(`📺 ${labelPrefix || "正在播放"}：${title.slice(0, 18)}`);
      window.location.href = url;
    } else {
      const link = card.querySelector("a[href]");
      if (link) {
        window.__STB_OSD__.show(`📺 ${labelPrefix || "正在開啟"}：${title.slice(0, 18)}`);
        dispatchFullClick(link);
      }
    }
  }

  // =========================================================================
  // 5. 遙控器操作 API (window.__STB_CTRL__)
  // =========================================================================
  let lastTogglePlayTime = 0;
  const SPEED_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  window.__STB_USER_RATE__ = 1.0;

  window.__STB_CTRL__ = {
    togglePlay: function () {
      const now = Date.now();
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

    // 十字方向鍵移動焦點 ('up' | 'down' | 'left' | 'right')
    moveFocus: function (dir) {
      document.documentElement.classList.remove("stb-tv-fullscreen");
      navigateFocusByDirection(dir);
    },

    // 按下 [🆗 確定播放] 播放目前外框 Focus 的項目
    activateFocused: function () {
      if (currentFocusEl && document.body.contains(currentFocusEl)) {
        playCardElement(currentFocusEl, "正在播放");
        return;
      }
      updateViewportNumberBadges();
      if (currentFocusEl) {
        playCardElement(currentFocusEl, "正在播放");
      } else {
        window.__STB_OSD__.show("⚠️ 請先搜尋或選擇一部影片");
      }
    },

    changeSpeed: function (mode) {
      const video = document.querySelector("video");
      if (!video) {
        window.__STB_OSD__.show("⚠️ 目前畫面沒有播放中的影片");
        return;
      }

      let current = window.__STB_USER_RATE__ || video.playbackRate || 1.0;
      let idx = SPEED_STEPS.findIndex((s) => Math.abs(s - current) < 0.08);
      if (idx === -1) idx = 2;

      if (mode === "slower") {
        idx = Math.max(0, idx - 1);
      } else if (mode === "faster") {
        idx = Math.min(SPEED_STEPS.length - 1, idx + 1);
      } else {
        idx = 2;
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
        const pRect = player.getBoundingClientRect();
        clickX = pRect.right - 88;
        clickY = pRect.bottom - 112;
        const hitEl = document.elementFromPoint(clickX, clickY);
        if (hitEl) dispatchFullClick(hitEl);
      }

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
      const dir = deltaY >= 0 ? 1 : -1;
      const step = Math.max(420, Math.round(window.innerHeight * 0.72)) * dir;
      window.scrollBy({ top: step, behavior: "smooth" });
      if (dir > 0) {
        window.__STB_OSD__.show("⬇️ 換下一批影片（畫面已重新編號 1～6）");
      } else {
        window.__STB_OSD__.show("⬆️ 回上一批影片（畫面已重新編號 1～6）");
      }
      setTimeout(() => {
        updateViewportNumberBadges();
        const visible = getViewportVideoCards();
        if (visible.length > 0) setFocusedCard(visible[0], false);
      }, 320);
    },

    selectVideoByIndex: function (oneBasedIndex) {
      updateViewportNumberBadges();
      let target = document.querySelector(`[data-stb-pick-index="${oneBasedIndex}"]`);
      if (!target) {
        const cards = getViewportVideoCards();
        target = cards[oneBasedIndex - 1];
      }
      if (!target) {
        window.__STB_OSD__.show(`⚠️ 目前畫面找不到 [${oneBasedIndex}] 號影片`);
        return;
      }
      setFocusedCard(target, false);
      playCardElement(target, `正在播放 [${oneBasedIndex}]`);
    }
  };

  // =========================================================================
  // 6. YouTube 自動化守護迴圈
  // =========================================================================
  let autoPlayTriggeredForUrl = "";
  let initializedWatchUrl = "";
  let autoPlayedPlaylistUrl = "";

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

    // (C) 若進入播放清單介紹頁 (/playlist?list=...)，自動點擊第一首進入連續播放
    if (location.pathname.startsWith("/playlist") && autoPlayedPlaylistUrl !== location.href) {
      const firstPlayLink = document.querySelector("a[href*='/watch?'][href*='list=']");
      if (firstPlayLink && firstPlayLink.href) {
        autoPlayedPlaylistUrl = location.href;
        window.__STB_OSD__.show("🎵 正在為您啟動播放清單全部播放...");
        window.location.href = firstPlayLink.href;
        return;
      }
    }

    // (D) 若剛進入新的播放頁 (/watch)，僅在初次載入時套用滿版電視模式並啟動播放一次
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

    // (E) 非播放頁時，自動更新畫面上的 [1]~[6] 號牌與預設 Focus 外框
    if (!location.pathname.startsWith("/watch") && !location.pathname.startsWith("/shorts")) {
      updateViewportNumberBadges();
    }

    // (F) 搜尋結果頁：若帶有 stb_autoplay=1，智慧自動點播第一部影片或 LIVE 直播
    if (location.pathname.startsWith("/results")) {
      const params = new URLSearchParams(location.search);
      const wantAutoplay = params.get("stb_autoplay") === "1";
      const wantLive = params.get("stb_live") === "1";

      const cards = getAllCandidateCards();
      if (cards.length > 0 && wantAutoplay && autoPlayTriggeredForUrl !== location.href) {
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

        const url = getCardPlayUrl(chosenCard);
        if (url) {
          autoPlayTriggeredForUrl = location.href;
          const title = getCardTitle(chosenCard);
          window.__STB_OSD__.show(`📺 自動為您播放：${title.slice(0, 18)}`);
          setTimeout(() => {
            window.location.href = url;
          }, 350);
        }
      }
    }
  }

  setInterval(runYouTubeGuardian, 800);

  let scrollBadgeTimer = null;
  window.addEventListener(
    "scroll",
    function () {
      if (scrollBadgeTimer) clearTimeout(scrollBadgeTimer);
      scrollBadgeTimer = setTimeout(updateViewportNumberBadges, 140);
    },
    { passive: true }
  );

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
