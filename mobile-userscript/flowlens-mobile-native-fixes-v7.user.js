// ==UserScript==
// @name         瀑光 FlowLens 手机原生修复 V7
// @namespace    local.flowlens.mobile.native.v7
// @version      1.4.7
// @description  配合桌面核心脚本：图片贴顶、左上角信息、筛选按钮图标、大图自动切换、视频结束下一条。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMobileNativeFixesV7) return;
  window.__flowLensMobileNativeFixesV7 = true;

  let autoPlaying = false;
  let autoTimer = 0;
  let applyTimer = 0;
  let guardUntil = 0;
  let centerTimer = 0;
  let lastZoom = "";
  let lastMedia = "";

  const HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.9c-2-2.1-5.2-1.9-7.1.3L12 7.1l-1.7-1.9C8.4 3 5.2 2.8 3.2 4.9 1 7.1 1.1 10.7 3.4 13l8.1 7.6c.3.3.7.3 1 0l8.1-7.6c2.3-2.3 2.4-5.9.2-8.1Z"/></svg>';
  const ICONS = {
    all: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.4"/><path d="M6.8 17 11 13l3 2.8 2-2.1L20 17"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="11" height="12" rx="2"/><path d="m15 10 5-3v10l-5-3z"/></svg>'
  };

  const css = `
    html.xiv-active #xiv-root #xiv-stage {
      padding-top: calc(4px + env(safe-area-inset-top, 0px)) !important;
      padding-right: max(4px, env(safe-area-inset-right, 0px)) !important;
      padding-left: max(4px, env(safe-area-inset-left, 0px)) !important;
    }
    html.xiv-active #xiv-root #xiv-topbar {
      min-height: 40px !important;
      padding: calc(5px + env(safe-area-inset-top, 0px)) max(6px, env(safe-area-inset-right, 0px)) 3px max(7px, env(safe-area-inset-left, 0px)) !important;
      background: linear-gradient(to bottom, rgba(0,0,0,.34), rgba(0,0,0,.08), rgba(0,0,0,0)) !important;
      pointer-events: none !important;
    }
    html.xiv-active #xiv-root #xiv-topbar .xiv-pill {
      position: fixed !important;
      left: max(7px, env(safe-area-inset-left, 0px)) !important;
      top: calc(5px + env(safe-area-inset-top, 0px)) !important;
      z-index: 2147483600 !important;
      max-width: 48vw !important;
      color: #fff !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      text-shadow: 0 1px 4px rgba(0,0,0,.96), 0 0 13px rgba(0,0,0,.72) !important;
      pointer-events: none !important;
      font-size: 14px !important;
      font-weight: 900 !important;
      padding: 0 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
    }
    html.xiv-active #xiv-root #xiv-topbar .xiv-actions {
      position: fixed !important;
      right: max(6px, env(safe-area-inset-right, 0px)) !important;
      top: calc(5px + env(safe-area-inset-top, 0px)) !important;
      left: auto !important;
      z-index: 2147483646 !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: flex-end !important;
      gap: 5px !important;
      flex-wrap: nowrap !important;
      pointer-events: auto !important;
      width: auto !important;
      max-width: 50vw !important;
      margin: 0 !important;
      transform: none !important;
    }
    html.xiv-active #xiv-root #xiv-topbar [data-xiv="filter-cycle"] {
      width: 40px !important;
      min-width: 40px !important;
      height: 36px !important;
      padding: 0 !important;
      display: grid !important;
      place-items: center !important;
    }
    html.xiv-active #xiv-root #xiv-topbar [data-xiv="filter-cycle"] svg {
      width: 20px !important;
      height: 20px !important;
      color: #111 !important;
      stroke: currentColor !important;
    }
    html.xiv-active #xiv-root #xiv-topbar .xiv-btn,
    html.xiv-active #xiv-root #xiv-topbar .xiv-select,
    #xiv-lightbox .xiv-lightbox-fav,
    #xiv-lightbox .xiv-lightbox-close,
    #xiv-lightbox .xiv-lightbox-arrow,
    #xiv-mobile-auto-v7 {
      background: rgba(230,230,230,.72) !important;
      color: #111 !important;
      border-color: rgba(255,255,255,.35) !important;
      box-shadow: 0 10px 24px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.22) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
    }
    #xiv-lightbox, #xiv-lightbox * { animation: none !important; transition: none !important; }
    #xiv-lightbox[data-zoom="actual"] { display: block !important; scroll-behavior: auto !important; overscroll-behavior: contain !important; }
    #xiv-lightbox[data-zoom="actual"] > img {
      max-width: none !important; max-height: none !important; margin: 0 auto !important;
      opacity: 1 !important; filter: none !important; transform: none !important; touch-action: none !important;
    }
    #xiv-mobile-auto-v7 {
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
    #xiv-mobile-auto-v7::before { content: "▶"; margin-left: 2px; }
    #xiv-mobile-auto-v7[data-playing="true"] { background: rgba(180,210,255,.82) !important; border-color: rgba(116,173,255,.75) !important; }
    #xiv-mobile-auto-v7[data-playing="true"]::before { content: "Ⅱ"; margin-left: 0; letter-spacing: -2px; }
    @media (max-width: 380px) {
      html.xiv-active #xiv-root #xiv-topbar .xiv-pill { max-width: 42vw !important; font-size: 13px !important; }
      html.xiv-active #xiv-root #xiv-topbar .xiv-actions { max-width: 54vw !important; gap: 4px !important; }
      #xiv-mobile-auto-v7 { right: 110px !important; width: 40px !important; height: 40px !important; min-width: 40px !important; }
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-mobile-native-v7-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-mobile-native-v7-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }
  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { const node = document.getElementById("xiv-lightbox"); return node?.dataset.active === "true" ? node : null; }
  function filterSelect() { return root()?.querySelector('[data-xiv="filter"]'); }
  function filterValue() { return filterSelect()?.value || "all"; }
  function setFilter(value) { const s = filterSelect(); if (!s) return; s.value = value; s.dispatchEvent(new Event("change", { bubbles: true })); syncFilterButton(); }
  function cycleFilter() { const order = ["all", "image", "video"]; setFilter(order[(Math.max(0, order.indexOf(filterValue())) + 1) % order.length]); }
  function syncFilterButton() {
    const old = root()?.querySelector('[data-xiv="top"]');
    if (old) {
      const btn = old.cloneNode(false);
      btn.className = old.className;
      btn.dataset.xiv = "filter-cycle";
      old.replaceWith(btn);
    }
    const btn = root()?.querySelector('[data-xiv="filter-cycle"]');
    if (!btn) return;
    const val = filterValue();
    btn.innerHTML = ICONS[val] || ICONS.all;
    btn.title = val === "image" ? "当前：只看图片" : val === "video" ? "当前：只看视频" : "当前：全部";
    if (btn.dataset.flBound !== "true") {
      btn.dataset.flBound = "true";
      const h = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); cycleFilter(); };
      ["pointerdown", "touchstart", "mousedown", "click", "touchend"].forEach((t) => btn.addEventListener(t, h, true));
    }
  }
  function clickNext() {
    const lb = lightbox();
    if (!lb) { stopAuto(); return; }
    const arrow = lb.querySelector('.xiv-lightbox-arrow[data-side="right"]');
    if (arrow) arrow.click();
    else window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
  }
  function stopAuto() { autoPlaying = false; clearInterval(autoTimer); autoTimer = 0; syncAutoButton(); }
  function startAuto() { autoPlaying = true; clearInterval(autoTimer); syncAutoButton(); setTimeout(clickNext, 150); autoTimer = setInterval(clickNext, 1400); }
  function toggleAuto() { autoPlaying ? stopAuto() : startAuto(); }
  function syncAutoButton() {
    document.querySelectorAll(".xiv-lightbox-auto-next, [id^='xiv-mobile-auto']").forEach((n) => { if (n.id !== "xiv-mobile-auto-v7") n.remove(); });
    const rt = root(); const lb = lightbox(); let btn = document.getElementById("xiv-mobile-auto-v7");
    if (!rt || !lb) { btn?.remove(); return; }
    if (!btn) {
      btn = document.createElement("button"); btn.id = "xiv-mobile-auto-v7"; btn.type = "button"; btn.title = "自动切换大图";
      const h = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); const now = Date.now(); if (now < guardUntil) return; guardUntil = now + 360; toggleAuto(); };
      ["pointerdown", "touchstart", "mousedown", "click", "touchend"].forEach((t) => btn.addEventListener(t, h, true));
      rt.appendChild(btn);
    }
    btn.dataset.playing = autoPlaying ? "true" : "false";
  }
  function ensureVideoHeart() {
    const lb = lightbox(); if (!lb) return;
    const isVideo = !!lb.querySelector("video, iframe[data-media-url], .xiv-video-frame[data-media-url]");
    if (!isVideo || lb.querySelector(".xiv-lightbox-fav")) return;
    const close = lb.querySelector(".xiv-lightbox-close");
    const b = document.createElement("button"); b.className = "xiv-lightbox-fav"; b.type = "button"; b.title = "保存视频"; b.innerHTML = HEART;
    lb.insertBefore(b, close || lb.firstChild);
  }
  function bindVideoEnd() {
    const lb = lightbox(); if (!lb) return;
    lb.querySelectorAll("video").forEach((v) => { if (v.dataset.flEndV7 === "true") return; v.dataset.flEndV7 = "true"; v.addEventListener("ended", () => { if (autoPlaying) setTimeout(clickNext, 160); }); });
  }
  window.addEventListener("message", (e) => { const m = e.data || {}; if (autoPlaying && m.type === "XIV_VIDEO_TIME" && m.eventName === "ended") setTimeout(clickNext, 160); });
  function markUserMoved() { const lb = lightbox(); if (lb?.dataset.zoom === "actual") lb.dataset.flUserMovedActual = "true"; }
  function currentMediaUrl() { const n = lightbox()?.querySelector("img, video, iframe[data-media-url]"); return n?.dataset?.mediaUrl || n?.currentSrc || n?.src || ""; }
  function centerOnce(force = false) {
    const lb = lightbox(); const img = lb?.querySelector("img");
    if (!lb || !img || lb.dataset.zoom !== "actual" || lb.dataset.flUserMovedActual === "true") return;
    if (!img.complete || !img.naturalWidth || !img.naturalHeight) { img.addEventListener("load", () => centerOnce(true), { once: true }); return; }
    const token = [img.currentSrc || img.src, lb.clientWidth, lb.clientHeight, img.naturalWidth, img.naturalHeight].join("|");
    if (!force && lb.dataset.flV7Centered === token) return;
    lb.dataset.flV7Centered = token;
    const run = () => { if (lb.dataset.active !== "true" || lb.dataset.zoom !== "actual" || lb.dataset.flUserMovedActual === "true") return; lb.scrollLeft = Math.max(0, Math.round((lb.scrollWidth - lb.clientWidth) / 2)); lb.scrollTop = Math.max(0, Math.round((lb.scrollHeight - lb.clientHeight) / 2)); };
    requestAnimationFrame(run); clearTimeout(centerTimer); centerTimer = setTimeout(run, 80);
  }
  function apply() {
    injectStyle(); syncFilterButton(); syncAutoButton(); ensureVideoHeart(); bindVideoEnd();
    const lb = lightbox(); const zoom = lb?.dataset.zoom || ""; const media = currentMediaUrl();
    if (lb && (zoom !== lastZoom || media !== lastMedia)) { lastZoom = zoom; lastMedia = media; delete lb.dataset.flUserMovedActual; if (zoom === "actual") centerOnce(true); }
    if (!lb && autoPlaying) stopAuto();
  }
  function scheduleApply() { clearTimeout(applyTimer); applyTimer = setTimeout(apply, 80); }
  document.addEventListener("pointerdown", (e) => { if (e.target?.closest?.("#xiv-lightbox img")) markUserMoved(); }, true);
  document.addEventListener("touchstart", (e) => { if (e.target?.closest?.("#xiv-lightbox img")) markUserMoved(); }, true);
  document.addEventListener("scroll", (e) => { if (e.target?.id === "xiv-lightbox") markUserMoved(); }, true);
  new MutationObserver(scheduleApply).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "data-zoom", "src", "class", "value"] });
  injectStyle(); setInterval(apply, 500); scheduleApply();
})();
