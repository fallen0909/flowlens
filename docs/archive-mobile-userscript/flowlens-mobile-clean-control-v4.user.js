// ==UserScript==
// @name         瀑光 FlowLens 手机干净控制 V4
// @namespace    local.flowlens.mobile.clean.v4
// @version      1.4.4
// @description  替换回顶部为筛选切换，恢复左上角固定信息，修复大图自动切换、筛选内左右切换和视频结束下一条。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMobileCleanControlV4) return;
  window.__flowLensMobileCleanControlV4 = true;

  let autoPlaying = false;
  let autoTimer = 0;
  let applyTimer = 0;
  let touchGuardUntil = 0;
  let centerTimer = 0;
  let lastZoom = "";
  let lastMedia = "";

  const css = `
    html.xiv-active #xiv-root #xiv-stage {
      padding-top: calc(4px + env(safe-area-inset-top, 0px)) !important;
    }
    html.xiv-active #xiv-root #xiv-topbar {
      min-height: 40px !important;
      padding: calc(5px + env(safe-area-inset-top, 0px)) max(6px, env(safe-area-inset-right, 0px)) 3px max(7px, env(safe-area-inset-left, 0px)) !important;
      background: linear-gradient(to bottom, rgba(0,0,0,.36), rgba(0,0,0,.08), rgba(0,0,0,0)) !important;
      pointer-events: none !important;
      justify-content: space-between !important;
      align-items: flex-start !important;
    }
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
      text-shadow: 0 1px 4px rgba(0,0,0,.96), 0 0 13px rgba(0,0,0,.72) !important;
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
    html.xiv-active #xiv-root #xiv-status { opacity: .92 !important; }
    html.xiv-active #xiv-root #xiv-topbar .xiv-actions { pointer-events: auto !important; }
    html.xiv-active #xiv-root #xiv-topbar .xiv-btn,
    html.xiv-active #xiv-root #xiv-topbar .xiv-select,
    #xiv-lightbox .xiv-lightbox-fav,
    #xiv-lightbox .xiv-lightbox-close,
    #xiv-lightbox .xiv-lightbox-arrow,
    #xiv-mobile-auto-v4 {
      background: rgba(230,230,230,.72) !important;
      color: #111 !important;
      border-color: rgba(255,255,255,.35) !important;
      box-shadow: 0 10px 24px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.22) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
    }
    html.xiv-active #xiv-root #xiv-topbar [data-xiv="top"] {
      font-size: 13px !important;
      font-weight: 950 !important;
      letter-spacing: 0 !important;
      min-width: 48px !important;
      width: 48px !important;
    }
    #xiv-lightbox,
    #xiv-lightbox * {
      animation: none !important;
      transition: none !important;
    }
    #xiv-lightbox[data-zoom="actual"] {
      display: block !important;
      scroll-behavior: auto !important;
      overscroll-behavior: contain !important;
    }
    #xiv-lightbox[data-zoom="actual"] > img {
      max-width: none !important;
      max-height: none !important;
      margin: 0 auto !important;
      opacity: 1 !important;
      filter: none !important;
      transform: none !important;
      touch-action: none !important;
    }
    #xiv-mobile-auto-v4 {
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
    #xiv-mobile-auto-v4::before { content: "▶"; margin-left: 2px; }
    #xiv-mobile-auto-v4[data-playing="true"] { background: rgba(180,210,255,.82) !important; border-color: rgba(116,173,255,.75) !important; }
    #xiv-mobile-auto-v4[data-playing="true"]::before { content: "Ⅱ"; margin-left: 0; letter-spacing: -2px; }
    @media (max-width: 380px) {
      html.xiv-active #xiv-root #xiv-topbar .xiv-pill { font-size: 13px !important; max-width: 46vw !important; }
      html.xiv-active #xiv-root #xiv-status { display: none !important; }
      #xiv-mobile-auto-v4 { right: 112px !important; width: 40px !important; height: 40px !important; min-width: 40px !important; }
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-mobile-clean-v4-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-mobile-clean-v4-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { const node = document.getElementById("xiv-lightbox"); return node?.dataset.active === "true" ? node : null; }
  function currentMedia() { return lightbox()?.querySelector("img, video, iframe[data-media-url], .xiv-video-frame[data-media-url]") || null; }
  function currentMediaUrl() {
    const node = currentMedia();
    return node?.dataset?.mediaUrl || node?.dataset?.sourceUrl || node?.currentSrc || node?.src || "";
  }
  function filterSelect() { return root()?.querySelector('[data-xiv="filter"]'); }
  function topButton() { return root()?.querySelector('[data-xiv="top"]'); }
  function filterValue() { return filterSelect()?.value || "all"; }
  function setFilter(value) {
    const select = filterSelect();
    if (!select) return;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    syncFilterButton();
  }
  function nextFilter() {
    const order = ["all", "image", "video"];
    const current = filterValue();
    setFilter(order[(Math.max(0, order.indexOf(current)) + 1) % order.length]);
  }
  function filterLabel(value = filterValue()) {
    return value === "image" ? "图片" : value === "video" ? "视频" : "全部";
  }
  function syncFilterButton() {
    const btn = topButton();
    if (!btn) return;
    btn.innerHTML = `<span>${filterLabel()}</span>`;
    btn.title = "切换：全部 / 只看图片 / 只看视频";
    btn.setAttribute("aria-label", btn.title);
  }
  function interceptTopButton() {
    const btn = topButton();
    if (!btn || btn.dataset.flFilterCycleBound === "true") return;
    btn.dataset.flFilterCycleBound = "true";
    const handler = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      nextFilter();
    };
    ["click", "pointerup", "touchend"].forEach((type) => btn.addEventListener(type, handler, true));
    syncFilterButton();
  }

  function fireCoreNext(delta = 1) {
    const lb = lightbox();
    if (!lb) { stopAuto(); return; }
    const side = delta > 0 ? "right" : "left";
    const arrow = lb.querySelector(`.xiv-lightbox-arrow[data-side="${side}"]`);
    if (arrow) {
      arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return;
    }
    window.dispatchEvent(new KeyboardEvent("keydown", { key: delta > 0 ? "ArrowRight" : "ArrowLeft", code: delta > 0 ? "ArrowRight" : "ArrowLeft", bubbles: true, cancelable: true }));
  }
  function stopAuto() {
    autoPlaying = false;
    clearInterval(autoTimer);
    autoTimer = 0;
    syncAutoButton();
  }
  function startAuto() {
    autoPlaying = true;
    clearInterval(autoTimer);
    autoTimer = setInterval(() => fireCoreNext(1), 1400);
    syncAutoButton();
  }
  function toggleAuto() { autoPlaying ? stopAuto() : startAuto(); }
  function syncAutoButton() {
    document.querySelectorAll(".xiv-lightbox-auto-next, #xiv-mobile-auto-next, #xiv-mobile-auto-next-final, #xiv-mobile-auto-next-v2, #xiv-mobile-auto-v3").forEach((node) => node.remove());
    const rt = root();
    const lb = lightbox();
    let btn = document.getElementById("xiv-mobile-auto-v4");
    if (!rt || !lb) { btn?.remove(); return; }
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "xiv-mobile-auto-v4";
      btn.type = "button";
      btn.title = "自动切换大图";
      const handler = (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        if (event.type === "touchend" || event.type === "pointerup") {
          const now = Date.now();
          if (now < touchGuardUntil) return;
          touchGuardUntil = now + 420;
          toggleAuto();
        } else if (event.type === "click" && Date.now() >= touchGuardUntil) {
          toggleAuto();
        }
      };
      ["pointerup", "touchend", "click"].forEach((type) => btn.addEventListener(type, handler, true));
      rt.appendChild(btn);
    }
    btn.dataset.playing = autoPlaying ? "true" : "false";
  }

  function bindVideoEnd() {
    const lb = lightbox();
    if (!lb) return;
    lb.querySelectorAll("video").forEach((video) => {
      if (video.dataset.flCleanEnded === "true") return;
      video.dataset.flCleanEnded = "true";
      video.addEventListener("ended", () => { if (autoPlaying) setTimeout(() => fireCoreNext(1), 160); });
    });
  }
  window.addEventListener("message", (event) => {
    const msg = event.data || {};
    if (autoPlaying && msg.type === "XIV_VIDEO_TIME" && msg.eventName === "ended") setTimeout(() => fireCoreNext(1), 160);
  });

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
    if (!force && lb.dataset.flCleanCentered === token) return;
    lb.dataset.flCleanCentered = token;
    const run = () => {
      if (lb.dataset.active !== "true" || lb.dataset.zoom !== "actual" || lb.dataset.flUserMovedActual === "true") return;
      lb.scrollLeft = Math.max(0, Math.round((lb.scrollWidth - lb.clientWidth) / 2));
      lb.scrollTop = Math.max(0, Math.round((lb.scrollHeight - lb.clientHeight) / 2));
    };
    requestAnimationFrame(run);
    clearTimeout(centerTimer);
    centerTimer = setTimeout(run, 80);
  }

  function bindFilterAwareArrows() {
    const lb = lightbox();
    if (!lb) return;
    lb.querySelectorAll(".xiv-lightbox-arrow").forEach((arrow) => {
      if (arrow.dataset.flCleanArrowBound === "true") return;
      arrow.dataset.flCleanArrowBound = "true";
      arrow.addEventListener("click", () => setTimeout(syncAutoButton, 20), true);
    });
  }
  function apply() {
    injectStyle();
    interceptTopButton();
    syncFilterButton();
    syncAutoButton();
    bindFilterAwareArrows();
    bindVideoEnd();
    const lb = lightbox();
    const zoom = lb?.dataset.zoom || "";
    const media = currentMediaUrl();
    if (lb && (zoom !== lastZoom || media !== lastMedia)) {
      lastZoom = zoom; lastMedia = media;
      delete lb.dataset.flUserMovedActual;
      if (zoom === "actual") centerOnce(true);
    }
    if (!lb && autoPlaying) stopAuto();
  }
  function scheduleApply() { clearTimeout(applyTimer); applyTimer = setTimeout(apply, 60); }
  document.addEventListener("pointerdown", (event) => { if (event.target?.closest?.("#xiv-lightbox img")) markUserMoved(); }, true);
  document.addEventListener("touchstart", (event) => { if (event.target?.closest?.("#xiv-lightbox img")) markUserMoved(); }, true);
  document.addEventListener("scroll", (event) => { if (event.target?.id === "xiv-lightbox") markUserMoved(); }, true);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") stopAuto(); }, true);
  new MutationObserver(scheduleApply).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "data-zoom", "src", "class", "value"] });
  injectStyle();
  setInterval(apply, 500);
  scheduleApply();
})();
