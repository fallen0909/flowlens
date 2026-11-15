(() => {
  // Visual layer only. Media lifetime, gesture recognition and navigation stay
  // in the core; this module installs no observers, timers or input handlers.
  if (document.getElementById('flowlens-interface-style')) return;
  const style = document.createElement('style');
  style.id = 'flowlens-interface-style';
  style.textContent = `
    #xiv-root {
      --fl-accent: #0a84ff;
      --fl-surface: #202124;
      --fl-border: rgba(255,255,255,.14);
      --fl-text: #f5f5f7;
      --fl-duration: 160ms;
      --fl-ease: cubic-bezier(.22,.68,0,1);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      -webkit-tap-highlight-color: transparent;
      color-scheme: dark;
    }
    #xiv-root[data-theme="light"] {
      --fl-accent: #007aff; --fl-surface: #fff;
      --fl-border: rgba(0,0,0,.1); --fl-text: #1d1d1f;
      color-scheme: light; background: #f2f2f7;
    }
    #xiv-root[data-active] .xiv-btn, #xiv-root[data-active] .xiv-select {
      border-color: var(--fl-border); font-weight: 600;
      background: var(--fl-surface); color: var(--fl-text);
      backdrop-filter: none; -webkit-backdrop-filter: none;
      touch-action: manipulation;
      transition: transform var(--fl-duration) var(--fl-ease), opacity var(--fl-duration) ease;
    }
    #xiv-root[data-active] .xiv-btn:not(:disabled):active { transform: scale(.94); opacity: .72; }
    #xiv-root[data-active] .xiv-btn:focus-visible, #xiv-root[data-active] .xiv-select:focus-visible,
    #xiv-root[data-active] .xiv-tile:focus-visible { outline: 3px solid var(--fl-accent); outline-offset: 3px; }
    #xiv-root[data-active] .xiv-btn:disabled { opacity: .35; }
    #xiv-root #xiv-lightbox :is(.xiv-lightbox-zoom, .xiv-lightbox-fav, .xiv-lightbox-close, .xiv-lightbox-slideshow, .xiv-lightbox-arrow) {
      box-sizing: border-box !important;
      width: 42px !important; height: 42px !important;
      min-width: 42px !important; min-height: 42px !important;
      padding: 0 !important; border-radius: 999px !important;
      border: 1px solid var(--fl-border) !important;
      background: var(--fl-surface) !important; color: var(--fl-text) !important;
      box-shadow: none !important; backdrop-filter: none !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      opacity: 1 !important; font-size: 0 !important; line-height: 0 !important;
      text-indent: 0 !important; touch-action: manipulation;
    }
    #xiv-root #xiv-lightbox .xiv-lightbox-arrow { margin-top: -21px !important; }
    #xiv-root #xiv-lightbox :is(.xiv-lightbox-zoom, .xiv-lightbox-fav, .xiv-lightbox-close, .xiv-lightbox-slideshow, .xiv-lightbox-arrow) svg {
      display: block !important; width: 18px !important; height: 18px !important;
      min-width: 18px !important; min-height: 18px !important;
      margin: 0 !important; padding: 0 !important; flex: 0 0 18px !important;
      transform: none !important; stroke-width: 2 !important;
    }
    #xiv-root #xiv-lightbox .xiv-lightbox-arrow::before,
    #xiv-root #xiv-lightbox .xiv-lightbox-arrow::after { content: none !important; display: none !important; }
    #xiv-root #xiv-lightbox .xiv-lightbox-fav[data-favorited="true"] { color: #e11d48 !important; }
    #xiv-root #xiv-lightbox .xiv-lightbox-zoom[data-active="true"] { color: var(--fl-accent) !important; }
    #xiv-root #xiv-lightbox button:focus-visible { outline: 3px solid var(--fl-accent); outline-offset: 3px; }
    #xiv-root[data-active] .xiv-panel {
      background: var(--fl-surface); color: var(--fl-text);
      border: 1px solid var(--fl-border); border-radius: 20px;
      box-shadow: 0 12px 40px rgba(0,0,0,.22);
      backdrop-filter: none; -webkit-backdrop-filter: none;
      overscroll-behavior: contain;
    }
    #xiv-root[data-active] .xiv-panel[data-open="true"] { animation: fl-panel-enter 180ms var(--fl-ease); }
    #xiv-root[data-active] .xiv-panel input, #xiv-root[data-active] .xiv-panel select { accent-color: var(--fl-accent); }
    #xiv-root[data-active] .xiv-tile { border-radius: 12px; box-shadow: none; }
    #xiv-root[data-active] .xiv-video-mark { backdrop-filter: none; background: rgba(20,20,22,.8); box-shadow: none; }
    #xiv-root[data-active] .xiv-tile img, #xiv-root[data-active] .xiv-tile video { transform: none; backface-visibility: visible; }
    @keyframes fl-panel-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    @media (hover: hover) and (pointer: fine) {
      #xiv-root[data-active] .xiv-btn:not(:disabled):hover { opacity: .8; }
    }
    @media (pointer: coarse), (max-width: 820px) {
      #xiv-root #xiv-lightbox :is(.xiv-lightbox-zoom, .xiv-lightbox-fav, .xiv-lightbox-close, .xiv-lightbox-slideshow, .xiv-lightbox-arrow) {
        width: 44px !important; height: 44px !important; min-width: 44px !important; min-height: 44px !important;
      }
      #xiv-root #xiv-lightbox .xiv-lightbox-arrow { margin-top: -22px !important; }
      #xiv-root[data-active] .xiv-btn { min-width: 44px; min-height: 44px; }
      #xiv-root[data-active="true"] #xiv-topbar .xiv-btn {
        min-width: 44px !important; width: 44px !important; height: 44px !important;
        flex: 0 0 44px !important;
      }
      #xiv-root[data-active="true"] #xiv-topbar .xiv-actions {
        min-width: 0 !important; flex: 0 1 auto !important;
        overflow-x: auto !important; overflow-y: hidden !important;
        justify-content: flex-start !important; touch-action: pan-x;
      }
      #xiv-root[data-active] .xiv-select { min-height: 44px; font-size: 16px; }
      #xiv-root[data-active] .xiv-panel input:not([type="range"]):not([type="checkbox"]),
      #xiv-root[data-active] .xiv-panel select { font-size: 16px; min-height: 44px; }
    }
    @media (prefers-reduced-motion: reduce) {
      #xiv-root[data-active] .xiv-btn, #xiv-root[data-active] .xiv-select { transition: none !important; }
      #xiv-root[data-active] .xiv-panel { animation: none !important; }
      #xiv-root[data-active] .xiv-btn:active { transform: none !important; }
    }
    @media (prefers-contrast: more) { #xiv-root { --fl-border: currentColor; } }
  `;
  document.documentElement.appendChild(style);
})();
