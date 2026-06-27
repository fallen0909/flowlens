(() => {
  if (window.__flowLensFilteredSequence) return;
  window.__flowLensFilteredSequence = true;

  let timer = 0;
  let jumping = false;

  function api() { return window.__flowLensControl || null; }
  function lightbox() { const node = document.getElementById("xiv-lightbox"); return node?.dataset.active === "true" ? node : null; }
  function mediaFilter() { return window.__flowLensMediaFilter || null; }
  function tiles() {
    return [...document.querySelectorAll("#xiv-grid .xiv-tile")]
      .sort((a, b) => Number(a.dataset.index || 0) - Number(b.dataset.index || 0));
  }
  function reasonFor(url, tile = null) {
    try { return mediaFilter()?.reasonFor?.(url, tile) || ""; } catch { return ""; }
  }
  function isBlocked(tile) {
    if (!tile) return true;
    const url = tile.dataset.url || tile.querySelector("img,video,iframe")?.src || "";
    return !!reasonFor(url, tile);
  }
  function visibleTiles() {
    return tiles().filter((tile) => tile.isConnected && !tile.hidden && !isBlocked(tile));
  }
  function currentUrl() {
    const lb = lightbox();
    if (!lb) return "";
    const media = lb.querySelector(":scope > img, :scope > video, :scope > iframe, :scope > .xiv-video-frame");
    return media?.currentSrc || media?.src || media?.dataset?.mediaUrl || media?.dataset?.sourceUrl || "";
  }
  function compactLabels() {
    let count = 0;
    for (const tile of tiles()) {
      const blocked = isBlocked(tile);
      if (blocked) {
        tile.hidden = true;
        tile.dataset.flFilteredOut = "true";
        continue;
      }
      if (tile.dataset.flFilteredOut === "true") tile.hidden = false;
      delete tile.dataset.flFilteredOut;
      count += 1;
      tile.dataset.flVisibleIndex = String(count - 1);
      const label = [...tile.children].find((node) => node.tagName === "SPAN") || tile.querySelector("span");
      if (label) label.textContent = String(count).padStart(2, "0");
    }
  }
  function openTile(tile) {
    if (!tile || jumping) return;
    jumping = true;
    try {
      tile.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX: 1, clientY: 1 }));
      tile.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, clientX: 1, clientY: 1, view: window }));
    } finally {
      setTimeout(() => { jumping = false; compactLabels(); }, 80);
    }
  }
  function nextVisibleTile(delta) {
    const list = visibleTiles();
    if (!list.length) return null;
    const current = Number(api()?.getLightboxIndex?.());
    let pos = list.findIndex((tile) => Number(tile.dataset.index || -1) === current);
    if (pos < 0) {
      const sorted = list.map((tile, order) => ({ tile, order, index: Number(tile.dataset.index || 0) }));
      if (delta >= 0) pos = sorted.find((item) => item.index > current)?.order ?? 0;
      else pos = [...sorted].reverse().find((item) => item.index < current)?.order ?? list.length - 1;
      return list[pos] || null;
    }
    return list[(pos + delta + list.length) % list.length] || null;
  }
  function jump(delta) {
    compactLabels();
    openTile(nextVisibleTile(delta));
  }
  function checkLightbox() {
    compactLabels();
    const lb = lightbox();
    if (!lb || jumping) return;
    const url = currentUrl();
    if (url && reasonFor(url, lb)) jump(1);
  }
  function schedule(delay = 120) {
    clearTimeout(timer);
    timer = setTimeout(checkLightbox, delay);
  }
  function claim(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }
  function onClick(event) {
    const arrow = event.target?.closest?.(".xiv-lightbox-arrow");
    if (!lightbox() || !arrow) return;
    claim(event);
    jump(arrow.dataset.side === "right" ? 1 : -1);
  }
  function onKey(event) {
    if (!lightbox() || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    claim(event);
    if (!event.repeat) jump(event.key === "ArrowRight" ? 1 : -1);
  }

  const install = () => {
    const control = api();
    if (control && !control.__flFilteredSequencePatched) {
      const original = control.showAdjacent?.bind(control);
      control.showAdjacent = (delta = 1) => {
        const tile = nextVisibleTile(delta >= 0 ? 1 : -1);
        if (!tile) return original ? original(delta) : false;
        openTile(tile);
        return true;
      };
      control.__flFilteredSequencePatched = true;
    }
    compactLabels();
  };

  window.addEventListener("click", onClick, true);
  window.addEventListener("keydown", onKey, true);
  const observer = new MutationObserver(() => { install(); schedule(); });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "data-active", "data-url", "src"] });
  setInterval(install, 700);
  install();
  schedule(300);
})();
