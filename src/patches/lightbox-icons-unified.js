(() => {
  if (window.__flowLensLightboxIconsUnified) return;
  window.__flowLensLightboxIconsUnified = true;

  const STYLE_ID = "flowlens-lightbox-icons-unified-style";
  const SIZE = 46;
  const GAP = 8;
  const RIGHT = 14;
  let timer = 0;

  function root() { return document.getElementById("xiv-root"); }
  function box() { return root()?.querySelector("#xiv-lightbox"); }
  function isPlaying(btn) { return btn?.dataset.active === "true"; }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #xiv-root > .xiv-lightbox-slideshow,
      body > .xiv-lightbox-slideshow,
      html > .xiv-lightbox-slideshow,
      .xiv-lightbox-slideshow[data-fl-legacy-hidden="true"] {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow,
      #xiv-lightbox .xiv-lightbox-fav,
      #xiv-lightbox .xiv-lightbox-close {
        position: fixed !important;
        top: max(10px, env(safe-area-inset-top, 0px) + 10px) !important;
        width: ${SIZE}px !important;
        height: ${SIZE}px !important;
        min-width: ${SIZE}px !important;
        min-height: ${SIZE}px !important;
        border-radius: 999px !important;
        border: 1px solid rgba(0,0,0,.14) !important;
        background: rgba(255,255,255,.96) !important;
        background-image: none !important;
        color: #111 !important;
        box-shadow: 0 1px 4px rgba(0,0,0,.10) !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
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
        text-indent: 0 !important;
        filter: none !important;
      }
      #xiv-lightbox .xiv-lightbox-close { right: ${RIGHT}px !important; }
      #xiv-lightbox .xiv-lightbox-fav { right: ${RIGHT + SIZE + GAP}px !important; }
      #xiv-lightbox .xiv-lightbox-slideshow { right: ${RIGHT + (SIZE + GAP) * 2}px !important; }
      #xiv-lightbox .xiv-lightbox-slideshow[data-active="true"],
      #xiv-lightbox .xiv-lightbox-fav[data-favorited="true"] {
        background: rgba(255,255,255,.98) !important;
        background-image: none !important;
        color: #111 !important;
        border-color: rgba(0,0,0,.18) !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow::before,
      #xiv-lightbox .xiv-lightbox-slideshow::after,
      #xiv-lightbox .xiv-lightbox-fav::before,
      #xiv-lightbox .xiv-lightbox-fav::after,
      #xiv-lightbox .xiv-lightbox-close::before,
      #xiv-lightbox .xiv-lightbox-close::after {
        content: none !important;
        display: none !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow svg,
      #xiv-lightbox .xiv-lightbox-fav svg,
      #xiv-lightbox .xiv-lightbox-close svg {
        display: block !important;
        width: 24px !important;
        height: 24px !important;
        min-width: 24px !important;
        min-height: 24px !important;
        opacity: 1 !important;
        visibility: visible !important;
        color: currentColor !important;
        stroke: currentColor !important;
        filter: none !important;
        flex: 0 0 auto !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow svg [fill],
      #xiv-lightbox .xiv-lightbox-slideshow svg path,
      #xiv-lightbox .xiv-lightbox-slideshow svg rect { fill: currentColor !important; stroke: none !important; }
    `;
    document.documentElement.appendChild(style);
  }

  function forceButtonStyle(btn, right) {
    if (!btn) return;
    btn.style.setProperty("position", "fixed", "important");
    btn.style.setProperty("top", "max(10px, calc(env(safe-area-inset-top, 0px) + 10px))", "important");
    btn.style.setProperty("right", `${right}px`, "important");
    btn.style.setProperty("width", `${SIZE}px`, "important");
    btn.style.setProperty("height", `${SIZE}px`, "important");
    btn.style.setProperty("min-width", `${SIZE}px`, "important");
    btn.style.setProperty("min-height", `${SIZE}px`, "important");
    btn.style.setProperty("border-radius", "999px", "important");
    btn.style.setProperty("border", "1px solid rgba(0,0,0,.14)", "important");
    btn.style.setProperty("background", "rgba(255,255,255,.96)", "important");
    btn.style.setProperty("background-image", "none", "important");
    btn.style.setProperty("color", "#111", "important");
    btn.style.setProperty("box-shadow", "0 1px 4px rgba(0,0,0,.10)", "important");
    btn.style.setProperty("backdrop-filter", "none", "important");
    btn.style.setProperty("-webkit-backdrop-filter", "none", "important");
    btn.style.setProperty("display", "inline-flex", "important");
    btn.style.setProperty("align-items", "center", "important");
    btn.style.setProperty("justify-content", "center", "important");
    btn.style.setProperty("padding", "0", "important");
    btn.style.setProperty("margin", "0", "important");
    btn.style.setProperty("opacity", "1", "important");
    btn.style.setProperty("visibility", "visible", "important");
    btn.style.setProperty("transform", "none", "important");
    btn.style.setProperty("filter", "none", "important");
    btn.style.setProperty("overflow", "hidden", "important");
    btn.style.setProperty("z-index", "2147483647", "important");
  }

  function hideLegacyDuplicates(lb) {
    document.querySelectorAll(".xiv-lightbox-slideshow").forEach((btn) => {
      if (lb && lb.contains(btn)) return;
      btn.dataset.flLegacyHidden = "true";
      btn.style.setProperty("display", "none", "important");
      btn.style.setProperty("visibility", "hidden", "important");
      btn.style.setProperty("opacity", "0", "important");
      btn.style.setProperty("pointer-events", "none", "important");
    });
  }

  function svgEl(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "display:block!important;width:24px!important;height:24px!important;color:currentColor!important;opacity:1!important;visibility:visible!important;";
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
    const all = Array.from(lb.querySelectorAll(".xiv-lightbox-slideshow"));
    let btn = all[0];
    all.slice(1).forEach((dup) => dup.remove());
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
    if (btn.dataset.flUnifiedIcon !== wanted || !btn.querySelector("svg")) {
      btn.dataset.flUnifiedIcon = wanted;
      btn.textContent = "";
      btn.appendChild(svgEl(wanted));
    }
  }

  function scan() {
    installStyle();
    const lb = box();
    hideLegacyDuplicates(lb);
    if (!lb || lb.dataset.active !== "true") return;
    const close = lb.querySelector(".xiv-lightbox-close");
    const fav = lb.querySelector(".xiv-lightbox-fav");
    const play = ensureSlideshowButton(lb);
    forceButtonStyle(close, RIGHT);
    forceButtonStyle(fav, RIGHT + SIZE + GAP);
    forceButtonStyle(play, RIGHT + (SIZE + GAP) * 2);
    drawButton(play);
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