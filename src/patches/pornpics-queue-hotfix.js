(() => {
  if (window.__flowLensPornpicsQueueHotfix) return;
  window.__flowLensPornpicsQueueHotfix = true;

  const ACTIVE_LIST_KEY = "flowlens-pornpics-active-list-v2";
  const CURRENT_GALLERY_KEY = "flowlens-pornpics-current-gallery-v2";
  const GLOBAL_QUEUE_KEY = "flowlens-pornpics-last-queue-v2";
  const AUTO_OPEN_KEY = "flowlens-gallery-queue-auto-open";
  const QUEUE_PREFIX = "flowlens-pornpics-list-queue-v2:";
  const GALLERY_PATH_RE = /^\/(?:[a-z]{2}\/)??galleries\/[^/?#]+-\d+\/?$/i;
  let syncTimer = 0;
  let referrerSeeded = false;

  function isHost(url = location.href) {
    try { return /(^|\.)pornpics\.com$/i.test(new URL(url, location.href).hostname); } catch { return false; }
  }

  function isGalleryUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return isHost(parsed.href) && GALLERY_PATH_RE.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function normalizeUrl(raw, base = location.href) {
    try {
      const parsed = new URL(raw, base);
      parsed.hash = "";
      if (isGalleryUrl(parsed.href) && !parsed.pathname.endsWith("/")) parsed.pathname += "/";
      return parsed.href;
    } catch {
      return "";
    }
  }

  function listKey(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      parsed.search = "";
      return `${QUEUE_PREFIX}${parsed.origin}${parsed.pathname}`;
    } catch {
      return "";
    }
  }

  function currentGalleryUrl() {
    const stored = normalizeUrl(sessionStorage.getItem(CURRENT_GALLERY_KEY) || "");
    if (isGalleryUrl(stored)) return stored;
    const current = normalizeUrl(location.href);
    return isGalleryUrl(current) ? current : "";
  }

  function unique(urls) {
    const seen = new Set();
    const clean = [];
    urls.forEach((url) => {
      const normalized = normalizeUrl(url);
      if (!normalized || !isGalleryUrl(normalized)) return;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      clean.push(normalized);
    });
    return clean;
  }

  function collectQueueFromDocument(doc = document, base = location.href) {
    const found = [];
    const roots = doc.querySelectorAll?.("main, #main, .main, .content, .container, body") || [];
    const scanRoots = roots.length ? Array.from(roots) : [doc.body || doc.documentElement];
    scanRoots.forEach((root) => {
      root?.querySelectorAll?.("a[href]").forEach((link) => {
        const url = normalizeUrl(link.getAttribute("href") || "", base);
        if (isGalleryUrl(url)) found.push(url);
      });
    });
    return unique(found);
  }

  function storeQueueForList(listUrl, queue) {
    const clean = unique(queue);
    if (clean.length < 2) return clean;
    const key = listKey(listUrl);
    if (!key) return clean;
    try {
      sessionStorage.setItem(key, JSON.stringify(clean.slice(0, 500)));
      sessionStorage.setItem(ACTIVE_LIST_KEY, key);
      sessionStorage.setItem(GLOBAL_QUEUE_KEY, JSON.stringify(clean.slice(0, 500)));
    } catch {}
    return clean;
  }

  function rememberVisibleList() {
    if (!isHost() || isGalleryUrl(location.href)) return [];
    const queue = collectQueueFromDocument(document, location.href);
    return storeQueueForList(location.href, queue);
  }

  function readQueueByKey(key) {
    if (!key) return [];
    try {
      const data = JSON.parse(sessionStorage.getItem(key) || "[]");
      return Array.isArray(data) ? unique(data) : [];
    } catch {
      return [];
    }
  }

  function activeQueue() {
    const current = currentGalleryUrl();
    const activeKey = sessionStorage.getItem(ACTIVE_LIST_KEY) || "";
    const active = readQueueByKey(activeKey);
    if (active.length > 1 && (!current || active.some((url) => url.toLowerCase() === current.toLowerCase()))) return active;
    const global = readQueueByKey(GLOBAL_QUEUE_KEY);
    if (global.length > 1 && (!current || global.some((url) => url.toLowerCase() === current.toLowerCase()))) return global;
    const visible = rememberVisibleList();
    return visible.length > 1 ? visible : active.length > 1 ? active : global;
  }

  function queueTarget(delta) {
    const queue = activeQueue();
    if (queue.length < 2) return "";
    const current = currentGalleryUrl();
    let index = queue.findIndex((url) => url.toLowerCase() === current.toLowerCase());
    if (index < 0) index = 0;
    return queue[(index + delta + queue.length) % queue.length] || "";
  }

  function syncButtons() {
    if (!isHost()) return;
    const queue = activeQueue();
    if (queue.length < 2) return;
    const current = currentGalleryUrl();
    const index = Math.max(0, queue.findIndex((url) => url.toLowerCase() === current.toLowerCase()));
    document.querySelectorAll('#xiv-root [data-xiv="prev-set"], #xiv-root [data-xiv="next-set"]').forEach((button) => {
      const label = button.dataset.xiv === "prev-set" ? "上一组" : "下一组";
      button.disabled = false;
      button.dataset.enabled = "true";
      button.title = `${label}（${index + 1}/${queue.length}，←/→）`;
    });
  }

  function scheduleSync(delay = 120) {
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(syncButtons, delay);
  }

  function openGallery(target) {
    if (!target || !isGalleryUrl(target)) return false;
    try {
      sessionStorage.setItem(CURRENT_GALLERY_KEY, target);
      sessionStorage.setItem(AUTO_OPEN_KEY, target);
    } catch {}
    location.href = target;
    return true;
  }

  function onListClick(event) {
    if (!isHost()) return;
    const link = event.target?.closest?.("a[href]");
    if (!link) return;
    const target = normalizeUrl(link.getAttribute("href") || "", location.href);
    if (!isGalleryUrl(target)) return;
    rememberVisibleList();
    try { sessionStorage.setItem(CURRENT_GALLERY_KEY, target); } catch {}
  }

  function onQueueButton(event) {
    if (!isHost()) return;
    const button = event.target?.closest?.('#xiv-root [data-xiv="prev-set"], #xiv-root [data-xiv="next-set"]');
    if (!button) return;
    const target = queueTarget(button.dataset.xiv === "next-set" ? 1 : -1);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openGallery(target);
  }

  function isTypingTarget(target) {
    return !!target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  }

  function onKeydown(event) {
    if (!isHost()) return;
    if (isTypingTarget(event.target) || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    const root = document.getElementById("xiv-root");
    const lightbox = document.getElementById("xiv-lightbox");
    if (!root || root.dataset.active !== "true" || lightbox?.dataset.active === "true") return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const target = queueTarget(event.key === "ArrowRight" ? 1 : -1);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openGallery(target);
  }

  async function seedFromReferrer() {
    if (referrerSeeded || !isHost() || !isGalleryUrl(location.href)) return;
    referrerSeeded = true;
    let referrer = "";
    try { referrer = document.referrer || ""; } catch {}
    if (!referrer || !isHost(referrer) || isGalleryUrl(referrer)) return;
    try {
      const response = await fetch(referrer, { credentials: "include", cache: "force-cache" });
      if (!response.ok) return;
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const queue = collectQueueFromDocument(doc, referrer);
      storeQueueForList(referrer, queue);
      scheduleSync(30);
    } catch {}
  }

  document.addEventListener("click", onListClick, true);
  document.addEventListener("click", onQueueButton, true);
  window.addEventListener("keydown", onKeydown, true);
  const observer = new MutationObserver(() => {
    if (!isHost()) return;
    if (!isGalleryUrl(location.href)) rememberVisibleList();
    scheduleSync(120);
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "disabled", "data-enabled"] });
  [0, 300, 900, 1800, 3200].forEach((delay) => window.setTimeout(() => {
    if (!isGalleryUrl(location.href)) rememberVisibleList();
    scheduleSync(30);
  }, delay));
  void seedFromReferrer();
})();
