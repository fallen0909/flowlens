// ==UserScript==
// @name         瀑光 FlowLens 手机控制修复 V2
// @namespace    local.flowlens.mobile.control.v2
// @version      1.4.2
// @description  恢复右上角按钮样式、左上角白字、大图自动切换和视频结束自动下一条。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMobileControlV2) return;
  window.__flowLensMobileControlV2 = true;

  let autoPlaying = false;
  let autoTimer = 0;
  let applyTimer = 0;
  let centerTimer = 0;
  let lastZoom = "";
  let lastImage = "";

  const css = `
    html.xiv-active #xiv-root #xiv-topbar .xiv-pill {
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
      max-width: 52vw !important;
      pointer-events: none !important;
      white-space: nowrap !important;
      overflow: hidden !important;
    }
    html.xiv-active #xiv-root #xiv-counter,
    html.xiv-active #xiv-root #xiv-status {
      display: inline-block !important;
      color: #fff !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    html.xiv-active #xiv-root #xiv-status { opacity: .92 !important; max-width: 24vw !important; }
    html.xiv-active #xiv-root #xiv-stage {
      padding-top: calc(4px + env(safe-area-inset-top, 0px)) !important;
    }
    html.xiv-active #xiv-root #xiv-topbar {
      padding-top: calc(5px + env(safe-area-inset-top, 0px)) !important;
      padding-bottom: 3px !important;
      min-height: 40px !important;
      background: linear-gradient(to bottom, rgba(0,0,0,.34), rgba(0,0,0,.08), rgba(0,0,0,0)) !important;
    }
    html.xiv-active #xiv-root #xiv-topbar .xiv-btn,
    html.xiv-active #xiv-root #xiv-topbar .xiv-select,
    #xiv-lightbox .xiv-lightbox-fav,
    #xiv-lightbox .xiv-lightbox-close,
    #xiv-lightbox .xiv-lightbox-arrow,
    #xiv-mobile-auto-next-v2 {
      background: rgba(230,230,230,.72) !important;
      color: #111 !important;
      border-color: rgba(255,255,255,.35) !important;
      box-shadow: 0 10px 24px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.22) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
    }
    html.xiv-active #xiv-root #xiv-topbar .xiv-btn svg,
    #xiv-lightbox .xiv-lightbox-fav svg,
    #xiv-lightbox .xiv-lightbox-close svg {
      color: #111 !important;
      stroke: currentColor !important;
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
      animation: none !important;
      transition: none !important;
      touch-action: none !important;
    }
    #xiv-lightbox,
    #xiv-lightbox * {
      animation: none !important;
      transition: none !important;
    }
    #xiv-mobile-auto-next-v2 {
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
    #xiv-mobile-auto-next-v2::before { content: "▶"; margin-left: 2px; }
    #xiv-mobile-auto-next-v2[data-playing="true"] {
      background: rgba(180,210,255,.82) !important;
      border-color: rgba(116,173,255,.75) !important;
    }
    #xiv-mobile-auto-next-v2[data-playing="true"]::before { content: "Ⅱ"; margin-left: 0; letter-spacing: -2px; }
    @media (max-width: 380px) {
      html.xiv-active #xiv-root #xiv-topbar .xiv-pill { font-size: 13px !important; max-width: 46vw !important; }
      html.xiv-active #xiv-root #xiv-status { display: none !important; }
      #xiv-mobile-auto-next-v2 { right: 112px !important; width: 40px !important; height: 40px !important; min-width: 40px !important; }
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-mobile-control-v2-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-mobile-control-v2-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { const node = document.getElementById("xiv-lightbox"); return node?.dataset.active === "true" ? node : null; }
  function currentImage() { return lightbox()?.querySelector("img") || null; }
  function imageToken() { const img = currentImage(); return img ? (img.currentSrc || img.src || "") : ""; }

  function fireNext() {
    const lb = lightbox();
    if (!lb) { stopAuto(); return; }
    const arrow = lb.querySelector('.xiv-lightbox-arrow[data-side="right"]');
    if (arrow) {
      for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
        arrow.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
    }
    for (const target of [window, document, lb]) {
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
    }
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
    autoTimer = setInterval(fireNext, 1400);
    syncButton();
  }

  function toggleAuto() { autoPlaying ? stopAuto() : startAuto(); }

  function syncButton() {
    document.querySelectorAll(".xiv-lightbox-auto-next, #xiv-mobile-auto-next, #xiv-mobile-auto-next-final").forEach((node) => node.remove());
    const rt = root();
    const lb = lightbox();
    let btn = document.getElementById("xiv-mobile-auto-next-v2");
    if (!rt || !lb) { btn?.remove(); return; }
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "xiv-mobile-auto-next-v2";
      btn.type = "button";
      btn.title = "自动切换大图";
      const handler = (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        toggleAuto();
      };
      ["pointerdown", "touchstart", "mousedown", "click", "touchend"].forEach((type) => btn.addEventListener(type, handler, true));
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
    const img = currentImage();
    if (!lb || !img || lb.dataset.zoom !== "actual") return;
    if (lb.dataset.dragging === "true" || lb.dataset.flUserMovedActual === "true") return;
    if (!img.complete || !img.naturalWidth || !img.naturalHeight) {
      img.addEventListener("load", () => centerOnce(true), { once: true });
      return;
    }
    const token = [imageToken(), lb.clientWidth, lb.clientHeight, img.naturalWidth, img.naturalHeight].join("|");
    if (!force && lb.dataset.flControlV2Centered === token) return;
    lb.dataset.flControlV2Centered = token;
    const run = () => {
      if (lb.dataset.active !== "true" || lb.dataset.zoom !== "actual" || lb.dataset.flUserMovedActual === "true") return;
      lb.scrollLeft = Math.max(0, Math.round((lb.scrollWidth - lb.clientWidth) / 2));
      lb.scrollTop = Math.max(0, Math.round((lb.scrollHeight - lb.clientHeight) / 2));
    };
    requestAnimationFrame(run);
    clearTimeout(centerTimer);
    centerTimer = setTimeout(run, 80);
  }

  function bindVideoAutoNext() {
    const lb = lightbox();
    if (!lb) return;
    lb.querySelectorAll("video").forEach((video) => {
      if (video.dataset.flEndNextBound === "true") return;
      video.dataset.flEndNextBound = "true";
      video.addEventListener("ended", () => { if (autoPlaying) setTimeout(fireNext, 180); });
    });
  }

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (autoPlaying && message.type === "XIV_VIDEO_TIME" && message.eventName === "ended") setTimeout(fireNext, 180);
  });

  function apply() {
    injectStyle();
    syncButton();
    bindVideoAutoNext();
    const lb = lightbox();
    const zoom = lb?.dataset.zoom || "";
    const img = imageToken();
    if (lb && (zoom !== lastZoom || img !== lastImage)) {
      lastZoom = zoom;
      lastImage = img;
      delete lb.dataset.flUserMovedActual;
      if (zoom === "actual") centerOnce(true);
    }
    if (!lb && autoPlaying) stopAuto();
  }

  function scheduleApply() { clearTimeout(applyTimer); applyTimer = setTimeout(apply, 60); }

  document.addEventListener("pointerdown", (event) => { if (event.target?.closest?.("#xiv-lightbox img")) markUserMoved(); }, true);
  document.addEventListener("touchstart", (event) => { if (event.target?.closest?.("#xiv-lightbox img")) markUserMoved(); }, true);
  document.addEventListener("wheel", (event) => { if (event.target?.closest?.("#xiv-lightbox")) markUserMoved(); }, true);
  document.addEventListener("scroll", (event) => { if (event.target?.id === "xiv-lightbox") markUserMoved(); }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key?.toLowerCase() === "p" && lightbox()) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); toggleAuto();
    }
    if (event.key === "Escape") stopAuto();
  }, true);

  new MutationObserver(scheduleApply).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["data-active", "data-zoom", "src", "class"]
  });

  injectStyle();
  setInterval(apply, 500);
  scheduleApply();
})();
