// ==UserScript==
// @name         瀑光 FlowLens 手机最终交互修复
// @namespace    local.flowlens.mobile.final
// @version      1.4.1
// @description  修复手机端左上角文字、图片贴顶、播放按钮误关闭、1:1 手动移动被重置等问题。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMobileFinalFixes) return;
  window.__flowLensMobileFinalFixes = true;

  let autoPlaying = false;
  let autoTimer = 0;
  let centerTimer = 0;
  let applyTimer = 0;
  let lastZoom = "";
  let lastImage = "";

  const css = `
    html.xiv-active #xiv-root #xiv-stage {
      padding-top: calc(4px + env(safe-area-inset-top, 0px)) !important;
      padding-right: max(4px, env(safe-area-inset-right, 0px)) !important;
      padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px)) !important;
      padding-left: max(4px, env(safe-area-inset-left, 0px)) !important;
    }
    html.xiv-active #xiv-root #xiv-topbar {
      min-height: 40px !important;
      padding: calc(5px + env(safe-area-inset-top, 0px)) max(6px, env(safe-area-inset-right, 0px)) 3px max(7px, env(safe-area-inset-left, 0px)) !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      background: linear-gradient(to bottom, rgba(0,0,0,.38), rgba(0,0,0,.08), rgba(0,0,0,0)) !important;
      pointer-events: none !important;
    }
    html.xiv-active #xiv-root #xiv-topbar .xiv-pill {
      display: inline-flex !important;
      visibility: visible !important;
      opacity: 1 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      padding: 0 !important;
      margin: 0 !important;
      height: auto !important;
      min-height: 0 !important;
      max-width: 50vw !important;
      color: #fff !important;
      text-shadow: 0 1px 4px rgba(0,0,0,.95), 0 0 12px rgba(0,0,0,.65) !important;
      font-size: 14px !important;
      line-height: 1.2 !important;
      font-weight: 900 !important;
      gap: 6px !important;
      pointer-events: none !important;
      overflow: hidden !important;
      white-space: nowrap !important;
    }
    html.xiv-active #xiv-root[data-theme="light"] #xiv-topbar .xiv-pill {
      color: #111 !important;
      text-shadow: 0 1px 4px rgba(255,255,255,.96), 0 0 10px rgba(255,255,255,.86) !important;
    }
    html.xiv-active #xiv-root #xiv-counter,
    html.xiv-active #xiv-root #xiv-status {
      display: inline-block !important;
      max-width: 24vw !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    html.xiv-active #xiv-root #xiv-topbar .xiv-actions {
      display: inline-flex !important;
      gap: 5px !important;
      pointer-events: auto !important;
    }
    html.xiv-active #xiv-root #xiv-topbar .xiv-btn {
      width: 36px !important;
      min-width: 36px !important;
      height: 36px !important;
      background: rgba(18,18,20,.42) !important;
      border-color: rgba(255,255,255,.2) !important;
    }
    #xiv-lightbox,
    #xiv-lightbox *,
    #xiv-lightbox[data-zoom="actual"] > img {
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
      transform: none !important;
      filter: none !important;
      touch-action: none !important;
    }
    #xiv-mobile-auto-next-final {
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
      border: 1px solid rgba(255,255,255,.28) !important;
      background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.24), rgba(18,18,20,.74)) !important;
      color: #fff !important;
      pointer-events: auto !important;
      padding: 0 !important;
      box-shadow: 0 12px 30px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.18) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      font: 900 16px/1 system-ui, sans-serif !important;
    }
    #xiv-mobile-auto-next-final::before { content: "▶"; margin-left: 2px; }
    #xiv-mobile-auto-next-final[data-playing="true"] {
      background: radial-gradient(circle at 32% 24%, rgba(92,158,255,.46), rgba(15,70,190,.82)) !important;
      border-color: rgba(116,173,255,.75) !important;
    }
    #xiv-mobile-auto-next-final[data-playing="true"]::before { content: "Ⅱ"; margin-left: 0; letter-spacing: -2px; }
    @media (max-width: 380px) {
      html.xiv-active #xiv-root #xiv-topbar .xiv-pill { max-width: 45vw !important; font-size: 13px !important; }
      html.xiv-active #xiv-root #xiv-status { display: none !important; }
      #xiv-mobile-auto-next-final { right: 112px !important; width: 40px !important; height: 40px !important; min-width: 40px !important; }
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-mobile-final-fixes-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-mobile-final-fixes-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { const node = document.getElementById("xiv-lightbox"); return node?.dataset.active === "true" ? node : null; }
  function currentImage() { return lightbox()?.querySelector("img") || null; }
  function imageToken() { const img = currentImage(); return img ? (img.currentSrc || img.src || "") : ""; }

  function stopAuto() {
    autoPlaying = false;
    clearInterval(autoTimer);
    autoTimer = 0;
    syncButton();
  }

  function nextImage() {
    const lb = lightbox();
    if (!lb) { stopAuto(); return; }
    const arrow = lb.querySelector('.xiv-lightbox-arrow[data-side="right"]');
    if (arrow) arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }

  function toggleAuto() {
    if (autoPlaying) { stopAuto(); return; }
    autoPlaying = true;
    clearInterval(autoTimer);
    autoTimer = setInterval(nextImage, 1200);
    syncButton();
  }

  function syncButton() {
    document.querySelectorAll(".xiv-lightbox-auto-next, #xiv-mobile-auto-next").forEach((node) => node.remove());
    const rt = root();
    const lb = lightbox();
    let btn = document.getElementById("xiv-mobile-auto-next-final");
    if (!lb || !rt) {
      btn?.remove();
      return;
    }
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "xiv-mobile-auto-next-final";
      btn.type = "button";
      btn.title = "自动切换大图";
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        toggleAuto();
      }, true);
      rt.appendChild(btn);
    }
    btn.dataset.playing = autoPlaying ? "true" : "false";
  }

  function markUserMoved() {
    const lb = lightbox();
    if (lb?.dataset.zoom === "actual") lb.dataset.flUserMovedActual = "true";
  }

  function centerActualOnce(force = false) {
    const lb = lightbox();
    const img = currentImage();
    if (!lb || !img || lb.dataset.zoom !== "actual") return;
    if (lb.dataset.dragging === "true" || lb.dataset.flUserMovedActual === "true") return;
    if (!img.complete || !img.naturalWidth || !img.naturalHeight) {
      img.addEventListener("load", () => centerActualOnce(true), { once: true });
      return;
    }
    const token = [imageToken(), lb.clientWidth, lb.clientHeight, img.naturalWidth, img.naturalHeight].join("|");
    if (!force && lb.dataset.flFinalCentered === token) return;
    lb.dataset.flFinalCentered = token;
    const run = () => {
      if (lb.dataset.active !== "true" || lb.dataset.zoom !== "actual" || lb.dataset.flUserMovedActual === "true") return;
      lb.scrollLeft = Math.max(0, Math.round((lb.scrollWidth - lb.clientWidth) / 2));
      lb.scrollTop = Math.max(0, Math.round((lb.scrollHeight - lb.clientHeight) / 2));
    };
    requestAnimationFrame(run);
    clearTimeout(centerTimer);
    centerTimer = setTimeout(run, 80);
  }

  function apply() {
    injectStyle();
    syncButton();
    const lb = lightbox();
    const zoom = lb?.dataset.zoom || "";
    const img = imageToken();
    if (lb && (zoom !== lastZoom || img !== lastImage)) {
      lastZoom = zoom;
      lastImage = img;
      delete lb.dataset.flUserMovedActual;
      if (zoom === "actual") centerActualOnce(true);
    }
  }

  function scheduleApply() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(apply, 60);
  }

  document.addEventListener("pointerdown", (event) => {
    if (event.target?.closest?.("#xiv-lightbox img") && lightbox()?.dataset.zoom === "actual") markUserMoved();
  }, true);
  document.addEventListener("touchstart", (event) => {
    if (event.target?.closest?.("#xiv-lightbox img") && lightbox()?.dataset.zoom === "actual") markUserMoved();
  }, true);
  document.addEventListener("wheel", (event) => {
    if (event.target?.closest?.("#xiv-lightbox") && lightbox()?.dataset.zoom === "actual") markUserMoved();
  }, true);
  document.addEventListener("scroll", (event) => {
    if (event.target?.id === "xiv-lightbox" && lightbox()?.dataset.zoom === "actual") markUserMoved();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key?.toLowerCase() === "p" && lightbox()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      toggleAuto();
    }
    if (event.key === "Escape") stopAuto();
  }, true);

  new MutationObserver(scheduleApply).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-active", "data-zoom", "src", "class"]
  });

  window.addEventListener("resize", () => setTimeout(() => centerActualOnce(true), 120), { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(() => centerActualOnce(true), 260), { passive: true });

  injectStyle();
  setInterval(apply, 600);
  scheduleApply();
})();
