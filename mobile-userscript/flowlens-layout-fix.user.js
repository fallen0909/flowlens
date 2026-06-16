// ==UserScript==
// @name         瀑光 FlowLens 手机布局与交互修复
// @namespace    local.flowlens.layout
// @version      1.2.11
// @description  修复手机端顶部细线、点图放大、视频缩略图和工具栏占位问题。
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMobileLayoutFix) return;
  window.__flowLensMobileLayoutFix = true;

  const OVERBLEED = 8;
  let tapStart = null;
  let videoTimer = 0;

  const css = `
    html.xiv-active,
    html.xiv-active body {
      background: #050505 !important;
    }
    #xiv-root[data-active="true"] {
      position: fixed !important;
      top: -${OVERBLEED}px !important;
      right: -${OVERBLEED}px !important;
      bottom: -${OVERBLEED}px !important;
      left: -${OVERBLEED}px !important;
      width: calc(100vw + ${OVERBLEED * 2}px) !important;
      height: calc(100dvh + ${OVERBLEED * 2}px) !important;
      max-height: none !important;
      background: #050505 !important;
      border: 0 !important;
      outline: 0 !important;
      box-shadow: none !important;
      overflow: hidden !important;
    }
    #xiv-root[data-active="true"][data-theme="light"] {
      background: #f4f4f1 !important;
    }
    #xiv-root[data-active="true"]::before,
    #xiv-root[data-active="true"]::after {
      content: none !important;
      display: none !important;
      height: 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
    }
    #xiv-root[data-active="true"] #xiv-stage {
      padding-top: max(18px, calc(env(safe-area-inset-top, 0px) + 18px)) !important;
      padding-left: calc(max(6px, env(safe-area-inset-left, 0px)) + ${OVERBLEED}px) !important;
      padding-right: calc(max(6px, env(safe-area-inset-right, 0px)) + ${OVERBLEED}px) !important;
      padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px) + ${OVERBLEED}px) !important;
      background: transparent !important;
      border: 0 !important;
      outline: 0 !important;
      box-shadow: none !important;
    }
    #xiv-root[data-active="true"] #xiv-grid {
      margin-top: 0 !important;
      padding-top: 0 !important;
      background: transparent !important;
      border-top: 0 !important;
      box-shadow: none !important;
    }
    #xiv-root[data-active="true"] #xiv-topbar {
      top: 0 !important;
      margin: 0 !important;
      padding-top: calc(18px + env(safe-area-inset-top, 0px)) !important;
      padding-left: calc(max(8px, env(safe-area-inset-left, 0px)) + ${OVERBLEED}px) !important;
      padding-right: calc(max(8px, env(safe-area-inset-right, 0px)) + ${OVERBLEED}px) !important;
      background: transparent !important;
      pointer-events: none !important;
      box-shadow: none !important;
      border: 0 !important;
      outline: 0 !important;
    }
    #xiv-root[data-active="true"] #xiv-topbar::before,
    #xiv-root[data-active="true"] #xiv-topbar::after {
      content: none !important;
      display: none !important;
    }
    #xiv-root[data-active="true"] #xiv-topbar .xiv-pill,
    #xiv-root[data-active="true"] #xiv-topbar .xiv-actions,
    #xiv-root[data-active="true"] #xiv-topbar .xiv-btn,
    #xiv-root[data-active="true"] #xiv-topbar .xiv-select {
      pointer-events: auto !important;
    }
    #xiv-root[data-active="true"] .xiv-masonry-column,
    #xiv-root[data-active="true"] .xiv-tile {
      border-top: 0 !important;
      outline: 0 !important;
    }
    #xiv-root[data-active="true"] .xiv-tile video {
      display: block !important;
      width: 100% !important;
      min-height: 96px !important;
      background: #111 !important;
      object-fit: cover !important;
    }
    #xiv-root[data-active="true"] .xiv-tile video:not([data-fl-preview-ready="true"]) {
      background:
        radial-gradient(circle at center, rgba(255,255,255,.16) 0 18px, transparent 19px),
        linear-gradient(135deg, #181818, #050505) !important;
    }
    #xiv-fl-edge-cover {
      position: fixed !important;
      left: 0 !important;
      right: 0 !important;
      top: 0 !important;
      height: 4px !important;
      background: #050505 !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      display: none;
    }
    html.xiv-active #xiv-fl-edge-cover {
      display: block !important;
    }
    html.xiv-active:has(#xiv-root[data-theme="light"]) #xiv-fl-edge-cover {
      background: #f4f4f1 !important;
    }
  `;

  function inject() {
    let style = document.getElementById("xiv-fl-mobile-layout-fix-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "xiv-fl-mobile-layout-fix-style";
      (document.head || document.documentElement).appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;

    if (!document.getElementById("xiv-fl-edge-cover")) {
      const cover = document.createElement("div");
      cover.id = "xiv-fl-edge-cover";
      (document.body || document.documentElement).appendChild(cover);
    }
  }

  function repaintRoot() {
    const root = document.getElementById("xiv-root");
    if (!root || root.dataset.active !== "true") return;
    root.style.setProperty("top", `-${OVERBLEED}px`, "important");
    root.style.setProperty("right", `-${OVERBLEED}px`, "important");
    root.style.setProperty("bottom", `-${OVERBLEED}px`, "important");
    root.style.setProperty("left", `-${OVERBLEED}px`, "important");
    root.style.setProperty("width", `calc(100vw + ${OVERBLEED * 2}px)`, "important");
    root.style.setProperty("height", `calc(100dvh + ${OVERBLEED * 2}px)`, "important");
    root.style.setProperty("background", root.dataset.theme === "light" ? "#f4f4f1" : "#050505", "important");
    const cover = document.getElementById("xiv-fl-edge-cover");
    if (cover) cover.style.setProperty("background", root.dataset.theme === "light" ? "#f4f4f1" : "#050505", "important");
    const stage = document.getElementById("xiv-stage");
    if (stage) {
      stage.style.setProperty("padding-top", "max(18px, calc(env(safe-area-inset-top, 0px) + 18px))", "important");
      stage.style.setProperty("background", "transparent", "important");
    }
  }

  function tileFromTarget(target) {
    const tile = target?.closest?.("#xiv-root[data-active='true'] .xiv-tile");
    if (!tile) return null;
    if (target.closest?.("#xiv-topbar, #xiv-lightbox, button, a, select, input, textarea")) return null;
    return tile;
  }

  function bindTapToOpen() {
    document.addEventListener("pointerdown", (event) => {
      const tile = tileFromTarget(event.target);
      if (!tile) return;
      tapStart = { tile, x: event.clientX, y: event.clientY, t: Date.now(), pointerId: event.pointerId };
    }, true);

    document.addEventListener("pointerup", (event) => {
      if (!tapStart || tapStart.pointerId !== event.pointerId) return;
      const { tile, x, y, t } = tapStart;
      tapStart = null;
      if (!tile.isConnected) return;
      const dx = Math.abs(event.clientX - x);
      const dy = Math.abs(event.clientY - y);
      if (dx > 18 || dy > 18 || Date.now() - t > 650) return;
      event.preventDefault();
      event.stopPropagation();
      tile.dataset.downX = String(event.clientX);
      tile.dataset.downY = String(event.clientY);
      const keyEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true
      });
      tile.dispatchEvent(keyEvent);
    }, true);
  }

  function forceVideoPreview(video) {
    if (!video || !video.isConnected || video.dataset.flPreviewForced === "true") return;
    video.dataset.flPreviewForced = "true";
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.controls = false;

    const url = video.dataset.previewUrl || video.dataset.sourceUrl || video.currentSrc || video.src || "";
    if (url && !video.currentSrc && !video.src) {
      video.src = url;
      try { video.load(); } catch { /* ignore */ }
    }

    const markReady = () => {
      video.dataset.flPreviewReady = "true";
      try { video.pause(); } catch { /* ignore */ }
    };

    video.addEventListener("loadeddata", markReady, { once: true });
    video.addEventListener("canplay", markReady, { once: true });
    video.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(video.duration) && video.duration > 1) {
        try { video.currentTime = Math.min(0.6, video.duration - 0.2); } catch { /* ignore */ }
      }
    }, { once: true });

    window.setTimeout(() => {
      if (!video.isConnected || video.dataset.flPreviewReady === "true") return;
      video.preload = "auto";
      if (url && !video.currentSrc && !video.src) video.src = url;
      try { video.load(); } catch { /* ignore */ }
      video.play?.().then(() => {
        window.setTimeout(() => {
          try { video.pause(); } catch { /* ignore */ }
          video.dataset.flPreviewReady = "true";
        }, 180);
      }).catch(() => {});
    }, 1200);
  }

  function refreshVideoPreviews() {
    clearTimeout(videoTimer);
    videoTimer = window.setTimeout(() => {
      document.querySelectorAll("#xiv-root[data-active='true'] .xiv-tile video").forEach(forceVideoPreview);
    }, 120);
  }

  inject();
  repaintRoot();
  bindTapToOpen();
  refreshVideoPreviews();
  new MutationObserver(() => {
    inject();
    repaintRoot();
    refreshVideoPreviews();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "data-theme", "style", "class", "src"] });
  setInterval(() => {
    repaintRoot();
    refreshVideoPreviews();
  }, 900);
})();
