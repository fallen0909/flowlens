(() => {
  if (window.__flowLensLightboxDomIconFix) return;
  window.__flowLensLightboxDomIconFix = true;

  const STYLE_ID = "flowlens-lightbox-dom-icon-fix-style";
  let timer = 0;

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #xiv-lightbox .xiv-lightbox-slideshow::before,
      #xiv-lightbox .xiv-lightbox-slideshow::after { display: none !important; content: none !important; }
      #xiv-lightbox .xiv-lightbox-slideshow .fl-play-dom-icon,
      #xiv-lightbox .xiv-lightbox-slideshow .fl-pause-dom-icon { display: block !important; opacity: 1 !important; visibility: visible !important; }
    `;
    document.documentElement.appendChild(style);
  }

  function draw(btn) {
    if (!btn) return;
    const active = btn.dataset.active === "true";
    const color = active ? "#111" : "#fff";
    btn.textContent = "";
    btn.style.setProperty("font-size", "0", "important");
    btn.style.setProperty("line-height", "0", "important");
    btn.style.setProperty("text-indent", "0", "important");
    btn.style.setProperty("color", color, "important");
    btn.style.setProperty("display", "grid", "important");
    btn.style.setProperty("place-items", "center", "important");

    if (active) {
      const wrap = document.createElement("span");
      wrap.className = "fl-pause-dom-icon";
      wrap.setAttribute("aria-hidden", "true");
      wrap.style.cssText = "display:flex!important;align-items:center!important;justify-content:center!important;gap:4px!important;width:18px!important;height:18px!important;opacity:1!important;visibility:visible!important;";
      for (let i = 0; i < 2; i += 1) {
        const bar = document.createElement("span");
        bar.style.cssText = `display:block!important;width:4px!important;height:16px!important;border-radius:2px!important;background:${color}!important;opacity:1!important;visibility:visible!important;`;
        wrap.appendChild(bar);
      }
      btn.appendChild(wrap);
      return;
    }

    const tri = document.createElement("span");
    tri.className = "fl-play-dom-icon";
    tri.setAttribute("aria-hidden", "true");
    tri.style.cssText = `display:block!important;width:0!important;height:0!important;border-top:8px solid transparent!important;border-bottom:8px solid transparent!important;border-left:13px solid ${color}!important;margin-left:4px!important;opacity:1!important;visibility:visible!important;`;
    btn.appendChild(tri);
  }

  function scan() {
    installStyle();
    document.querySelectorAll("#xiv-lightbox .xiv-lightbox-slideshow").forEach(draw);
  }

  function schedule() {
    clearTimeout(timer);
    timer = window.setTimeout(scan, 20);
  }

  document.addEventListener("click", () => window.setTimeout(scan, 30), true);
  document.addEventListener("keydown", () => window.setTimeout(scan, 30), true);
  const observer = new MutationObserver(schedule);
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "class", "style"] });
  schedule();
})();