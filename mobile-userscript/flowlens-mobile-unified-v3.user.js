// ==UserScript==
// @name         瀑光 FlowLens 手机统一大图控制 V3
// @namespace    local.flowlens.mobile.unified.v3
// @version      1.4.3
// @description  固定左上角信息、接管大图左右切换/自动切换，按当前筛选只在图片或视频内切换，视频结束自动下一条。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMobileUnifiedV3) return;
  window.__flowLensMobileUnifiedV3 = true;

  const VIDEO_RE = /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i;
  let autoPlaying = false;
  let autoTimer = 0;
  let lastTileUrl = "";
  let applyTimer = 0;
  let centerTimer = 0;
  let lastZoom = "";
  let lastMediaToken = "";

  const css = `
    html.xiv-active #xiv-root #xiv-topbar {
      min-height: 40px !important;
      padding: calc(5px + env(safe-area-inset-top, 0px)) max(6px, env(safe-area-inset-right, 0px)) 3px max(7px, env(safe-area-inset-left, 0px)) !important;
      background: linear-gradient(to bottom, rgba(0,0,0,.34), rgba(0,0,0,.08), rgba(0,0,0,0)) !important;
      pointer-events: none !important;
    }
    html.xiv-active #xiv-root #xiv-stage { padding-top: calc(4px + env(safe-area-inset-top, 0px)) !important; }
    html.xiv-active #xiv-root #xiv-topbar .xiv-pill {
      position: fixed !important;
      left: max(7px, env(safe-area-inset-left, 0px)) !important;
      top: calc(5px + env(safe-area-inset-top, 0px)) !important;
      z-index: 2147483647 !important;
      display: inline-flex !important;
      visibility: visible !important;
      opacity: 1 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      color: #fff !important;
      text-shadow: 0 1px 4px rgba(0,0,0,.95), 0 0 12px rgba(0,0,0,.72) !important;
      font-size: 14px !important;
      line-height: 1.2 !important;
      font-weight: 900 !important;
      padding: 0 !important;
      margin: 0 !important;
      max-width: 54vw !important;
      pointer-events: none !important;
      white-space: nowrap !important;
      overflow: hidden !important;
    }
    html.xiv-active #xiv-root #xiv-counter,
    html.xiv-active #xiv-root #xiv-status {
      color: #fff !important;
      display: inline-block !important;
      max-width: 26vw !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    html.xiv-active #xiv-root #xiv-status { opacity: .9 !important; }
    html.xiv-active #xiv-root #xiv-topbar .xiv-actions { pointer-events: auto !important; }
    html.xiv-active #xiv-root #xiv-topbar .xiv-btn,
    html.xiv-active #xiv-root #xiv-topbar .xiv-select,
    #xiv-lightbox .xiv-lightbox-fav,
    #xiv-lightbox .xiv-lightbox-close,
    #xiv-lightbox .xiv-lightbox-arrow,
    #xiv-mobile-auto-v3 {
      background: rgba(230,230,230,.72) !important;
      color: #111 !important;
      border-color: rgba(255,255,255,.35) !important;
      box-shadow: 0 10px 24px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.22) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
    }
    #xiv-lightbox,
    #xiv-lightbox * { animation: none !important; transition: none !important; }
    #xiv-lightbox[data-zoom="actual"] { display: block !important; scroll-behavior: auto !important; overscroll-behavior: contain !important; }
    #xiv-lightbox[data-zoom="actual"] > img {
      max-width: none !important; max-height: none !important; margin: 0 auto !important;
      opacity: 1 !important; filter: none !important; transform: none !important; touch-action: none !important;
    }
    #xiv-mobile-auto-v3 {
      position: fixed !important;
      right: 118px !important;
      top: max(18px, calc(12px + env(safe-area-inset-top, 0px))) !important;
      z-index: 2147483647 !important;
      display: grid !important;
      place-items: center !important;
      visibility: visible !important;
      opacity: 1 !important;
      width: 42px !important;
      height: 42px !important;
      min-width: 42px !important;
      border-radius: 999px !important;
      pointer-events: auto !important;
      padding: 0 !important;
      font: 900 16px/1 system-ui, sans-serif !important;
    }
    #xiv-mobile-auto-v3::before { content: "▶"; margin-left: 2px; }
    #xiv-mobile-auto-v3[data-playing="true"] { background: rgba(180,210,255,.82) !important; border-color: rgba(116,173,255,.75) !important; }
    #xiv-mobile-auto-v3[data-playing="true"]::before { content: "Ⅱ"; margin-left: 0; letter-spacing: -2px; }
    @media (max-width: 380px) {
      html.xiv-active #xiv-root #xiv-topbar .xiv-pill { font-size: 13px !important; max-width: 46vw !important; }
      html.xiv-active #xiv-root #xiv-status { display: none !important; }
      #xiv-mobile-auto-v3 { right: 112px !important; width: 40px !important; height: 40px !important; min-width: 40px !important; }
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-mobile-unified-v3-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-mobile-unified-v3-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { const node = document.getElementById("xiv-lightbox"); return node?.dataset.active === "true" ? node : null; }
  function currentMedia() { return lightbox()?.querySelector("img, video, iframe[data-media-url], .xiv-video-frame[data-media-url]") || null; }
  function currentMediaUrl() {
    const m = currentMedia();
    return m?.dataset?.mediaUrl || m?.dataset?.sourceUrl || m?.currentSrc || m?.src || "";
  }
  function isVideo(url) { return VIDEO_RE.test(String(url || "")); }
  function currentFilter() {
    const value = root()?.querySelector('[data-xiv="filter"]')?.value || "all";
    return ["image", "video"].includes(value) ? value : "all";
  }
  function sameMedia(a, b) {
    if (!a || !b) return false;
    const clean = (url) => String(url).split("#")[0].split("?")[0].replace(/-\d+x\d+(?=\.[^.]+$)/, "");
    return a === b || clean(a) === clean(b) || clean(a).endsWith(clean(b).split("/").pop() || "_") || clean(b).endsWith(clean(a).split("/").pop() || "_");
  }
  function allTiles() {
    return [...document.querySelectorAll("#xiv-grid .xiv-tile[data-url]")].sort((a, b) => Number(a.dataset.index || 0) - Number(b.dataset.index || 0));
  }
  function filteredTiles() {
    const filter = currentFilter();
    return allTiles().filter((tile) => {
      const url = tile.dataset.url || "";
      if (filter === "image" && isVideo(url)) return false;
      if (filter === "video" && !isVideo(url)) return false;
      if (tile.hidden) return false;
      return true;
    });
  }
  function currentTileIndex(tiles) {
    const mediaUrl = currentMediaUrl();
    let index = tiles.findIndex((tile) => tile.dataset.url === lastTileUrl);
    if (index >= 0) return index;
    index = tiles.findIndex((tile) => sameMedia(tile.dataset.url || "", mediaUrl));
    return index >= 0 ? index : 0;
  }
  function openTile(tile) {
    if (!tile) return false;
    lastTileUrl = tile.dataset.url || "";
    const rect = tile.getBoundingClientRect?.() || { left: 10, top: 10 };
    tile.dataset.downX = String(rect.left + 6);
    tile.dataset.downY = String(rect.top + 6);
    tile.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, clientX: rect.left + 6, clientY: rect.top + 6, button: 0 }));
    tile.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, clientX: rect.left + 6, clientY: rect.top + 6, button: 0 }));
    return true;
  }
  function navigate(delta) {
    const tiles = filteredTiles();
    if (!tiles.length) return;
    const current = currentTileIndex(tiles);
    const next = tiles[(current + delta + tiles.length) % tiles.length];
    openTile(next);
  }

  function stopAuto() {
    autoPlaying = false;
    clearInterval(autoTimer);
    autoTimer = 0;
    syncButton();
  }
  function startAuto() {
    autoPlaying = true;
    clearInterval(autoTimer);
    autoTimer = setInterval(() => navigate(1), 1400);
    syncButton();
  }
  function toggleAuto() { autoPlaying ? stopAuto() : startAuto(); }

  function syncButton() {
    document.querySelectorAll(".xiv-lightbox-auto-next, #xiv-mobile-auto-next, #xiv-mobile-auto-next-final, #xiv-mobile-auto-next-v2").forEach((node) => node.remove());
    const rt = root();
    const lb = lightbox();
    let btn = document.getElementById("xiv-mobile-auto-v3");
    if (!rt || !lb) { btn?.remove(); return; }
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "xiv-mobile-auto-v3";
      btn.type = "button";
      btn.title = "自动切换大图";
      btn.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); }, true);
      btn.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); toggleAuto(); }, true);
      rt.appendChild(btn);
    }
    btn.dataset.playing = autoPlaying ? "true" : "false";
  }

  function markUserMoved() {
    const lb = lightbox();
    if (lb?.dataset.zoom === "actual") lb.dataset.flUserMovedActual = "true";
  }
  function centerOnce(force = false) {
    const lb = lightbox();
    const img = lb?.querySelector("img");
    if (!lb || !img || lb.dataset.zoom !== "actual" || lb.dataset.flUserMovedActual === "true") return;
    if (!img.complete || !img.naturalWidth || !img.naturalHeight) { img.addEventListener("load", () => centerOnce(true), { once: true }); return; }
    const token = [img.currentSrc || img.src, lb.clientWidth, lb.clientHeight, img.naturalWidth, img.naturalHeight].join("|");
    if (!force && lb.dataset.flUnifiedCentered === token) return;
    lb.dataset.flUnifiedCentered = token;
    const run = () => {
      if (lb.dataset.active !== "true" || lb.dataset.zoom !== "actual" || lb.dataset.flUserMovedActual === "true") return;
      lb.scrollLeft = Math.max(0, Math.round((lb.scrollWidth - lb.clientWidth) / 2));
      lb.scrollTop = Math.max(0, Math.round((lb.scrollHeight - lb.clientHeight) / 2));
    };
    requestAnimationFrame(run);
    clearTimeout(centerTimer);
    centerTimer = setTimeout(run, 80);
  }

  function bindVideoEnd() {
    const lb = lightbox();
    if (!lb) return;
    lb.querySelectorAll("video").forEach((video) => {
      if (video.dataset.flUnifiedEnded === "true") return;
      video.dataset.flUnifiedEnded = "true";
      video.addEventListener("ended", () => { if (autoPlaying) setTimeout(() => navigate(1), 160); });
    });
  }

  window.addEventListener("message", (event) => {
    const msg = event.data || {};
    if (autoPlaying && msg.type === "XIV_VIDEO_TIME" && msg.eventName === "ended") setTimeout(() => navigate(1), 160);
  });

  document.addEventListener("click", (event) => {
    const tile = event.target?.closest?.("#xiv-grid .xiv-tile[data-url]");
    if (tile) lastTileUrl = tile.dataset.url || lastTileUrl;
    const arrow = event.target?.closest?.("#xiv-lightbox .xiv-lightbox-arrow");
    if (arrow && lightbox()) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      navigate(arrow.dataset.side === "right" ? 1 : -1);
    }
  }, true);
  document.addEventListener("keydown", (event) => {
    if (!lightbox()) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      navigate(event.key === "ArrowRight" ? 1 : -1);
    } else if (event.key?.toLowerCase() === "p") {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); toggleAuto();
    } else if (event.key === "Escape") stopAuto();
  }, true);
  document.addEventListener("pointerdown", (event) => { if (event.target?.closest?.("#xiv-lightbox img")) markUserMoved(); }, true);
  document.addEventListener("touchstart", (event) => { if (event.target?.closest?.("#xiv-lightbox img")) markUserMoved(); }, true);
  document.addEventListener("scroll", (event) => { if (event.target?.id === "xiv-lightbox") markUserMoved(); }, true);

  function apply() {
    injectStyle(); syncButton(); bindVideoEnd();
    const lb = lightbox();
    const zoom = lb?.dataset.zoom || "";
    const media = currentMediaUrl();
    if (lb && (zoom !== lastZoom || media !== lastMediaToken)) {
      lastZoom = zoom; lastMediaToken = media; delete lb.dataset.flUserMovedActual;
      if (zoom === "actual") centerOnce(true);
    }
    if (!lb && autoPlaying) stopAuto();
  }
  function scheduleApply() { clearTimeout(applyTimer); applyTimer = setTimeout(apply, 60); }
  new MutationObserver(scheduleApply).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "data-zoom", "src", "class", "hidden"] });
  injectStyle(); setInterval(apply, 500); scheduleApply();
})();
