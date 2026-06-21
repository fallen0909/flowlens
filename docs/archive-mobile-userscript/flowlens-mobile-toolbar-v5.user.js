// ==UserScript==
// @name         瀑光 FlowLens 手机工具栏修复 V5
// @namespace    local.flowlens.mobile.toolbar.v5
// @version      1.4.5
// @description  修复右侧工具栏被挤到左边、与左上角信息重叠；视频大图模式恢复爱心保存按钮。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMobileToolbarV5) return;
  window.__flowLensMobileToolbarV5 = true;

  let timer = 0;

  const HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.9c-2-2.1-5.2-1.9-7.1.3L12 7.1l-1.7-1.9C8.4 3 5.2 2.8 3.2 4.9 1 7.1 1.1 10.7 3.4 13l8.1 7.6c.3.3.7.3 1 0l8.1-7.6c2.3-2.3 2.4-5.9.2-8.1Z"/></svg>';

  const css = `
    html.xiv-active #xiv-root #xiv-topbar {
      display: flex !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
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
      transform: none !important;
      margin: 0 !important;
    }
    html.xiv-active #xiv-root #xiv-topbar .xiv-actions > * {
      flex: 0 0 auto !important;
    }
    html.xiv-active #xiv-root #xiv-topbar .xiv-btn,
    html.xiv-active #xiv-root #xiv-topbar .xiv-select,
    #xiv-lightbox .xiv-lightbox-fav,
    #xiv-lightbox .xiv-lightbox-close,
    #xiv-lightbox .xiv-lightbox-arrow,
    #xiv-mobile-auto-v4,
    #xiv-mobile-auto-v5 {
      background: rgba(230,230,230,.72) !important;
      color: #111 !important;
      border-color: rgba(255,255,255,.35) !important;
      box-shadow: 0 10px 24px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.22) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
    }
    #xiv-lightbox .xiv-lightbox-fav {
      display: grid !important;
      visibility: visible !important;
      opacity: 1 !important;
      position: fixed !important;
      right: 166px !important;
      top: max(18px, calc(12px + env(safe-area-inset-top, 0px))) !important;
      z-index: 2147483647 !important;
      place-items: center !important;
      width: 42px !important;
      height: 42px !important;
      min-width: 42px !important;
      border-radius: 999px !important;
      pointer-events: auto !important;
      padding: 0 !important;
    }
    #xiv-lightbox .xiv-lightbox-fav svg {
      width: 22px !important;
      height: 22px !important;
      stroke: currentColor !important;
      color: #111 !important;
    }
    #xiv-lightbox .xiv-lightbox-fav[data-video-save="true"][data-saved="true"] {
      background: rgba(255,208,220,.86) !important;
      color: #d2184e !important;
    }
    #xiv-mobile-auto-v4,
    #xiv-mobile-auto-v5 {
      right: 118px !important;
      z-index: 2147483647 !important;
    }
    @media (max-width: 380px) {
      html.xiv-active #xiv-root #xiv-topbar .xiv-pill { max-width: 42vw !important; }
      html.xiv-active #xiv-root #xiv-topbar .xiv-actions { max-width: 54vw !important; gap: 4px !important; }
      #xiv-lightbox .xiv-lightbox-fav { right: 156px !important; width: 40px !important; height: 40px !important; min-width: 40px !important; }
      #xiv-mobile-auto-v4, #xiv-mobile-auto-v5 { right: 110px !important; }
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-mobile-toolbar-v5-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-mobile-toolbar-v5-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function lightbox() {
    const node = document.getElementById("xiv-lightbox");
    return node?.dataset.active === "true" ? node : null;
  }

  function currentVideoUrl() {
    const lb = lightbox();
    const media = lb?.querySelector("video, iframe[data-media-url], .xiv-video-frame[data-media-url]");
    return media?.dataset?.mediaUrl || media?.dataset?.sourceUrl || media?.currentSrc || media?.src || "";
  }

  function isVideoMode() {
    const lb = lightbox();
    if (!lb) return false;
    return !!lb.querySelector("video, iframe[data-media-url], .xiv-video-frame[data-media-url]");
  }

  function saveVideo(url, button) {
    if (!url) return;
    try {
      const a = document.createElement("a");
      a.href = url;
      const name = (() => {
        try {
          const parsed = new URL(url, location.href);
          return (parsed.pathname.split("/").pop() || "flowlens-video.mp4").replace(/[\\/:*?"<>|]+/g, "_");
        } catch { return "flowlens-video.mp4"; }
      })();
      a.download = name || "flowlens-video.mp4";
      a.rel = "noopener";
      document.documentElement.appendChild(a);
      a.click();
      a.remove();
      button.dataset.saved = "true";
      button.title = "已触发视频保存";
      setTimeout(() => { button.dataset.saved = "false"; button.title = "保存视频"; }, 1600);
    } catch { /* ignore */ }
  }

  function ensureVideoHeart() {
    const lb = lightbox();
    if (!lb || !isVideoMode()) return;
    let button = lb.querySelector(".xiv-lightbox-fav");
    if (!button) {
      button = document.createElement("button");
      button.className = "xiv-lightbox-fav";
      button.type = "button";
      button.innerHTML = HEART;
      lb.appendChild(button);
    }
    button.dataset.videoSave = "true";
    button.title = "保存视频";
    if (button.dataset.flVideoHeartBound !== "true") {
      button.dataset.flVideoHeartBound = "true";
      const handler = (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        saveVideo(currentVideoUrl(), button);
      };
      ["pointerdown", "touchstart", "mousedown", "click", "touchend"].forEach((type) => button.addEventListener(type, handler, true));
    }
  }

  function apply() {
    injectStyle();
    ensureVideoHeart();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(apply, 60);
  }

  injectStyle();
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-active", "class", "src", "style"]
  });
  setInterval(apply, 500);
  schedule();
})();
