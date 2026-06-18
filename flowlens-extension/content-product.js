(() => {
  if (window.__flowLensProductLayer) return;
  window.__flowLensProductLayer = true;

  const HISTORY_KEY = "flowlens-history-v1";
  const SETTINGS_KEY = "flowlens-settings-v2";
  const FILTER_KEY = "flowlens-media-filter-v1";
  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
  const IMAGE_RE = /(?:\.(avif|gif|jpe?g|png|webp)(?:[?#]|$)|[?&]format=(?:avif|gif|jpe?g|png|webp)\b)/i;
  const selectedKeys = new Set();
  let selectionMode = false;
  let toolbarTimer = 0;
  let historyTimer = 0;
  let preloadTimer = 0;
  let mediaObserver = null;

  const css = `
    #xiv-root[data-fl-selecting="true"] .xiv-tile { cursor: copy !important; }
    #xiv-root .xiv-tile[data-fl-selected="true"] {
      outline: 3px solid #4f8cff !important;
      outline-offset: -3px !important;
      box-shadow: 0 0 0 3px rgba(79,140,255,.25), 0 18px 42px rgba(0,0,0,.34) !important;
    }
    #xiv-root .xiv-tile[data-fl-selected="true"]::after {
      content: "✓";
      position: absolute;
      right: 8px;
      top: 8px;
      width: 26px;
      height: 26px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: #1d6fff;
      color: #fff;
      font: 900 17px/1 system-ui, sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,.28);
      z-index: 4;
      pointer-events: none;
    }
    .xiv-fl-product-btn {
      min-width: 38px;
      height: 38px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(18,18,20,.76);
      color: #fff;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 11px;
      font: 850 13px/1 system-ui, sans-serif;
      backdrop-filter: blur(12px);
      white-space: nowrap;
    }
    #xiv-root[data-theme="light"] .xiv-fl-product-btn {
      background: rgba(255,255,255,.78);
      color: #151515;
      border-color: rgba(0,0,0,.12);
    }
    .xiv-fl-product-btn[data-active="true"] {
      background: #1d6fff !important;
      color: #fff !important;
      border-color: rgba(255,255,255,.35) !important;
    }
    #xiv-fl-help {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: none;
      place-items: center;
      background: rgba(0,0,0,.42);
      backdrop-filter: blur(8px);
      color: #fff;
      pointer-events: auto;
    }
    #xiv-fl-help[data-open="true"] { display: grid; }
    #xiv-fl-help-card {
      width: min(680px, calc(100vw - 32px));
      max-height: min(78vh, 680px);
      overflow: auto;
      border-radius: 18px;
      background: rgba(18,18,22,.94);
      border: 1px solid rgba(255,255,255,.16);
      box-shadow: 0 28px 90px rgba(0,0,0,.45);
      padding: 20px;
      box-sizing: border-box;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #xiv-fl-help-card h2 { margin: 0 0 14px; font-size: 20px; }
    #xiv-fl-help-card table { width: 100%; border-collapse: collapse; font-size: 14px; }
    #xiv-fl-help-card td { padding: 9px 6px; border-top: 1px solid rgba(255,255,255,.1); vertical-align: top; }
    #xiv-fl-help-card kbd { display: inline-block; min-width: 28px; padding: 4px 8px; border-radius: 8px; background: rgba(255,255,255,.12); text-align: center; font: 800 13px/1 system-ui, sans-serif; }
    #xiv-fl-help-close { float: right; border: 0; border-radius: 999px; background: rgba(255,255,255,.12); color: #fff; width: 34px; height: 34px; cursor: pointer; font-size: 18px; }
    #xiv-fl-toast {
      position: fixed;
      left: 50%;
      bottom: 28px;
      transform: translateX(-50%);
      z-index: 2147483647;
      max-width: min(720px, calc(100vw - 28px));
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(18,18,22,.88);
      color: #fff;
      border: 1px solid rgba(255,255,255,.16);
      box-shadow: 0 16px 46px rgba(0,0,0,.38);
      font: 760 13px/1.35 system-ui, sans-serif;
      display: none;
      pointer-events: none;
    }
    #xiv-fl-toast[data-open="true"] { display: block; }
    @media (max-width: 820px) {
      .xiv-fl-product-btn { min-width: 36px; width: auto; height: 36px; padding: 0 9px; font-size: 12px; }
      #xiv-fl-help-card { padding: 16px; }
      #xiv-fl-help-card table { font-size: 13px; }
    }
  `;

  function root() { return document.getElementById("xiv-root"); }
  function grid() { return document.getElementById("xiv-grid"); }
  function active() { return root()?.dataset.active === "true"; }
  function lightboxActive() { return document.getElementById("xiv-lightbox")?.dataset.active === "true"; }
  function tiles() { return [...document.querySelectorAll("#xiv-grid .xiv-tile")].sort((a, b) => Number(a.dataset.index || 0) - Number(b.dataset.index || 0)); }
  function visibleTiles() { return tiles().filter((tile) => !tile.hidden && tile.style.display !== "none" && tile.dataset.flDuplicate !== "true"); }
  function selectedTiles() { return tiles().filter((tile) => selectedKeys.has(tileKey(tile))); }

  function injectStyle() {
    if (document.getElementById("xiv-fl-product-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-fl-product-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "") || fallback; } catch { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }

  function settings() { return readJson(SETTINGS_KEY, {}); }

  function safePart(text, fallback = "FlowLens") {
    return String(text || fallback)
      .replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90) || fallback;
  }

  function pageTitle() {
    const title = document.title.replace(/[-_—|]+\s*知乎.*/i, "").trim();
    return safePart(title || location.hostname || "FlowLens");
  }

  function mediaUrl(tile) { return tile?.dataset?.url || tile?.querySelector?.("img, video")?.currentSrc || tile?.querySelector?.("img, video")?.src || ""; }

  function tileKey(tile) {
    const url = mediaUrl(tile);
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      const zhihu = parsed.hostname.includes("zhimg.com") && parsed.pathname.match(/\/(?:\d+\/)?(v2-[A-Za-z0-9]+)(?:[_-][^/.]+)?\./i)?.[1];
      return zhihu ? `zhihu:${zhihu.toLowerCase()}` : parsed.href;
    } catch {
      return url.replace(/#.*$/, "");
    }
  }

  function isVideo(url) { return VIDEO_RE.test(String(url || "")); }
  function isImage(url) { return IMAGE_RE.test(String(url || "")) && !isVideo(url); }

  function extFromUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const format = parsed.searchParams.get("format")?.toLowerCase();
      if (format && ["jpg", "jpeg", "png", "webp", "avif", "gif"].includes(format)) return format === "jpeg" ? "jpg" : format;
      const ext = parsed.pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
      if (ext) return ext === "jpeg" ? "jpg" : ext;
    } catch { /* ignore */ }
    return isVideo(url) ? "mp4" : "jpg";
  }

  function filenameFor(url, index, scope = "selected") {
    const folder = safePart(settings().downloadFolder || pageTitle());
    const mediaFolder = isVideo(url) ? "视频" : "图片";
    const ext = extFromUrl(url);
    return `${folder}/${mediaFolder}/${String(index + 1).padStart(4, "0")}.${ext}`;
  }

  function toast(text, ms = 1800) {
    let node = document.getElementById("xiv-fl-toast");
    if (!node) {
      node = document.createElement("div");
      node.id = "xiv-fl-toast";
      document.documentElement.appendChild(node);
    }
    node.textContent = text;
    node.dataset.open = "true";
    clearTimeout(Number(node.dataset.timer || 0));
    node.dataset.timer = String(window.setTimeout(() => { node.dataset.open = "false"; }, ms));
  }

  function setStatus(text) {
    const status = document.getElementById("xiv-status");
    if (status) status.textContent = text;
    toast(text, 1400);
  }

  function ensureHelp() {
    let help = document.getElementById("xiv-fl-help");
    if (help) return help;
    help = document.createElement("div");
    help.id = "xiv-fl-help";
    help.innerHTML = `
      <div id="xiv-fl-help-card">
        <button id="xiv-fl-help-close" type="button">×</button>
        <h2>瀑光 FlowLens 快捷键</h2>
        <table>
          <tr><td><kbd>G</kbd></td><td>打开 / 关闭图片流</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>关闭大图；再次按关闭图片流</td></tr>
          <tr><td><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></td><td>筛选：全部 / 图片 / 视频</td></tr>
          <tr><td><kbd>V</kbd></td><td>循环切换全部、图片、视频</td></tr>
          <tr><td><kbd>S</kbd></td><td>开启 / 关闭选择模式</td></tr>
          <tr><td><kbd>Shift</kbd> + <kbd>D</kbd></td><td>下载已选；没有选择时下载当前筛选可见内容</td></tr>
          <tr><td><kbd>E</kbd></td><td>复制已选或可见链接</td></tr>
          <tr><td><kbd>X</kbd></td><td>清空选择</td></tr>
          <tr><td><kbd>A</kbd></td><td>自动滚动</td></tr>
          <tr><td><kbd>+</kbd> <kbd>-</kbd></td><td>调整列数</td></tr>
          <tr><td><kbd>F</kbd></td><td>全屏</td></tr>
          <tr><td><kbd>T</kbd></td><td>切换主题</td></tr>
          <tr><td><kbd>?</kbd></td><td>打开 / 关闭本说明</td></tr>
        </table>
      </div>`;
    help.addEventListener("click", (event) => {
      if (event.target === help || event.target?.id === "xiv-fl-help-close") toggleHelp(false);
    });
    document.documentElement.appendChild(help);
    return help;
  }

  function toggleHelp(force) {
    const help = ensureHelp();
    const open = force ?? help.dataset.open !== "true";
    help.dataset.open = open ? "true" : "false";
  }

  function ensureToolbar() {
    const actions = document.querySelector("#xiv-topbar .xiv-actions");
    if (!actions || actions.dataset.flProductReady === "true") return;
    actions.dataset.flProductReady = "true";
    const helpBtn = makeButton("?", "快捷键说明 (?)", () => toggleHelp());
    const selectBtn = makeButton("选择", "选择模式 (S)", () => toggleSelectionMode());
    selectBtn.dataset.flSelectButton = "true";
    const downloadBtn = makeButton("下选", "下载已选；没有选择时下载当前可见内容 (Shift+D)", downloadSelectedOrVisible);
    const copyBtn = makeButton("链接", "复制已选/可见链接 (E)", copySelectedOrVisibleLinks);
    actions.insertBefore(helpBtn, actions.firstChild);
    actions.insertBefore(selectBtn, actions.children[1] || null);
    actions.insertBefore(downloadBtn, actions.children[2] || null);
    actions.insertBefore(copyBtn, actions.children[3] || null);
  }

  function makeButton(text, title, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "xiv-fl-product-btn";
    button.title = title;
    button.textContent = text;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function syncSelectionUi() {
    const r = root();
    if (r) r.dataset.flSelecting = selectionMode ? "true" : "false";
    document.querySelector('[data-fl-select-button]')?.setAttribute("data-active", selectionMode ? "true" : "false");
    for (const tile of tiles()) {
      tile.dataset.flSelected = selectedKeys.has(tileKey(tile)) ? "true" : "false";
    }
    const count = selectedKeys.size;
    if (selectionMode) setStatus(count ? `已选择 ${count} 个` : "选择模式：点击图片加入选择");
  }

  function toggleSelectionMode(force) {
    selectionMode = force ?? !selectionMode;
    syncSelectionUi();
  }

  function clearSelection() {
    selectedKeys.clear();
    syncSelectionUi();
    setStatus("已清空选择");
  }

  function toggleTile(tile) {
    const key = tileKey(tile);
    if (!key) return;
    if (selectedKeys.has(key)) selectedKeys.delete(key);
    else selectedKeys.add(key);
    syncSelectionUi();
  }

  document.addEventListener("click", (event) => {
    if (!active() || !selectionMode || lightboxActive()) return;
    const tile = event.target?.closest?.("#xiv-grid .xiv-tile");
    if (!tile) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    toggleTile(tile);
  }, true);

  function targetTiles() {
    const picked = selectedTiles();
    return picked.length ? picked : visibleTiles();
  }

  async function sendDownload(url, filename) {
    if (!url) return { ok: false, error: "empty url" };
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage && isImage(url)) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "XIV_DOWNLOAD_URL", url, filename, referrer: location.href, direct: true }, (response) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(response || { ok: false, error: "no response" });
        });
      });
    }
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename.split("/").pop() || "flowlens-media";
      a.rel = "noopener";
      document.documentElement.appendChild(a);
      a.click();
      a.remove();
      return { ok: true, via: "anchor" };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }

  async function downloadSelectedOrVisible() {
    const list = targetTiles();
    if (!list.length) { setStatus("没有可下载内容"); return; }
    setStatus(`开始下载 ${list.length} 个`);
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < list.length; i += 1) {
      const url = mediaUrl(list[i]);
      const res = await sendDownload(url, filenameFor(url, i));
      if (res?.ok) ok += 1;
      else fail += 1;
      if (i % 6 === 5) await sleep(260);
    }
    setStatus(fail ? `下载完成 ${ok} 个，失败 ${fail} 个` : `下载完成 ${ok} 个`);
  }

  async function copySelectedOrVisibleLinks() {
    const urls = targetTiles().map(mediaUrl).filter(Boolean);
    if (!urls.length) { setStatus("没有可复制链接"); return; }
    const text = [...new Set(urls)].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`已复制 ${urls.length} 条链接`);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.documentElement.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      setStatus(`已复制 ${urls.length} 条链接`);
    }
  }

  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  function isTypingTarget(target) { return target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']"); }

  document.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target)) return;
    if (event.key === "?" || (event.shiftKey && event.key === "/")) {
      if (active()) {
        event.preventDefault(); event.stopPropagation(); toggleHelp();
      }
      return;
    }
    if (!active()) return;
    if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "s") {
      event.preventDefault(); event.stopPropagation(); toggleSelectionMode();
    } else if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "x") {
      event.preventDefault(); event.stopPropagation(); clearSelection();
    } else if (event.shiftKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "d") {
      event.preventDefault(); event.stopPropagation(); downloadSelectedOrVisible();
    } else if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "e") {
      event.preventDefault(); event.stopPropagation(); copySelectedOrVisibleLinks();
    }
  }, true);

  function recordHistory() {
    if (!active()) return;
    const first = visibleTiles()[0];
    const stage = document.getElementById("xiv-stage");
    const history = readJson(HISTORY_KEY, []);
    const item = {
      url: location.href,
      title: document.title || location.href,
      time: Date.now(),
      count: tiles().length,
      filter: localStorage.getItem(FILTER_KEY) || "all",
      scrollTop: stage?.scrollTop || 0,
      firstUrl: mediaUrl(first)
    };
    const next = [item, ...history.filter((old) => old.url !== item.url)].slice(0, 80);
    writeJson(HISTORY_KEY, next);
  }

  function scheduleHistory() {
    clearTimeout(historyTimer);
    historyTimer = window.setTimeout(recordHistory, 500);
  }

  function preloadAroundLightbox() {
    clearTimeout(preloadTimer);
    preloadTimer = window.setTimeout(() => {
      if (!lightboxActive()) return;
      const lb = document.getElementById("xiv-lightbox");
      const current = lb?.querySelector("img")?.currentSrc || lb?.querySelector("img")?.src || "";
      const list = tiles();
      let index = list.findIndex((tile) => mediaUrl(tile) === current || current.includes(mediaUrl(tile)) || mediaUrl(tile).includes(current));
      if (index < 0) index = Number(list.find((tile) => tile.getBoundingClientRect().top >= 0)?.dataset.index || 0);
      const urls = [];
      for (const offset of [1, 2, -1]) {
        const tile = list[index + offset];
        const url = mediaUrl(tile);
        if (url && isImage(url)) urls.push(url);
      }
      for (const url of urls.slice(0, 3)) {
        const img = new Image();
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.src = url;
      }
    }, 120);
  }

  function ensureMediaObserver() {
    if (mediaObserver || !("IntersectionObserver" in window)) return;
    mediaObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const tile = entry.target;
        tile.dataset.flNearViewport = entry.isIntersecting ? "true" : "false";
        if (!entry.isIntersecting) {
          tile.querySelectorAll("video").forEach((video) => {
            try { video.pause(); } catch { /* ignore */ }
          });
        }
      }
    }, { root: document.getElementById("xiv-stage") || null, rootMargin: "900px 0px", threshold: 0.01 });
  }

  function observeTiles() {
    ensureMediaObserver();
    if (!mediaObserver) return;
    for (const tile of tiles()) {
      if (tile.dataset.flObserved === "true") continue;
      tile.dataset.flObserved = "true";
      mediaObserver.observe(tile);
      const media = tile.querySelector("img, video");
      if (media) {
        media.decoding = "async";
        if (media.tagName === "IMG" && !media.loading) media.loading = "lazy";
        if (media.tagName === "VIDEO") media.preload = "metadata";
      }
    }
  }

  function applyAll() {
    injectStyle();
    ensureToolbar();
    ensureHelp();
    observeTiles();
    syncSelectionUi();
    scheduleHistory();
    preloadAroundLightbox();
  }

  function scheduleApplyAll() {
    clearTimeout(toolbarTimer);
    toolbarTimer = window.setTimeout(applyAll, 160);
  }

  injectStyle();
  ensureHelp();
  new MutationObserver(scheduleApplyAll).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "src", "style", "hidden", "class"] });
  window.addEventListener("scroll", scheduleHistory, { passive: true });
  window.addEventListener("resize", scheduleApplyAll, { passive: true });
  window.setInterval(() => { if (active()) applyAll(); }, 1800);
})();
