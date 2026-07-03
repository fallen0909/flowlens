(() => {
  if (window.__flowLensLightboxControlFixes) return;
  window.__flowLensLightboxControlFixes = true;

  const PORNPICS_GALLERY_RE = /\/((?:[a-z]{2}\/)?galleries\/[^/?#]+?-\d+\/?)(?:[?#].*)?$/i;
  const PORNPICS_QUEUE_CURRENT_KEY = "flowlens-pornpics-current-gallery";
  const PORNPICS_REFERRER_DONE_KEY = "flowlens-pornpics-referrer-scanned";
  const SLIDESHOW_SELECTOR = [
    ".xiv-lightbox-slideshow",
    "[data-fl-lightbox-control='slideshow']",
    "[aria-label*='自动切换']",
    "[title*='自动切换']"
  ].join(",");

  let slideshowActive = false;
  let slideshowTimer = 0;
  let slideshowPointerAt = 0;
  let pornpicsSyncTimer = 0;

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { return document.getElementById("xiv-lightbox"); }
  function isLightboxOpen() { return lightbox()?.dataset.active === "true"; }
  function coreApi() { return window.__flowLensControl || null; }

  function claim(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }

  function blockNextLightboxClick(ms = 800) {
    window.__flowLensBlockNextLightboxClickUntil = Math.max(
      Number(window.__flowLensBlockNextLightboxClickUntil || 0),
      Date.now() + ms
    );
  }

  function slideshowControl(target) {
    return target?.closest?.(SLIDESHOW_SELECTOR) || null;
  }

  function setSlideshowButtonState(active) {
    document.querySelectorAll(".xiv-lightbox-slideshow").forEach((button) => {
      button.dataset.active = active ? "true" : "false";
      button.title = active ? "暂停大图自动切换" : "开始大图自动切换";
      button.setAttribute("aria-label", button.title);
    });
    window.dispatchEvent(new CustomEvent("flowlens:slideshow-state", { detail: { active, source: "control-fixes" } }));
  }

  function activeVideo() {
    const box = lightbox();
    return box?.querySelector("video") || null;
  }

  function videoStillRunning() {
    const video = activeVideo();
    if (!video) return false;
    try {
      video.playsInline = true;
      if (video.paused) video.play?.()?.catch?.(() => {});
    } catch {}
    const duration = Number(video.duration || 0);
    if (video.ended) return false;
    if (Number.isFinite(duration) && duration > 0) return Number(video.currentTime || 0) < duration - 0.35;
    return true;
  }

  function stopSlideshow() {
    slideshowActive = false;
    clearTimeout(slideshowTimer);
    slideshowTimer = 0;
    setSlideshowButtonState(false);
  }

  function showNextLightboxItem() {
    if (coreApi()?.showAdjacent?.(1)) return true;
    const arrow = lightbox()?.querySelector?.('.xiv-lightbox-arrow[data-side="right"]');
    if (arrow) {
      arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    }
    return false;
  }

  function scheduleSlideshow(delay = 1200) {
    clearTimeout(slideshowTimer);
    if (!slideshowActive) return;
    slideshowTimer = window.setTimeout(() => {
      if (!slideshowActive) return;
      if (!isLightboxOpen()) { stopSlideshow(); return; }
      if (videoStillRunning()) {
        scheduleSlideshow(650);
        return;
      }
      showNextLightboxItem();
      scheduleSlideshow(1200);
    }, Math.max(350, delay));
    setSlideshowButtonState(true);
  }

  function startSlideshow() {
    if (!isLightboxOpen()) return;
    slideshowActive = true;
    if (videoStillRunning()) scheduleSlideshow(650);
    else scheduleSlideshow(1200);
    setSlideshowButtonState(true);
  }

  function toggleSlideshowFallback() {
    if (slideshowActive) stopSlideshow();
    else startSlideshow();
  }

  function onSlideshowControlEvent(event) {
    const control = slideshowControl(event.target);
    if (!control || !isLightboxOpen()) return;
    blockNextLightboxClick();
    const isPointerLike = event.type === "pointerdown" || event.type === "mousedown" || event.type === "touchstart";
    if (isPointerLike) {
      claim(event);
      if (event.type !== "pointerdown" && Date.now() - slideshowPointerAt < 500) return;
      slideshowPointerAt = Date.now();
      toggleSlideshowFallback();
      return;
    }
    if (event.type === "click") {
      claim(event);
      if (Date.now() - slideshowPointerAt > 500) toggleSlideshowFallback();
    }
  }

  function mediaEl() {
    return lightbox()?.querySelector("img, video, iframe[data-media-url], .xiv-video-frame") || null;
  }

  function ensureZoomHint() {
    const box = lightbox();
    if (!box) return null;
    let hint = box.querySelector(".fl-zoom-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "fl-zoom-hint";
      box.appendChild(hint);
    }
    return hint;
  }

  function showZoomHint(text) {
    const hint = ensureZoomHint();
    if (!hint) return;
    hint.textContent = text;
    hint.dataset.show = "true";
    clearTimeout(Number(hint.dataset.timer || 0));
    hint.dataset.timer = String(window.setTimeout(() => { hint.dataset.show = "false"; }, 750));
  }

  function numberFromCss(value) {
    const n = Number.parseFloat(String(value || ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function currentMediaSize(box, media) {
    const rect = media.getBoundingClientRect?.();
    const actualWidth = numberFromCss(media.style.getPropertyValue("--xiv-actual-width"));
    const actualHeight = numberFromCss(media.style.getPropertyValue("--xiv-actual-height"));
    const inlineWidth = numberFromCss(media.style.width);
    const inlineHeight = numberFromCss(media.style.height);
    const width = actualWidth || inlineWidth || Math.max(1, Math.round(rect?.width || media.clientWidth || 1));
    const height = actualHeight || inlineHeight || Math.max(1, Math.round(rect?.height || media.clientHeight || 1));
    return { width, height, actualWidth, actualHeight, box };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rememberWheelZoomBase(media, width, height) {
    if (!numberFromCss(media.dataset.flWheelZoomBaseWidth)) media.dataset.flWheelZoomBaseWidth = String(width);
    if (!numberFromCss(media.dataset.flWheelZoomBaseHeight)) media.dataset.flWheelZoomBaseHeight = String(height);
  }

  function handleLightboxZoomWheel(event) {
    const box = lightbox();
    if (!box || box.dataset.active !== "true") return false;
    const zoomMode = box.dataset.zoom === "actual" || box.dataset.flShortcutZoom === "true";
    if (!zoomMode) return false;
    const media = mediaEl();
    if (!media || !box.contains(media)) return false;
    const delta = Math.abs(event.deltaY || 0) >= Math.abs(event.deltaX || 0) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 2) return true;

    const beforeScrollWidth = Math.max(1, box.scrollWidth);
    const beforeScrollHeight = Math.max(1, box.scrollHeight);
    const keepX = (box.scrollLeft + box.clientWidth / 2) / beforeScrollWidth;
    const keepY = (box.scrollTop + box.clientHeight / 2) / beforeScrollHeight;
    const size = currentMediaSize(box, media);
    rememberWheelZoomBase(media, size.width, size.height);
    const baseWidth = numberFromCss(media.dataset.flWheelZoomBaseWidth) || size.width;
    const baseHeight = numberFromCss(media.dataset.flWheelZoomBaseHeight) || size.height;
    const ratio = baseHeight > 0 ? baseHeight / baseWidth : size.height / Math.max(1, size.width);
    const multiplier = delta < 0 ? 1.12 : 1 / 1.12;
    const nextWidth = Math.round(clamp(size.width * multiplier, Math.max(80, baseWidth * 0.35), Math.max(baseWidth * 6, box.clientWidth * 6)));
    const nextHeight = Math.round(Math.max(1, nextWidth * ratio));

    if (box.dataset.zoom === "actual") {
      media.style.setProperty("--xiv-actual-width", `${nextWidth}px`);
      media.style.setProperty("--xiv-actual-height", `${nextHeight}px`);
    } else {
      media.style.setProperty("width", `${nextWidth}px`, "important");
      media.style.setProperty("height", `${nextHeight}px`, "important");
      media.style.setProperty("max-width", "none", "important");
      media.style.setProperty("max-height", "none", "important");
      media.style.setProperty("margin", "40px", "important");
    }
    box.dataset.flWheelZoom = "true";
    box.dataset.flZoomFactor = String(Math.round((nextWidth / baseWidth) * 100) / 100);
    media.dataset.xivCanZoom = "true";

    const recenter = () => {
      if (!box.isConnected || box.dataset.active !== "true") return;
      box.scrollTo?.({
        left: Math.max(0, Math.round(box.scrollWidth * keepX - box.clientWidth / 2)),
        top: Math.max(0, Math.round(box.scrollHeight * keepY - box.clientHeight / 2)),
        behavior: "auto"
      });
    };
    requestAnimationFrame(recenter);
    window.setTimeout(recenter, 40);
    showZoomHint(`缩放 ${Math.round((nextWidth / baseWidth) * 100)}%`);
    return true;
  }

  function isPornpicsHost(url = location.href) {
    try { return /(^|\.)pornpics\.com$/i.test(new URL(url, location.href).hostname); } catch { return false; }
  }

  function normalizedUrl(raw, base = location.href) {
    try {
      const parsed = new URL(raw, base);
      parsed.hash = "";
      if (isPornpicsGalleryUrl(parsed.href) && !parsed.pathname.endsWith("/")) parsed.pathname += "/";
      return parsed.href;
    } catch {
      return "";
    }
  }

  function isPornpicsGalleryUrl(raw) {
    try {
      const parsed = new URL(raw, location.href);
      return isPornpicsHost(parsed.href) && PORNPICS_GALLERY_RE.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function pornpicsStorageKey(url = location.href) {
    try { return `flowlens-gallery-queue:${new URL(url, location.href).origin}`; } catch { return "flowlens-gallery-queue"; }
  }

  function readPornpicsQueue() {
    try {
      const data = JSON.parse(sessionStorage.getItem(pornpicsStorageKey()) || "[]");
      return Array.isArray(data) ? data.map((url) => normalizedUrl(url)).filter(isPornpicsGalleryUrl) : [];
    } catch {
      return [];
    }
  }

  function writePornpicsQueue(queue) {
    const seen = new Set();
    const clean = [];
    queue.forEach((url) => {
      const normalized = normalizedUrl(url);
      if (!normalized || !isPornpicsGalleryUrl(normalized)) return;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      clean.push(normalized);
    });
    if (clean.length > 1) {
      try { sessionStorage.setItem(pornpicsStorageKey(), JSON.stringify(clean.slice(0, 300))); } catch {}
    }
    return clean;
  }

  function collectPornpicsQueueFromHtml(html, base) {
    const found = [];
    const re = /(?:https?:)?\/\/(?:www\.)?pornpics\.com\/(?:[a-z]{2}\/)?galleries\/[^"'<>\s\\]+?-\d+\/?|["'\s(=](\/(?:[a-z]{2}\/)?galleries\/[^"'<>\s\\]+?-\d+\/?)|["'\s(=](\/(?:[a-z]{2}\/)?shorts\/[^"'<>\s\\]+?-\d+\/?)|(?:href|data-url|data-href)=['"]([^'"]+?)['"]/gi;
    let match;
    while ((match = re.exec(html))) {
      const raw = match[1] || match[2] || match[3] || match[0].replace(/^["'\s(=]+/, "");
      const url = normalizedUrl(raw, base);
      if (isPornpicsGalleryUrl(url)) found.push(url);
    }
    return found;
  }

  function collectPornpicsQueueFromDocument(doc = document, base = location.href) {
    const found = [];
    doc.querySelectorAll?.("a[href], [data-url], [data-href]").forEach((node) => {
      ["href", "data-url", "data-href"].forEach((attr) => {
        const value = node.getAttribute?.(attr);
        const url = normalizedUrl(value || "", base);
        if (isPornpicsGalleryUrl(url)) found.push(url);
      });
    });
    const html = doc.documentElement?.innerHTML || "";
    collectPornpicsQueueFromHtml(html, base).forEach((url) => found.push(url));
    return found;
  }

  function mergePornpicsQueue(extra = []) {
    if (!isPornpicsHost()) return [];
    const current = normalizedUrl(sessionStorage.getItem(PORNPICS_QUEUE_CURRENT_KEY) || location.href);
    return writePornpicsQueue([
      ...readPornpicsQueue(),
      ...collectPornpicsQueueFromDocument(document, location.href),
      current,
      ...extra
    ]);
  }

  function currentPornpicsGalleryUrl() {
    const stored = normalizedUrl(sessionStorage.getItem(PORNPICS_QUEUE_CURRENT_KEY) || "");
    if (isPornpicsGalleryUrl(stored)) return stored;
    const current = normalizedUrl(location.href);
    return isPornpicsGalleryUrl(current) ? current : "";
  }

  function pornpicsQueueTarget(delta) {
    const queue = mergePornpicsQueue();
    if (queue.length < 2) return "";
    const current = currentPornpicsGalleryUrl();
    let index = queue.findIndex((url) => url.toLowerCase() === current.toLowerCase());
    if (index < 0) index = 0;
    return queue[(index + delta + queue.length) % queue.length] || "";
  }

  async function loadPornpicsGallery(target) {
    if (!target || !isPornpicsGalleryUrl(target)) return false;
    try { sessionStorage.setItem(PORNPICS_QUEUE_CURRENT_KEY, target); } catch {}
    mergePornpicsQueue([target]);
    if (coreApi()?.loadSavedPage) {
      const ok = await coreApi().loadSavedPage(target);
      if (ok) {
        try { history.pushState({ flowlensPornpicsQueue: true }, "", target); } catch {}
        window.setTimeout(syncPornpicsButtons, 80);
        return true;
      }
    }
    location.href = target;
    return true;
  }

  function syncPornpicsButtons() {
    if (!isPornpicsHost()) return;
    const queue = mergePornpicsQueue();
    if (queue.length < 2) return;
    const current = currentPornpicsGalleryUrl();
    const index = Math.max(0, queue.findIndex((url) => url.toLowerCase() === current.toLowerCase()));
    document.querySelectorAll('#xiv-root [data-xiv="prev-set"], #xiv-root [data-xiv="next-set"]').forEach((button) => {
      button.disabled = false;
      button.dataset.enabled = "true";
      const label = button.dataset.xiv === "prev-set" ? "上一组" : "下一组";
      button.title = `${label}（${index + 1}/${queue.length}）`;
    });
  }

  function schedulePornpicsSync(delay = 120) {
    clearTimeout(pornpicsSyncTimer);
    pornpicsSyncTimer = window.setTimeout(syncPornpicsButtons, delay);
  }

  async function seedPornpicsQueueFromReferrer() {
    if (!isPornpicsHost()) return;
    const current = normalizedUrl(location.href);
    if (isPornpicsGalleryUrl(current)) {
      try { sessionStorage.setItem(PORNPICS_QUEUE_CURRENT_KEY, current); } catch {}
    }
    const initial = mergePornpicsQueue();
    if (initial.length > 1) { schedulePornpicsSync(); return; }
    let referrer = "";
    try { referrer = document.referrer || ""; } catch {}
    if (!referrer || !isPornpicsHost(referrer) || normalizedUrl(referrer) === current) return;
    const refKey = `${PORNPICS_REFERRER_DONE_KEY}:${normalizedUrl(referrer)}`;
    try {
      if (sessionStorage.getItem(refKey) === "true") return;
      sessionStorage.setItem(refKey, "true");
    } catch {}
    try {
      const response = await fetch(referrer, { credentials: "include", cache: "force-cache" });
      if (!response.ok) return;
      const html = await response.text();
      const queue = collectPornpicsQueueFromHtml(html, referrer);
      if (queue.length) {
        mergePornpicsQueue(queue);
        schedulePornpicsSync(30);
      }
    } catch {
      // Same-origin referrer fetch is best-effort; visible-page collection remains active.
    }
  }

  function onPornpicsLinkClick(event) {
    if (!isPornpicsHost()) return;
    const link = event.target?.closest?.("a[href]");
    if (!link) return;
    const target = normalizedUrl(link.getAttribute("href") || "", location.href);
    if (!isPornpicsGalleryUrl(target)) return;
    try { sessionStorage.setItem(PORNPICS_QUEUE_CURRENT_KEY, target); } catch {}
    mergePornpicsQueue([target]);
  }

  function onPornpicsQueueButton(event) {
    if (!isPornpicsHost()) return;
    const button = event.target?.closest?.('#xiv-root [data-xiv="prev-set"], #xiv-root [data-xiv="next-set"]');
    if (!button) return;
    const delta = button.dataset.xiv === "next-set" ? 1 : -1;
    const target = pornpicsQueueTarget(delta);
    if (!target) return;
    claim(event);
    void loadPornpicsGallery(target);
  }

  function handleGalleryQueueKeydown(event) {
    if (!isPornpicsHost()) return false;
    const target = event.target;
    if (target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']")) return false;
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return false;
    const isPrev = event.key === "," || event.key === "，" || event.code === "Comma";
    const isNext = event.key === "." || event.key === "。" || event.code === "Period";
    if (!isPrev && !isNext) return false;
    const targetUrl = pornpicsQueueTarget(isNext ? 1 : -1);
    if (!targetUrl) return false;
    void loadPornpicsGallery(targetUrl);
    return true;
  }

  window.__flowLensHandleLightboxZoomWheel = handleLightboxZoomWheel;
  window.__flowLensHandleGalleryQueueKeydown = handleGalleryQueueKeydown;

  document.addEventListener("pointerdown", onSlideshowControlEvent, true);
  document.addEventListener("mousedown", onSlideshowControlEvent, true);
  document.addEventListener("touchstart", onSlideshowControlEvent, { capture: true, passive: false });
  document.addEventListener("click", onSlideshowControlEvent, true);
  document.addEventListener("click", onPornpicsLinkClick, true);
  document.addEventListener("click", onPornpicsQueueButton, true);
  window.addEventListener("flowlens:slideshow-state", (event) => {
    if (event.detail?.source === "control-fixes") return;
    slideshowActive = event.detail?.active === true;
    clearTimeout(slideshowTimer);
  });
  window.addEventListener("popstate", () => schedulePornpicsSync(120));

  const observer = new MutationObserver(() => schedulePornpicsSync(160));
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "data-enabled", "href", "data-url", "data-href"] });

  [0, 300, 900, 1800, 3200].forEach((delay) => window.setTimeout(() => {
    mergePornpicsQueue();
    schedulePornpicsSync(30);
  }, delay));
  void seedPornpicsQueueFromReferrer();
})();
