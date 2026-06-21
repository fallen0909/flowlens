(() => {
  if (window.__flowLensStabilityFixes) return;
  window.__flowLensStabilityFixes = true;

  const FILTER_KEY = "flowlens-media-filter-v1";
  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
  const FILTER_SHORTCUTS = { "1": "all", "2": "image", "3": "video" };
  const FILTER_LABELS = { all: "全部", image: "图片", video: "视频" };
  let applyTimer = 0;
  let recoveryTimer = 0;

  const css = `
    #xiv-root, #xiv-stage, #xiv-grid, .xiv-masonry-column {
      contain: layout style paint;
    }
    #xiv-grid .xiv-tile {
      contain: layout paint style;
      content-visibility: auto;
      contain-intrinsic-size: 260px 340px;
    }
    #xiv-grid .xiv-tile[data-fl-duplicate="true"] {
      display: none !important;
    }
    #xiv-grid .xiv-tile img,
    #xiv-grid .xiv-tile video {
      backface-visibility: hidden;
      transform: translateZ(0);
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-fl-stability-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-fl-stability-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function viewerIsActive() {
    return document.getElementById("xiv-root")?.dataset.active === "true";
  }

  function cleanupPageLockIfClosed() {
    const root = document.getElementById("xiv-root");
    if (root?.dataset.active === "true") return;
    document.documentElement.classList.remove("xiv-active");
    for (const node of [document.documentElement, document.body]) {
      if (!node) continue;
      if (node.style.overflow === "hidden") node.style.overflow = "";
      if (node.style.pointerEvents === "none") node.style.pointerEvents = "";
    }
  }

  function schedulePageLockRecovery() {
    clearTimeout(recoveryTimer);
    recoveryTimer = window.setTimeout(cleanupPageLockIfClosed, 80);
  }

  function getStoredFilter() {
    const value = localStorage.getItem(FILTER_KEY) || document.querySelector('#xiv-root [data-xiv="filter"]')?.value || "all";
    return ["all", "image", "video"].includes(value) ? value : "all";
  }

  function mediaTypeOfTile(tile) {
    const url = tile?.dataset?.url || "";
    if (VIDEO_RE.test(url)) return "video";
    if (tile?.querySelector?.("video, .xiv-video-mark")) return "video";
    return "image";
  }

  function zhimgIdentityKey(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url, location.href);
      if (!/(^|\.)zhimg\.com$/i.test(parsed.hostname)) return "";
      const pathname = decodeURIComponent(parsed.pathname || "");
      const match = pathname.match(/\/(?:\d+\/)?(v2-[A-Za-z0-9]+)(?:[_-][^/.]+)?\.(?:webp|jpe?g|png)$/i);
      if (match) return `zhihu:${match[1].toLowerCase()}`;
      return `zhihu:${pathname.replace(/_(?:\d+w|r|b|hd)(?=\.)/i, "").toLowerCase()}`;
    } catch {
      const match = String(url).match(/\/(?:\d+\/)?(v2-[A-Za-z0-9]+)(?:[_-][^/.]+)?\.(?:webp|jpe?g|png)/i);
      return match ? `zhihu:${match[1].toLowerCase()}` : "";
    }
  }

  function mediaIdentityKey(tile) {
    const url = tile?.dataset?.url || "";
    const zhihu = zhimgIdentityKey(url);
    if (zhihu) return zhihu;
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      return parsed.href;
    } catch {
      return url.replace(/#.*$/, "");
    }
  }

  function tileQualityScore(tile) {
    const url = tile?.dataset?.url || "";
    let score = 0;
    const width = Number(url.match(/_(\d+)w\./i)?.[1] || 0);
    if (width) score += width;
    if (/_r\./i.test(url)) score += 1400;
    if (/_b\./i.test(url)) score += 1200;
    const media = tile?.querySelector?.("img, video");
    const area = (media?.naturalWidth || media?.videoWidth || 0) * (media?.naturalHeight || media?.videoHeight || 0);
    if (area) score += Math.min(area / 1000, 1800);
    score -= Number(tile?.dataset?.index || 0) / 10000;
    return score;
  }

  function dedupeTilesDom(tiles) {
    const bestByKey = new Map();
    for (const tile of tiles) {
      const key = mediaIdentityKey(tile);
      if (!key) continue;
      const current = bestByKey.get(key);
      if (!current || tileQualityScore(tile) > tileQualityScore(current)) bestByKey.set(key, tile);
    }
    let duplicates = 0;
    for (const tile of tiles) {
      const key = mediaIdentityKey(tile);
      const duplicate = !!(key && bestByKey.get(key) && bestByKey.get(key) !== tile);
      tile.dataset.flDuplicate = duplicate ? "true" : "false";
      if (duplicate) duplicates += 1;
    }
    return duplicates;
  }

  function applyFilterDom(value = getStoredFilter()) {
    const root = document.getElementById("xiv-root");
    if (!root || root.dataset.active !== "true") return;
    const tiles = [...document.querySelectorAll("#xiv-grid .xiv-tile")];
    if (!tiles.length) return;
    const duplicateCount = dedupeTilesDom(tiles);
    let imageCount = 0;
    let videoCount = 0;
    let visible = 0;
    for (const tile of tiles) {
      const duplicate = tile.dataset.flDuplicate === "true";
      const type = mediaTypeOfTile(tile);
      if (!duplicate) {
        if (type === "video") videoCount += 1;
        else imageCount += 1;
      }
      tile.dataset.flMediaType = type;
      const show = !duplicate && (value === "all" || value === type);
      tile.hidden = !show;
      tile.style.display = show ? "" : "none";
      if (show) visible += 1;
    }
    const counter = document.getElementById("xiv-counter");
    if (counter) {
      const total = imageCount + videoCount;
      const dedupeText = duplicateCount ? `，去重 ${duplicateCount}` : "";
      if (value === "image") counter.textContent = `图片 ${visible}/${imageCount}${dedupeText}`;
      else if (value === "video") counter.textContent = `视频 ${visible}/${videoCount}${dedupeText}`;
      else counter.textContent = `${total} 个${dedupeText}`;
    }
  }

  function setStoredFilter(value) {
    const next = ["all", "image", "video"].includes(value) ? value : "all";
    try { localStorage.setItem(FILTER_KEY, next); } catch { /* ignore */ }
    const nativeSelect = document.querySelector('#xiv-root [data-xiv="filter"]');
    if (nativeSelect && nativeSelect.value !== next) {
      nativeSelect.value = next;
      nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    [0, 80, 180].forEach((delay) => window.setTimeout(() => applyFilterDom(next), delay));
    const addonSelect = document.querySelector('[data-fl-setting="mediaFilter"]');
    if (addonSelect) addonSelect.value = next;
  }

  function setStatus(text) {
    const status = document.getElementById("xiv-status");
    if (status) status.textContent = text;
  }

  function cycleFilter() {
    const order = ["all", "image", "video"];
    const current = getStoredFilter();
    const next = order[(order.indexOf(current) + 1) % order.length] || "all";
    setStoredFilter(next);
    setStatus(`筛选：${FILTER_LABELS[next]}（1全部 2图片 3视频）`);
  }

  function isTypingTarget(target) {
    return target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  }

  document.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target)) return;
    if (viewerIsActive() && !event.altKey && !event.ctrlKey && !event.metaKey && FILTER_SHORTCUTS[event.key]) {
      event.preventDefault();
      event.stopPropagation();
      const next = FILTER_SHORTCUTS[event.key];
      setStoredFilter(next);
      setStatus(`筛选：${FILTER_LABELS[next]}（1全部 2图片 3视频）`);
    }
    if (viewerIsActive() && !event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "v") {
      event.preventDefault();
      event.stopPropagation();
      cycleFilter();
    }
    if (event.key === "Escape" || event.key.toLowerCase() === "g") schedulePageLockRecovery();
  }, true);

  function applyAll() {
    injectStyle();
    cleanupPageLockIfClosed();
    applyFilterDom(getStoredFilter());
  }

  function scheduleApplyAll() {
    clearTimeout(applyTimer);
    applyTimer = window.setTimeout(applyAll, 160);
  }

  injectStyle();
  applyAll();
  new MutationObserver((mutations) => {
    const important = mutations.some((mutation) => {
      const target = mutation.target;
      if (target?.id === "xiv-root" || target?.id === "xiv-grid") return true;
      return [...mutation.addedNodes].some((node) => node?.nodeType === 1 && (node.id === "xiv-root" || node.id === "xiv-grid" || node.querySelector?.("#xiv-root, #xiv-grid, .xiv-tile")));
    });
    if (important || viewerIsActive()) scheduleApplyAll();
    else schedulePageLockRecovery();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "class", "style"] });
  window.addEventListener("resize", () => applyFilterDom(getStoredFilter()), { passive: true });
  window.setInterval(cleanupPageLockIfClosed, 1500);
})();
