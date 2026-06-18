// ==UserScript==
// @name         瀑光 FlowLens 手机布局修正补丁
// @namespace    local.flowlens.mobile.layout.v2
// @version      1.3.9
// @description  手机端顶部信息纯文字、图片贴顶、1:1 放大不闪、自动切换按钮强制显示。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMobileLayoutV2) return;
  window.__flowLensMobileLayoutV2 = true;

  let applyTimer = 0;
  let autoTimer = 0;
  let autoPlaying = false;
  let centerTimer = 0;

  const css = `
    html.xiv-active #xiv-root #xiv-stage {
      padding-top: calc(6px + env(safe-area-inset-top, 0px)) !important;
      padding-right: max(4px, env(safe-area-inset-right, 0px)) !important;
      padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px)) !important;
      padding-left: max(4px, env(safe-area-inset-left, 0px)) !important;
    }
    html.xiv-active #xiv-root #xiv-topbar {
      min-height: 42px !important;
      height: auto !important;
      padding-top: calc(5px + env(safe-area-inset-top, 0px)) !important;
      padding-right: max(6px, env(safe-area-inset-right, 0px)) !important;
      padding-bottom: 4px !important;
      padding-left: max(7px, env(safe-area-inset-left, 0px)) !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 4px !important;
      background: linear-gradient(to bottom, rgba(0,0,0,.46), rgba(0,0,0,.12), rgba(0,0,0,0)) !important;
      pointer-events: none !important;
    }
    html.xiv-active #xiv-root[data-theme="light"] #xiv-topbar {
      background: linear-gradient(to bottom, rgba(244,244,241,.42), rgba(244,244,241,.1), rgba(244,244,241,0)) !important;
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
      color: #fff !important;
      text-shadow: 0 1px 3px rgba(0,0,0,.9), 0 0 10px rgba(0,0,0,.55) !important;
      height: auto !important;
      min-height: 0 !important;
      max-width: 48vw !important;
      padding: 2px 0 0 0 !important;
      margin: 0 !important;
      gap: 5px !important;
      font-size: 12px !important;
      line-height: 1.2 !important;
      font-weight: 850 !important;
      overflow: hidden !important;
      white-space: nowrap !important;
      pointer-events: none !important;
    }
    html.xiv-active #xiv-root[data-theme="light"] #xiv-topbar .xiv-pill {
      color: #111 !important;
      text-shadow: 0 1px 4px rgba(255,255,255,.95), 0 0 9px rgba(255,255,255,.82) !important;
    }
    html.xiv-active #xiv-root #xiv-counter,
    html.xiv-active #xiv-root #xiv-status {
      display: inline-block !important;
      max-width: 24vw !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    html.xiv-active #xiv-root #xiv-status { opacity: .9 !important; }
    html.xiv-active #xiv-root #xiv-topbar .xiv-actions {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      flex-wrap: nowrap !important;
      pointer-events: auto !important;
    }
    html.xiv-active #xiv-root #xiv-topbar .xiv-btn {
      width: 36px !important;
      min-width: 36px !important;
      height: 36px !important;
      background: rgba(18,18,20,.42) !important;
      border-color: rgba(255,255,255,.2) !important;
      box-shadow: 0 8px 20px rgba(0,0,0,.22) !important;
    }
    html.xiv-active #xiv-root[data-theme="light"] #xiv-topbar .xiv-btn {
      background: rgba(255,255,255,.55) !important;
      border-color: rgba(0,0,0,.12) !important;
    }
    #xiv-lightbox,
    #xiv-lightbox *,
    #xiv-lightbox[data-zoom="actual"] > img,
    #xiv-lightbox[data-fl-centering="true"] > img,
    #xiv-lightbox[data-fl-center-silent="true"] > img {
      animation: none !important;
      transition: none !important;
    }
    #xiv-lightbox[data-fl-centering="true"] > img,
    #xiv-lightbox[data-fl-center-silent="true"] > img,
    #xiv-lightbox[data-zoom="actual"] > img {
      opacity: 1 !important;
      filter: none !important;
      transform: none !important;
    }
    #xiv-lightbox[data-zoom="actual"] {
      scroll-behavior: auto !important;
      overscroll-behavior: contain !important;
      display: block !important;
    }
    #xiv-lightbox[data-zoom="actual"] > img {
      max-width: none !important;
      max-height: none !important;
      margin: 0 auto !important;
      touch-action: none !important;
    }
    #xiv-mobile-auto-next,
    .xiv-lightbox-auto-next {
      display: grid !important;
      visibility: visible !important;
      opacity: 1 !important;
      position: fixed !important;
      right: 118px !important;
      top: max(18px, calc(12px + env(safe-area-inset-top, 0px))) !important;
      z-index: 2147483647 !important;
      width: 42px !important;
      height: 42px !important;
      min-width: 42px !important;
      border-radius: 999px !important;
      border: 1px solid rgba(255,255,255,.28) !important;
      background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.24), rgba(18,18,20,.74)) !important;
      color: #fff !important;
      place-items: center !important;
      pointer-events: auto !important;
      cursor: pointer !important;
      padding: 0 !important;
      box-shadow: 0 12px 30px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.18) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      font: 900 16px/1 system-ui, sans-serif !important;
    }
    #xiv-mobile-auto-next::before,
    .xiv-lightbox-auto-next::before { content: "▶" !important; margin-left: 2px !important; }
    #xiv-mobile-auto-next[data-playing="true"],
    .xiv-lightbox-auto-next[data-playing="true"] {
      background: radial-gradient(circle at 32% 24%, rgba(92,158,255,.46), rgba(15,70,190,.82)) !important;
      border-color: rgba(116,173,255,.75) !important;
    }
    #xiv-mobile-auto-next[data-playing="true"]::before,
    .xiv-lightbox-auto-next[data-playing="true"]::before { content: "Ⅱ" !important; margin-left: 0 !important; letter-spacing: -2px !important; }
    @media (max-width: 380px) {
      html.xiv-active #xiv-root #xiv-topbar .xiv-pill { max-width: 42vw !important; }
      html.xiv-active #xiv-root #xiv-status { display: none !important; }
      #xiv-mobile-auto-next, .xiv-lightbox-auto-next { right: 112px !important; width: 40px !important; height: 40px !important; min-width: 40px !important; }
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-mobile-layout-v2-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-mobile-layout-v2-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function lightbox() {
    const node = document.getElementById("xiv-lightbox");
    return node?.dataset.active === "true" ? node : null;
  }

  function currentImage() {
    return lightbox()?.querySelector("img") || null;
  }

  function clickNext() {
    const lb = lightbox();
    if (!lb) { stopAuto(); return; }
    const arrow = lb.querySelector('.xiv-lightbox-arrow[data-side="right"]');
    if (arrow) arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    else document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
  }

  function stopAuto() {
    autoPlaying = false;
    clearInterval(autoTimer);
    autoTimer = 0;
    syncButton();
  }

  function toggleAuto() {
    if (autoPlaying) { stopAuto(); return; }
    autoPlaying = true;
    clearInterval(autoTimer);
    autoTimer = window.setInterval(clickNext, 1200);
    syncButton();
  }

  function syncButton() {
    const lb = lightbox();
    document.querySelectorAll("#xiv-mobile-auto-next").forEach((node) => { if (!lb || node.parentElement !== lb) node.remove(); });
    if (!lb) return;
    let button = lb.querySelector("#xiv-mobile-auto-next") || lb.querySelector(".xiv-lightbox-auto-next");
    if (!button) {
      button = document.createElement("button");
      button.id = "xiv-mobile-auto-next";
      button.className = "xiv-lightbox-auto-next";
      button.type = "button";
      button.title = "自动切换大图";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        toggleAuto();
      });
      lb.appendChild(button);
    }
    button.dataset.playing = autoPlaying ? "true" : "false";
    button.style.setProperty("display", "grid", "important");
    button.style.setProperty("visibility", "visible", "important");
    button.style.setProperty("opacity", "1", "important");
  }

  function centerActual(force = false) {
    const lb = lightbox();
    const img = currentImage();
    if (!lb || !img || lb.dataset.zoom !== "actual") return;
    if (lb.dataset.dragging === "true") return;
    if (!img.complete || !img.naturalWidth || !img.naturalHeight) {
      img.addEventListener("load", () => centerActual(true), { once: true });
      return;
    }
    const token = [img.currentSrc || img.src, lb.clientWidth, lb.clientHeight, img.naturalWidth, img.naturalHeight].join("|");
    if (!force && lb.dataset.flLayoutV2Centered === token) return;
    lb.dataset.flLayoutV2Centered = token;
    delete lb.dataset.flCentering;
    delete lb.dataset.flCenterSilent;
    const run = () => {
      if (lb.dataset.active !== "true" || lb.dataset.zoom !== "actual" || lb.dataset.dragging === "true") return;
      const left = Math.max(0, Math.round((lb.scrollWidth - lb.clientWidth) / 2));
      const top = Math.max(0, Math.round((lb.scrollHeight - lb.clientHeight) / 2));
      lb.scrollLeft = left;
      lb.scrollTop = top;
      delete lb.dataset.flCentering;
      delete lb.dataset.flCenterSilent;
    };
    requestAnimationFrame(run);
    clearTimeout(centerTimer);
    centerTimer = window.setTimeout(run, 70);
  }

  function apply() {
    injectStyle();
    syncButton();
    const lb = lightbox();
    if (lb?.dataset.zoom === "actual") centerActual(false);
    if (!lb && autoPlaying) stopAuto();
  }

  function scheduleApply() {
    clearTimeout(applyTimer);
    applyTimer = window.setTimeout(apply, 60);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key?.toLowerCase() === "p" && lightbox()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      toggleAuto();
    }
    if (event.key === "Escape") stopAuto();
  }, true);

  new MutationObserver((mutations) => {
    let forceCenter = false;
    for (const mutation of mutations) {
      if (mutation.target?.id === "xiv-lightbox" && ["data-zoom", "data-active"].includes(mutation.attributeName || "")) forceCenter = true;
      if (mutation.target?.tagName === "IMG" && mutation.target.closest?.("#xiv-lightbox")) forceCenter = true;
      if ([...mutation.addedNodes].some((node) => node?.nodeType === 1 && (node.matches?.("#xiv-lightbox img") || node.querySelector?.("#xiv-lightbox img")))) forceCenter = true;
    }
    scheduleApply();
    if (forceCenter) window.setTimeout(() => centerActual(true), 20);
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-active", "data-zoom", "src", "class", "style"]
  });

  window.addEventListener("resize", () => window.setTimeout(() => centerActual(true), 120), { passive: true });
  window.addEventListener("orientationchange", () => window.setTimeout(() => centerActual(true), 260), { passive: true });

  injectStyle();
  window.setInterval(apply, 500);
  scheduleApply();
})();
