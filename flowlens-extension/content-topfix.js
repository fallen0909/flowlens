(() => {
  if (window.__flowLensTopFix) return;
  window.__flowLensTopFix = true;

  const css = `
    #xiv-root[data-active="true"] #xiv-stage {
      padding-top: 0 !important;
    }
    #xiv-root[data-active="true"] #xiv-grid {
      margin-top: 0 !important;
      padding-top: 0 !important;
    }
    #xiv-root[data-active="true"] #xiv-topbar {
      background: transparent !important;
      pointer-events: none !important;
    }
    #xiv-root[data-active="true"] #xiv-topbar .xiv-pill,
    #xiv-root[data-active="true"] #xiv-topbar .xiv-actions,
    #xiv-root[data-active="true"] #xiv-topbar .xiv-btn,
    #xiv-root[data-active="true"] #xiv-topbar .xiv-select {
      pointer-events: auto !important;
    }
    #xiv-root[data-active="true"]::before {
      height: 0 !important;
      background: transparent !important;
    }
    @media (max-width: 820px) {
      #xiv-root[data-active="true"] #xiv-stage {
        padding-top: 0 !important;
      }
    }
  `;

  function inject() {
    if (document.getElementById("xiv-fl-topfix-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-fl-topfix-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  inject();
  new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
})();
