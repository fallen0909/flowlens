// ==UserScript==
// @name         瀑光 FlowLens 手机布局修复
// @namespace    local.flowlens.layout
// @version      1.2.8
// @description  修复手机端顶部留白、黑线和工具栏占位问题。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMobileLayoutFix) return;
  window.__flowLensMobileLayoutFix = true;

  const css = `
    #xiv-root[data-active="true"] {
      background: #050505 !important;
    }
    #xiv-root[data-active="true"][data-theme="light"] {
      background: #f4f4f1 !important;
    }
    #xiv-root[data-active="true"]::before {
      height: 0 !important;
      background: transparent !important;
    }
    #xiv-root[data-active="true"] #xiv-stage {
      padding-top: max(10px, env(safe-area-inset-top, 0px)) !important;
      padding-left: max(6px, env(safe-area-inset-left, 0px)) !important;
      padding-right: max(6px, env(safe-area-inset-right, 0px)) !important;
      background: transparent !important;
    }
    #xiv-root[data-active="true"] #xiv-grid {
      margin-top: 0 !important;
      padding-top: 0 !important;
      background: transparent !important;
    }
    #xiv-root[data-active="true"] #xiv-topbar {
      background: transparent !important;
      pointer-events: none !important;
      box-shadow: none !important;
      border: 0 !important;
    }
    #xiv-root[data-active="true"] #xiv-topbar::before,
    #xiv-root[data-active="true"] #xiv-topbar::after {
      display: none !important;
    }
    #xiv-root[data-active="true"] #xiv-topbar .xiv-pill,
    #xiv-root[data-active="true"] #xiv-topbar .xiv-actions,
    #xiv-root[data-active="true"] #xiv-topbar .xiv-btn,
    #xiv-root[data-active="true"] #xiv-topbar .xiv-select {
      pointer-events: auto !important;
    }
  `;

  function inject() {
    let style = document.getElementById("xiv-fl-mobile-layout-fix-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "xiv-fl-mobile-layout-fix-style";
      document.documentElement.appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
  }

  inject();
  new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
})();
