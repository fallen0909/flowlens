(() => {
  if (window.__flowLensTopFix) return;
  window.__flowLensTopFix = true;

  const OVERBLEED = 3;
  const css = `
    html.xiv-active,
    html.xiv-active body {
      background: #050505 !important;
    }
    #xiv-root[data-active="true"] {
      top: -${OVERBLEED}px !important;
      right: -${OVERBLEED}px !important;
      bottom: -${OVERBLEED}px !important;
      left: -${OVERBLEED}px !important;
      width: calc(100vw + ${OVERBLEED * 2}px) !important;
      height: calc(100dvh + ${OVERBLEED * 2}px) !important;
      max-height: none !important;
      border: 0 !important;
      outline: 0 !important;
      box-shadow: none !important;
    }
    #xiv-root[data-active="true"][data-theme="dark"] {
      background: #050505 !important;
    }
    #xiv-root[data-active="true"][data-theme="dark"] #xiv-stage {
      background: #050505 !important;
    }
    #xiv-root[data-active="true"][data-theme="dark"] .xiv-stage-safe-cover {
      background: #050505 !important;
    }
    #xiv-root[data-active="true"] #xiv-stage {
      padding-top: max(13px, calc(env(safe-area-inset-top, 0px) + 13px)) !important;
      padding-left: calc(max(6px, env(safe-area-inset-left, 0px)) + ${OVERBLEED}px) !important;
      padding-right: calc(max(6px, env(safe-area-inset-right, 0px)) + ${OVERBLEED}px) !important;
    }
    #xiv-root[data-active="true"] #xiv-grid {
      margin-top: 0 !important;
      padding-top: 0 !important;
      border-top: 0 !important;
      box-shadow: none !important;
    }
    #xiv-root[data-active="true"] #xiv-topbar {
      top: 0 !important;
      padding-top: calc(13px + env(safe-area-inset-top, 0px)) !important;
      padding-left: calc(max(8px, env(safe-area-inset-left, 0px)) + ${OVERBLEED}px) !important;
      padding-right: calc(max(8px, env(safe-area-inset-right, 0px)) + ${OVERBLEED}px) !important;
      background: transparent !important;
      pointer-events: none !important;
      box-shadow: none !important;
      border: 0 !important;
    }
    #xiv-root[data-active="true"] #xiv-topbar .xiv-pill,
    #xiv-root[data-active="true"] #xiv-topbar .xiv-actions,
    #xiv-root[data-active="true"] #xiv-topbar .xiv-btn,
    #xiv-root[data-active="true"] #xiv-topbar .xiv-select {
      pointer-events: auto !important;
    }
    #xiv-root[data-active="true"]::before,
    #xiv-root[data-active="true"]::after,
    #xiv-root[data-active="true"] #xiv-topbar::before,
    #xiv-root[data-active="true"] #xiv-topbar::after {
      content: none !important;
      display: none !important;
      height: 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
    }
    @media (max-width: 820px) {
      #xiv-root[data-active="true"] #xiv-topbar {
        display: flex !important;
        align-items: flex-start !important;
        justify-content: space-between !important;
        gap: 6px !important;
        min-height: calc(54px + env(safe-area-inset-top, 0px)) !important;
        z-index: 2147483647 !important;
      }
      #xiv-root[data-active="true"] #xiv-topbar .xiv-pill {
        display: inline-flex !important;
        visibility: visible !important;
        opacity: 1 !important;
        flex: 0 1 auto !important;
        min-width: 0 !important;
        max-width: calc(100vw - 178px) !important;
        min-height: 28px !important;
        padding: 0 !important;
        overflow: hidden !important;
        white-space: nowrap !important;
        background: transparent !important;
        color: #fff !important;
        border: 0 !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        text-shadow: 0 1px 2px rgba(0,0,0,.72), 0 0 10px rgba(0,0,0,.46) !important;
      }
      #xiv-root[data-active="true"][data-theme="light"] #xiv-topbar .xiv-pill {
        background: transparent !important;
        color: #fff !important;
        border-color: transparent !important;
      }
      #xiv-root[data-active="true"] #xiv-counter,
      #xiv-root[data-active="true"] #xiv-status {
        display: inline !important;
        visibility: visible !important;
      }
      #xiv-root[data-active="true"] #xiv-status {
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      #xiv-root[data-active="true"] #xiv-topbar .xiv-actions {
        flex: 0 0 auto !important;
      }
    }
  `;

  function inject() {
    let style = document.getElementById("xiv-fl-topfix-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "xiv-fl-topfix-style";
      document.documentElement.appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
  }

  inject();
  new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
})();
