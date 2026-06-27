(() => {
  if (window.__flowLensLightboxGallerySwipe) return;
  window.__flowLensLightboxGallerySwipe = true;

  const STYLE_ID = "flowlens-lightbox-gallery-swipe-style";
  let gesture = null;
  let track = null;
  let timer = 0;

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #xiv-lightbox[data-fl-gallery-swiping="true"] { overflow: hidden !important; touch-action: none !important; }
      #xiv-lightbox[data-fl-gallery-swiping="true"] > img { opacity: 0 !important; visibility: hidden !important; }
      #xiv-lightbox .fl-gallery-track { position: fixed; inset: 0; z-index: 4; pointer-events: none; overflow: hidden; --dx: 0px; }
      #xiv-lightbox .fl-gallery-slot { position: fixed; inset: 0; display: grid; place-items: center; transform: translate3d(calc(var(--dx) + var(--offset)),0,0); transition: none; will-change: transform; }
      #xiv-lightbox .fl-gallery-track[data-animating="true"] .fl-gallery-slot { transition: transform 220ms cubic-bezier(.22,1,.36,1); }
      #xiv-lightbox .fl-gallery-slot img { display: block; max-width: 100vw !important; max-height: 100dvh !important; width: auto !important; height: auto !important; object-fit: contain !important; user-select: none; -webkit-user-drag: none; }
    `;
    document.documentElement.appendChild(style);
  }

  function lb() { const node = document.getElementById("xiv-lightbox"); return node?.dataset.active === "true" ? node : null; }
  function api() { return window.__flowLensControl || null; }
  function img() { return lb()?.querySelector?.(":scope > img") || null; }
  function control(t) { return !!t?.closest?.(".xiv-lightbox-slideshow,.xiv-lightbox-fav,.xiv-lightbox-close,.xiv-lightbox-arrow"); }
  function claim(e) { e?.preventDefault?.(); e?.stopPropagation?.(); e?.stopImmediatePropagation?.(); }
  function blocked(tile) { try { return !!window.__flowLensMediaFilter?.reasonFor?.(tile?.dataset?.url || "", tile); } catch { return false; } }

  function tiles() {
    return [...document.querySelectorAll("#xiv-grid .xiv-tile")]
      .filter((t) => !t.hidden && t.style.display !== "none" && !blocked(t))
      .sort((a, b) => Number(a.dataset.index || 0) - Number(b.dataset.index || 0));
  }

  function sideUrl(dir) {
    const list = tiles();
    const current = Number(api()?.getLightboxIndex?.());
    if (!list.length || !Number.isFinite(current)) return "";
    let pos = list.findIndex((t) => Number(t.dataset.index || -1) === current);
    if (pos < 0) pos = dir >= 0 ? -1 : 0;
    return list[(pos + dir + list.length) % list.length]?.dataset.url || "";
  }

  function slot(url, offset) {
    const s = document.createElement("div");
    s.className = "fl-gallery-slot";
    s.style.setProperty("--offset", offset);
    if (url) {
      const image = document.createElement("img");
      image.decoding = "async";
      image.src = url;
      s.appendChild(image);
    }
    return s;
  }

  function cleanup() {
    clearTimeout(timer);
    const box = lb() || document.getElementById("xiv-lightbox");
    if (box) delete box.dataset.flGallerySwiping;
    track?.remove();
    track = null;
  }

  function build(dx) {
    const box = lb();
    const current = img();
    if (!box || !current) return null;
    cleanup();
    const w = Math.max(1, box.clientWidth || window.innerWidth || 1);
    track = document.createElement("div");
    track.className = "fl-gallery-track";
    track.style.setProperty("--dx", `${Math.round(dx)}px`);
    track.append(slot(sideUrl(-1), `-${w}px`), slot(current.currentSrc || current.src || "", "0px"), slot(sideUrl(1), `${w}px`));
    box.appendChild(track);
    box.dataset.flGallerySwiping = "true";
    return track;
  }

  function setDx(dx) { if (track) track.style.setProperty("--dx", `${Math.round(dx)}px`); }

  function down(e) {
    const box = lb();
    if (!box || e.button !== 0 || control(e.target) || box.dataset.zoom === "actual" || box.dataset.flShortcutZoom === "true" || !img()) return;
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastAt: performance.now(), dragging: false };
  }

  function move(e) {
    if (!gesture || gesture.id !== e.pointerId) return;
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;
    if (!gesture.dragging) {
      if (Math.abs(dy) > 18 && Math.abs(dy) > Math.abs(dx) * 1.15) { gesture = null; return; }
      if (Math.abs(dx) < 9 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      gesture.dragging = true;
      build(dx);
    }
    const now = performance.now();
    gesture.v = (e.clientX - gesture.lastX) / Math.max(1, now - gesture.lastAt);
    gesture.lastX = e.clientX;
    gesture.lastAt = now;
    window.__flowLensBlockNextLightboxClickUntil = Date.now() + 700;
    setDx(dx);
    claim(e);
  }

  function up(e) {
    if (!gesture || (e && gesture.id !== e.pointerId)) return;
    const box = lb();
    const dx = e ? e.clientX - gesture.x : 0;
    const dragging = gesture.dragging;
    const velocity = Number(gesture.v || 0);
    gesture = null;
    if (!dragging || !box || !track) return;
    claim(e);
    window.__flowLensBlockNextLightboxClickUntil = Date.now() + 800;
    const w = Math.max(1, box.clientWidth || window.innerWidth || 1);
    const commit = Math.abs(dx) > Math.max(58, Math.min(128, w * .18)) || Math.abs(velocity) > .55;
    track.dataset.animating = "true";
    if (!commit) {
      setDx(0);
      timer = setTimeout(cleanup, 250);
      return;
    }
    const dir = dx < 0 ? 1 : -1;
    setDx(dir > 0 ? -w : w);
    timer = setTimeout(() => { api()?.showAdjacent?.(dir); setTimeout(cleanup, 80); }, 205);
  }

  function controlEvent(e) { if (lb() && control(e.target)) claim(e); }

  installStyle();
  document.addEventListener("pointerdown", down, true);
  document.addEventListener("pointermove", move, true);
  document.addEventListener("pointerup", up, true);
  document.addEventListener("pointercancel", up, true);
  document.addEventListener("click", controlEvent, true);
})();
