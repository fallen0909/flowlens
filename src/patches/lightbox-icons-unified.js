(() => {
  if (window.__flowLensLightboxIconsUnified) return;
  window.__flowLensLightboxIconsUnified = true;

  const STYLE_ID = "flowlens-lightbox-icons-unified-style";
  let timer = 0;

  function root() { return document.getElementById("xiv-root"); }
  function box() { return root()?.querySelector("#xiv-lightbox"); }
  function open() { return box()?.dataset.active === "true"; }
  function isPlaying(btn) { return btn?.dataset.active === "true"; }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #xiv-lightbox .xiv-lightbox-slideshow,
      #xiv-lightbox .xiv-lightbox-fav,
      #xiv-lightbox .xiv-lightbox-close {
        position: fixed !important;
        top: max(8px, env(safe-area-inset-top, 0px) + 8px) !important;
        width: 38px !important;
        height: 38px !important;
        min-width: 38px !important;
        min-height: 38px !important;
        border-radius: 999px !important;
        border: 1px solid rgba(0,0,0,.12) !important;
        background: rgba(255,255,255,.78) !important;
        color: #151515 !important;
        box-shadow: none !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 !important;
        margin: 0 !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
        cursor: pointer !important;
        z-index: 2147483647 !important;
        transform: none !important;
        overflow: hidden !important;
      }
      #xiv-lightbox .xiv-lightbox-close { right: 10px !important; }
      #xiv-lightbox .xiv-lightbox-fav { right: 55px !important; }
      #xiv-lightbox .xiv-lightbox-slideshow { right: 100px !important; }
      #xiv-lightbox .xiv-lightbox-slideshow[data-active="true"],
      #xiv-lightbox .xiv-lightbox-fav[data-favorited="true"] {
        background: rgba(255,255,255,.9) !important;
        color: #151515 !important;
        border-color: rgba(0,0,0,.16) !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow::before,
      #xiv-lightbox .xiv-lightbox-slideshow::after {
        content: none !important;
        display: none !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow svg,
      #xiv-lightbox .xiv-lightbox-fav svg,
      #xiv-lightbox .xiv-lightbox-close svg {
        display: block !important;
        width: 18px !important;
        height: 18px !important;
        min-width: 18px !important;
        min-height: 18px !important;
        opacity: 1 !important;
        visibility: visible !important;
        color: currentColor !important;
        stroke: currentColor !important;
        fill: none !important;
        filter: none !important;
        flex: 0 0 auto !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow svg [fill],
      #xiv-lightbox .xiv-lightbox-slideshow svg path,
      #xiv-lightbox .xiv-lightbox-slideshow svg rect { fill: currentColor !important; stroke: none !important; }
    `;
    document.documentElement.appendChild(style);
  }

  function svgEl(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "display:block!important;width:18px!important;height:18px!important;color:currentColor!important;opacity:1!important;visibility:visible!important;";
    if (name === "pause") {
      [[7, 5], [13.2, 5]].forEach(([x, y]) => {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", "3.8");
        rect.setAttribute("height", "14");
        rect.setAttribute("rx", "1.2");
        rect.setAttribute("fill", "currentColor");
        svg.appendChild(rect);
      });
    } else {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.4 0-1.8L9.6 4.9C8.9 4.5 8 5 8 5.8Z");
      path.setAttribute("fill", "currentColor");
      svg.appendChild(path);
    }
    return svg;
  }

  function ensureSlideshowButton(lb) {
    let btn = lb.querySelector(".xiv-lightbox-slideshow");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "xiv-lightbox-slideshow";
      btn.dataset.active = "false";
      const fav = lb.querySelector(".xiv-lightbox-fav");
      if (fav?.parentNode === lb) lb.insertBefore(btn, fav);
      else lb.appendChild(btn);
    }
    return btn;
  }

  function drawButton(btn) {
    if (!btn) return;
    const active = isPlaying(btn);
    const wanted = active ? "pause" : "play";
    if (btn.dataset.flUnifiedIcon === wanted && btn.querySelector("svg")) return;
    btn.dataset.flUnifiedIcon = wanted;
    btn.textContent = "";
    btn.appendChild(svgEl(wanted));
  }

  function scan() {
    installStyle();
    const lb = box();
    if (!lb || lb.dataset.active !== "true") return;
    drawButton(ensureSlideshowButton(lb));
  }

  function schedule(delay = 30) {
    clearTimeout(timer);
    timer = window.setTimeout(scan, delay);
  }

  document.addEventListener("click", () => schedule(20), true);
  document.addEventListener("keydown", () => schedule(20), true);
  const observer = new MutationObserver(() => schedule(20));
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "data-favorited", "class", "style"] });
  schedule(0);
})();