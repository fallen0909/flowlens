// ==UserScript==
// @name         瀑光 FlowLens 手机顶部白线遮罩
// @namespace    local.flowlens.edge.mask
// @version      1.2.19
// @description  专门覆盖手机 Edge/一加浏览器全屏大图顶部露出的 1px 白线。
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensEdgeMask) return;
  window.__flowLensEdgeMask = true;

  const css = `
    html.xiv-active,
    html.xiv-active body {
      background: #050505 !important;
    }

    #xiv-root[data-active="true"] {
      top: -10px !important;
      right: -10px !important;
      bottom: -10px !important;
      left: -10px !important;
      width: calc(100vw + 20px) !important;
      height: calc(100dvh + 20px) !important;
      background: #050505 !important;
      overflow: hidden !important;
    }

    #xiv-root[data-active="true"][data-theme="light"] {
      background: #f4f4f1 !important;
    }

    #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"] {
      background: #050505 !important;
      border: 0 !important;
      outline: 0 !important;
      box-shadow: none !important;
    }

    #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"]::before {
      content: "" !important;
      position: fixed !important;
      left: 0 !important;
      right: 0 !important;
      top: 0 !important;
      height: 6px !important;
      background: #050505 !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      transform: translateZ(0) !important;
    }

    #xiv-fl-edge-mask {
      position: fixed !important;
      left: 0 !important;
      right: 0 !important;
      top: 0 !important;
      height: 6px !important;
      background: #050505 !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      display: none;
      transform: translateZ(0) !important;
    }

    html.xiv-active #xiv-fl-edge-mask,
    body:has(#xiv-root[data-active="true"]) #xiv-fl-edge-mask,
    body:has(#xiv-lightbox[data-active="true"]) #xiv-fl-edge-mask {
      display: block !important;
    }

    body:has(#xiv-root[data-theme="light"][data-active="true"]) #xiv-fl-edge-mask,
    #xiv-root[data-active="true"][data-theme="light"] #xiv-lightbox[data-active="true"]::before {
      background: #f4f4f1 !important;
    }
  `;

  function install() {
    let style = document.getElementById("xiv-fl-edge-mask-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "xiv-fl-edge-mask-style";
      (document.head || document.documentElement).appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;

    if (document.body && !document.getElementById("xiv-fl-edge-mask")) {
      const mask = document.createElement("div");
      mask.id = "xiv-fl-edge-mask";
      document.body.appendChild(mask);
    }
  }

  install();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  }
})();
