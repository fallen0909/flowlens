// ==UserScript==
// @name         瀑光 FlowLens 手机布局修复
// @namespace    local.flowlens.layout
// @version      1.2.10
// @description  修复手机端顶部留白、黑线和工具栏占位问题。
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMobileLayoutFix) return;
  window.__flowLensMobileLayoutFix = true;

  const OVERBLEED = 3;
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
      padding-top: max(13px, calc(env(safe-area-inset-top, 0px) + 13px)) !important;
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
      padding-top: calc(13px + env(safe-area-inset-top, 0px)) !important;
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
  `;

  function inject() {
    let style = document.getElementById("xiv-fl-mobile-layout-fix-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "xiv-fl-mobile-layout-fix-style";
      (document.head || document.documentElement).appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
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
    const stage = document.getElementById("xiv-stage");
    if (stage) {
      stage.style.setProperty("padding-top", "max(13px, calc(env(safe-area-inset-top, 0px) + 13px))", "important");
      stage.style.setProperty("background", "transparent", "important");
    }
  }

  inject();
  repaintRoot();
  new MutationObserver(() => {
    inject();
    repaintRoot();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "data-theme", "style", "class"] });
  setInterval(repaintRoot, 700);
})();
