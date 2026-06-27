(() => {
  if (window.__flowLensNativeButtonStyle) return;
  window.__flowLensNativeButtonStyle = true;
  const style = document.createElement("style");
  style.id = "flowlens-native-lightbox-button-style";
  style.textContent = `
    #xiv-lightbox .xiv-lightbox-slideshow,
    #xiv-lightbox .xiv-lightbox-fav,
    #xiv-lightbox .xiv-lightbox-close {
      position: fixed !important;
      top: max(18px, env(safe-area-inset-top, 0px) + 16px) !important;
      width: 64px !important;
      height: 64px !important;
      min-width: 64px !important;
      min-height: 64px !important;
      border-radius: 999px !important;
      border: 1px solid rgba(0,0,0,.12) !important;
      background: rgba(255,255,255,.96) !important;
      color: #0b0b0d !important;
      box-shadow: 0 10px 26px rgba(0,0,0,.14), inset 0 1px 0 rgba(255,255,255,.8) !important;
      display: grid !important;
      place-items: center !important;
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: auto !important;
      padding: 0 !important;
      margin: 0 !important;
      transform: translateZ(0) !important;
      transition: none !important;
      -webkit-tap-highlight-color: transparent !important;
    }
    #xiv-lightbox .xiv-lightbox-slideshow { right: 160px !important; }
    #xiv-lightbox .xiv-lightbox-fav { right: 89px !important; }
    #xiv-lightbox .xiv-lightbox-close { right: 18px !important; }
    #xiv-lightbox .xiv-lightbox-slideshow::before {
      content: "";
      display: block;
      width: 0;
      height: 0;
      margin-left: 5px;
      border-left: 22px solid currentColor;
      border-top: 15px solid transparent;
      border-bottom: 15px solid transparent;
    }
    #xiv-lightbox .xiv-lightbox-slideshow[data-active="true"]::before {
      width: 22px;
      height: 28px;
      margin-left: 0;
      border: 0;
      background: linear-gradient(to right, currentColor 0 7px, transparent 7px 15px, currentColor 15px 22px);
    }
    #xiv-lightbox .xiv-lightbox-fav svg,
    #xiv-lightbox .xiv-lightbox-close svg { width: 34px !important; height: 34px !important; display: block !important; filter: none !important; }
    #xiv-lightbox .xiv-lightbox-fav svg path { stroke-width: 2.6 !important; }
    #xiv-lightbox .xiv-lightbox-fav[data-favorited="true"] { color: #e11d48 !important; border-color: rgba(225,29,72,.28) !important; }
    #xiv-lightbox .xiv-lightbox-fav[data-favorited="true"] svg { fill: currentColor !important; stroke: currentColor !important; }
    #xiv-lightbox .xiv-lightbox-close svg path { stroke-width: 2.8 !important; }
    @media (max-width: 820px) {
      #xiv-lightbox .xiv-lightbox-slideshow,
      #xiv-lightbox .xiv-lightbox-fav,
      #xiv-lightbox .xiv-lightbox-close {
        top: max(12px, env(safe-area-inset-top, 0px) + 10px) !important;
        width: 58px !important;
        height: 58px !important;
        min-width: 58px !important;
        min-height: 58px !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow { right: 150px !important; }
      #xiv-lightbox .xiv-lightbox-fav { right: 81px !important; }
      #xiv-lightbox .xiv-lightbox-close { right: 12px !important; }
      #xiv-lightbox .xiv-lightbox-fav svg,
      #xiv-lightbox .xiv-lightbox-close svg { width: 30px !important; height: 30px !important; }
    }
  `;
  document.documentElement.appendChild(style);
})();
