(() => {
  if (window.__flowLensVisibleSequenceSafe) return;
  window.__flowLensVisibleSequenceSafe = true;

  function box() {
    const node = document.getElementById("xiv-lightbox");
    return node?.dataset.active === "true" ? node : null;
  }

  function filter() {
    return window.__flowLensMediaFilter || null;
  }

  function reason(url, node = null) {
    try { return filter()?.reasonFor?.(url, node) || ""; } catch { return ""; }
  }

  function tiles() {
    return [...document.querySelectorAll("#xiv-grid .xiv-tile")]
      .filter((tile) => tile.isConnected)
      .sort((a, b) => Number(a.dataset.index || 0) - Number(b.dataset.index || 0));
  }

  function isVisibleTile(tile) {
    if (!tile || tile.hidden || tile.style.display === "none") return false;
    return !reason(tile.dataset.url || "", tile);
  }

  function visibleTiles() {
    return tiles().filter(isVisibleTile);
  }

  function currentIndex() {
    return Number(window.__flowLensControl?.getLightboxIndex?.());
  }

  function relTile(delta) {
    const list = visibleTiles();
    if (!list.length) return null;
    const current = currentIndex();
    let pos = list.findIndex((tile) => Number(tile.dataset.index || -1) === current);
    if (pos < 0) pos = delta >= 0 ? 0 : list.length - 1;
    return list[(pos + (delta >= 0 ? 1 : -1) + list.length) % list.length] || null;
  }

  function openTile(tile) {
    if (!tile) return false;
    return window.__flowLensControl?.openLightboxIndex?.(Number(tile.dataset.index)) === true;
  }

  function jump(delta) {
    return openTile(relTile(delta));
  }

  window.__flowLensVisibleSequenceJump = jump;

  function currentUrl() {
    const lb = box();
    if (!lb) return "";
    const media = lb.querySelector(":scope > img, :scope > video, :scope > iframe, :scope > .xiv-video-frame");
    return media?.currentSrc || media?.src || media?.dataset?.mediaUrl || media?.dataset?.sourceUrl || "";
  }

  function compactLabels() {
    const list = visibleTiles();
    list.forEach((tile, i) => {
      const nextIndex = String(i);
      if (tile.dataset.flVisibleIndex !== nextIndex) tile.dataset.flVisibleIndex = nextIndex;
      const label = [...tile.children].find((node) => node.tagName === "SPAN") || tile.querySelector("span");
      const nextText = String(i + 1).padStart(2, "0");
      if (label && label.textContent !== nextText) label.textContent = nextText;
    });
  }

  function patchControl() {
    const control = window.__flowLensControl;
    if (!control || control.__flVisibleSequenceSafe) return;
    control.compactVisibleLabels = compactLabels;
    control.__flVisibleSequenceSafe = true;
  }

  window.addEventListener("flowlens:media-filter-applied", compactLabels);
  window.addEventListener("flowlens:gallery-items-rendered", compactLabels);
  document.addEventListener("click", (event) => {
    if (event.target?.closest?.("#xiv-root [data-xiv='filter'], #xiv-root .fl-mf-section")) setTimeout(compactLabels, 80);
  }, true);
  const boot = new MutationObserver(() => patchControl());
  if (document.documentElement) boot.observe(document.documentElement, { childList: true, subtree: true });
  patchControl();
})();
