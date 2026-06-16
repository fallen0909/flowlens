(() => {
  if (window.__flowLensUxPatch) return;
  window.__flowLensUxPatch = true;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const FILTER_KEY = "flowlens-media-filter-v1";
  const KEEP_ACTIONS = new Set(["download", "auto", "top", "settings", "close"]);
  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
  let mutationTimer = 0;
  let reflowing = false;
  let lightboxObserver = null;
  let lastSwitchDirection = "fade";
  let swipeStart = null;

  const css = `
    html.xiv-active,
    html.xiv-active body {
      margin: 0 !important;
      padding: 0 !important;
      background: #000 !important;
      overscroll-behavior: none !important;
    }

    #xiv-root {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100dvh !important;
      max-height: 100dvh !important;
      overflow: hidden !important;
      background: #050505 !important;
      transform: translateZ(0);
    }

    @supports not (height: 100dvh) {
      #xiv-root { height: 100vh !important; max-height: 100vh !important; }
    }

    #xiv-root::before {
      content: "";
      position: fixed;
      left: 0;
      right: 0;
      top: 0;
      height: max(env(safe-area-inset-top, 0px), 1px);
      background: #050505;
      z-index: 2;
      pointer-events: none;
    }

    #xiv-stage {
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      box-sizing: border-box !important;
      padding-top: calc(54px + env(safe-area-inset-top, 0px)) !important;
      padding-right: max(6px, env(safe-area-inset-right, 0px)) !important;
      padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;
      padding-left: max(6px, env(safe-area-inset-left, 0px)) !important;
      background: transparent !important;
    }

    #xiv-topbar {
      top: 0 !important;
      padding-top: calc(8px + env(safe-area-inset-top, 0px)) !important;
      background: linear-gradient(to bottom, rgba(0,0,0,.9), rgba(0,0,0,.36), rgba(0,0,0,0)) !important;
    }

    #xiv-topbar [data-xiv]:not([data-xiv="download"]):not([data-xiv="auto"]):not([data-xiv="top"]):not([data-xiv="settings"]):not([data-xiv="close"]),
    #xiv-topbar .xiv-select[data-xiv="filter"] {
      display: none !important;
    }

    #xiv-topbar .xiv-actions {
      gap: 8px !important;
      flex-wrap: nowrap !important;
    }

    html.xiv-fl-launch-hidden #xiv-launch {
      display: none !important;
    }

    .xiv-fl-filter-select {
      height: 34px;
      min-width: 108px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(18,18,20,.72);
      color: #fff;
      padding: 0 28px 0 12px;
      font: 800 13px/1 system-ui, sans-serif;
    }

    #xiv-root[data-theme="light"] .xiv-fl-filter-select {
      background: rgba(255,255,255,.86);
      color: #151515;
      border-color: rgba(0,0,0,.12);
    }

    #xiv-lightbox img,
    #xiv-lightbox video,
    #xiv-lightbox iframe,
    #xiv-lightbox .xiv-video-frame {
      will-change: transform, opacity;
      backface-visibility: hidden;
    }

    #xiv-lightbox .xiv-fl-media-anim {
      animation-duration: 280ms;
      animation-timing-function: cubic-bezier(.22, .61, .36, 1);
      animation-fill-mode: both;
    }

    #xiv-lightbox[data-fl-dir="next-y"] .xiv-fl-media-anim { animation-name: xivFlNextY; }
    #xiv-lightbox[data-fl-dir="prev-y"] .xiv-fl-media-anim { animation-name: xivFlPrevY; }
    #xiv-lightbox[data-fl-dir="next-x"] .xiv-fl-media-anim { animation-name: xivFlNextX; }
    #xiv-lightbox[data-fl-dir="prev-x"] .xiv-fl-media-anim { animation-name: xivFlPrevX; }
    #xiv-lightbox[data-fl-dir="fade"] .xiv-fl-media-anim { animation-name: xivFlFade; }

    @keyframes xivFlNextY {
      from { opacity: .18; transform: translate3d(0, 8vh, 0) scale(.985); }
      to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
    }
    @keyframes xivFlPrevY {
      from { opacity: .18; transform: translate3d(0, -8vh, 0) scale(.985); }
      to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
    }
    @keyframes xivFlNextX {
      from { opacity: .18; transform: translate3d(8vw, 0, 0) scale(.985); }
      to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
    }
    @keyframes xivFlPrevX {
      from { opacity: .18; transform: translate3d(-8vw, 0, 0) scale(.985); }
      to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
    }
    @keyframes xivFlFade {
      from { opacity: .25; transform: scale(.985); }
      to { opacity: 1; transform: scale(1); }
    }

    @media (max-width: 820px) {
      #xiv-topbar {
        justify-content: flex-end !important;
        gap: 6px !important;
        padding-right: max(8px, env(safe-area-inset-right, 0px)) !important;
        padding-left: max(8px, env(safe-area-inset-left, 0px)) !important;
      }
      #xiv-topbar .xiv-pill {
        display: none !important;
      }
      #xiv-topbar .xiv-btn {
        min-width: 42px !important;
        width: 42px !important;
        height: 42px !important;
      }
      #xiv-stage {
        padding-top: calc(58px + env(safe-area-inset-top, 0px)) !important;
      }
      #xiv-lightbox img,
      #xiv-lightbox video {
        max-width: 100vw !important;
        max-height: 100dvh !important;
      }
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-fl-ux-patch-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-fl-ux-patch-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function readSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  function saveSettings(patch) {
    const settings = { ...readSettings(), ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage restrictions
    }
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local?.set) {
        chrome.storage.local.set({ [SETTINGS_KEY]: settings });
      }
    } catch {
      // extension storage is best-effort
    }
  }

  function launchHidden() {
    return readSettings().launchHidden === true;
  }

  function applyLaunchVisibility() {
    document.documentElement.classList.toggle("xiv-fl-launch-hidden", launchHidden());
  }

  function getStoredFilter() {
    const value = localStorage.getItem(FILTER_KEY) || document.querySelector('#xiv-root [data-xiv="filter"]')?.value || "all";
    return ["all", "image", "video"].includes(value) ? value : "all";
  }

  function setStoredFilter(value) {
    const next = ["all", "image", "video"].includes(value) ? value : "all";
    try { localStorage.setItem(FILTER_KEY, next); } catch { /* ignore */ }
    const nativeSelect = document.querySelector('#xiv-root [data-xiv="filter"]');
    if (nativeSelect && nativeSelect.value !== next) {
      nativeSelect.value = next;
      nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    scheduleFilterApply(next);
    syncAddonControls();
  }

  function mediaTypeOfTile(tile) {
    const url = tile?.dataset?.url || "";
    if (VIDEO_RE.test(url)) return "video";
    if (tile?.querySelector?.("video, .xiv-video-mark")) return "video";
    return "image";
  }

  function sortedTiles() {
    return [...document.querySelectorAll("#xiv-grid .xiv-tile")]
      .sort((a, b) => Number(a.dataset.index || 0) - Number(b.dataset.index || 0));
  }

  function estimateTileHeight(tile, column) {
    const rect = tile.getBoundingClientRect?.();
    if (rect && rect.height > 20) return rect.height + 8;
    const media = tile.querySelector?.("img, video");
    const w = media?.naturalWidth || media?.videoWidth || media?.clientWidth || column?.clientWidth || 160;
    const h = media?.naturalHeight || media?.videoHeight || media?.clientHeight || 120;
    const columnWidth = column?.clientWidth || tile.clientWidth || 160;
    return Math.max(88, columnWidth * (h / Math.max(1, w))) + 8;
  }

  function reflowMasonry(tiles) {
    const grid = document.getElementById("xiv-grid");
    if (!grid || !tiles.length) return;
    const existingColumns = [...grid.querySelectorAll(".xiv-masonry-column")];
    const count = Math.max(1, existingColumns.length || Number(getComputedStyle(grid).getPropertyValue("--xiv-columns")) || 3);
    const columns = Array.from({ length: count }, () => {
      const column = document.createElement("div");
      column.className = "xiv-masonry-column";
      return column;
    });
    const heights = Array.from({ length: count }, () => 0);
    reflowing = true;
    grid.replaceChildren(...columns);
    for (const tile of tiles) {
      if (tile.hidden || tile.style.display === "none") {
        columns[0].appendChild(tile);
        continue;
      }
      let target = 0;
      for (let i = 1; i < heights.length; i += 1) {
        if (heights[i] < heights[target]) target = i;
      }
      columns[target].appendChild(tile);
      heights[target] += estimateTileHeight(tile, columns[target]);
    }
    reflowing = false;
  }

  function updateCounter(filter, total, visible, imageCount, videoCount) {
    const counter = document.getElementById("xiv-counter");
    if (!counter) return;
    if (filter === "image") {
      counter.textContent = `图片 ${visible}/${imageCount}`;
    } else if (filter === "video") {
      counter.textContent = `视频 ${visible}/${videoCount}`;
    } else {
      counter.textContent = `${total} 个`;
    }
  }

  function applyFilterDom(value = getStoredFilter()) {
    const tiles = sortedTiles();
    if (!tiles.length) return;
    let imageCount = 0;
    let videoCount = 0;
    let visible = 0;
    for (const tile of tiles) {
      const type = mediaTypeOfTile(tile);
      if (type === "video") videoCount += 1;
      else imageCount += 1;
      tile.dataset.flMediaType = type;
      const show = value === "all" || value === type;
      tile.hidden = !show;
      tile.style.display = show ? "" : "none";
      if (show) visible += 1;
    }
    reflowMasonry(tiles);
    updateCounter(value, tiles.length, visible, imageCount, videoCount);
  }

  function scheduleFilterApply(value = getStoredFilter()) {
    [0, 60, 180].forEach((delay) => {
      window.setTimeout(() => applyFilterDom(value), delay);
    });
  }

  function ensureToolbarCompact() {
    document.querySelectorAll("#xiv-topbar [data-xiv]").forEach((el) => {
      const key = el.dataset.xiv;
      const show = KEEP_ACTIONS.has(key);
      el.hidden = !show;
      if (!show) el.style.display = "none";
    });
    const filter = document.querySelector('#xiv-topbar .xiv-select[data-xiv="filter"]');
    if (filter) {
      filter.hidden = true;
      filter.style.display = "none";
    }
  }

  function createSettingRow(labelText, control) {
    const label = document.createElement("label");
    label.className = "xiv-setting-row";
    label.dataset.flAddon = "true";
    const span = document.createElement("span");
    span.textContent = labelText;
    label.append(span, control);
    return label;
  }

  function ensureSettingsAddons() {
    const panel = document.querySelector('#xiv-root [data-panel="settings"]');
    if (!panel || panel.querySelector('[data-fl-addon="launch-hidden"]')) return;
    const before = panel.querySelector("small");

    const hideInput = document.createElement("input");
    hideInput.type = "checkbox";
    hideInput.dataset.flSetting = "launchHidden";
    hideInput.checked = launchHidden();
    hideInput.addEventListener("change", () => {
      saveSettings({ launchHidden: hideInput.checked });
      applyLaunchVisibility();
      syncAddonControls();
    });
    const hideRow = createSettingRow("隐藏入口图标（用 G 或 Alt+F 打开）", hideInput);
    hideRow.dataset.flAddon = "launch-hidden";

    const filterSelect = document.createElement("select");
    filterSelect.className = "xiv-fl-filter-select";
    filterSelect.dataset.flSetting = "mediaFilter";
    filterSelect.innerHTML = '<option value="all">全部</option><option value="image">只看图片</option><option value="video">只看视频</option>';
    filterSelect.value = getStoredFilter();
    filterSelect.addEventListener("change", () => setStoredFilter(filterSelect.value));
    const filterRow = createSettingRow("图片流筛选", filterSelect);
    filterRow.dataset.flAddon = "media-filter";

    const tip = document.createElement("small");
    tip.dataset.flAddon = "true";
    tip.textContent = "顶部工具栏已精简为下载、自动滚动、回到顶部、设置、关闭。筛选入口移到这里，快捷键 G 或 Alt+F 可打开/关闭瀑光。";

    panel.insertBefore(hideRow, before || null);
    panel.insertBefore(filterRow, before || null);
    panel.insertBefore(tip, before || null);
  }

  function syncAddonControls() {
    const hideInput = document.querySelector('[data-fl-setting="launchHidden"]');
    if (hideInput) hideInput.checked = launchHidden();
    const filterSelect = document.querySelector('[data-fl-setting="mediaFilter"]');
    if (filterSelect) filterSelect.value = getStoredFilter();
  }

  function isTypingTarget(target) {
    return target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  }

  function toggleViewerByPatch() {
    const root = document.getElementById("xiv-root");
    if (root?.dataset.active === "true") {
      document.querySelector('#xiv-root [data-xiv="close"]')?.click();
      return;
    }
    document.getElementById("xiv-launch")?.click();
  }

  function bindShortcuts() {
    document.addEventListener("keydown", (event) => {
      if (isTypingTarget(event.target)) return;
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        event.stopPropagation();
        toggleViewerByPatch();
      }
      if (document.getElementById("xiv-lightbox")?.dataset.active === "true") {
        if (event.key === "ArrowRight") lastSwitchDirection = "next-x";
        else if (event.key === "ArrowLeft") lastSwitchDirection = "prev-x";
      }
    }, true);

    document.addEventListener("wheel", (event) => {
      const lightbox = document.getElementById("xiv-lightbox");
      if (lightbox?.dataset.active !== "true" || !lightbox.contains(event.target)) return;
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (Math.abs(delta) > 4) lastSwitchDirection = delta > 0 ? "next-y" : "prev-y";
    }, true);

    document.addEventListener("pointerdown", (event) => {
      const lightbox = document.getElementById("xiv-lightbox");
      if (lightbox?.dataset.active !== "true" || !lightbox.contains(event.target)) return;
      if (event.target?.closest?.(".xiv-lightbox-fav, .xiv-lightbox-close, .xiv-lightbox-arrow")) return;
      swipeStart = { x: event.clientX, y: event.clientY };
    }, true);

    document.addEventListener("pointerup", (event) => {
      if (!swipeStart) return;
      const dx = event.clientX - swipeStart.x;
      const dy = event.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
      if (Math.abs(dx) >= Math.abs(dy)) lastSwitchDirection = dx < 0 ? "next-x" : "prev-x";
      else lastSwitchDirection = dy < 0 ? "next-y" : "prev-y";
    }, true);
  }

  function animateLightboxMedia() {
    const lightbox = document.getElementById("xiv-lightbox");
    if (!lightbox || lightbox.dataset.active !== "true") return;
    const media = lightbox.querySelector(".xiv-video-frame, img, video, iframe");
    if (!media) return;
    lightbox.dataset.flDir = lastSwitchDirection || "fade";
    media.classList.remove("xiv-fl-media-anim");
    void media.offsetWidth;
    media.classList.add("xiv-fl-media-anim");
    window.setTimeout(() => media.classList.remove("xiv-fl-media-anim"), 340);
    lastSwitchDirection = "fade";
  }

  function observeLightbox() {
    const lightbox = document.getElementById("xiv-lightbox");
    if (!lightbox || lightbox.dataset.flObserved === "true") return;
    lightbox.dataset.flObserved = "true";
    lightboxObserver?.disconnect?.();
    lightboxObserver = new MutationObserver(() => {
      window.requestAnimationFrame(animateLightboxMedia);
    });
    lightboxObserver.observe(lightbox, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "data-active"] });
  }

  function applyAll() {
    injectStyle();
    applyLaunchVisibility();
    ensureToolbarCompact();
    ensureSettingsAddons();
    syncAddonControls();
    observeLightbox();
    scheduleFilterApply(getStoredFilter());
  }

  function scheduleApplyAll() {
    if (reflowing) return;
    clearTimeout(mutationTimer);
    mutationTimer = window.setTimeout(applyAll, 80);
  }

  injectStyle();
  bindShortcuts();
  applyAll();

  const observer = new MutationObserver(scheduleApplyAll);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("resize", () => scheduleFilterApply(getStoredFilter()), { passive: true });
})();
