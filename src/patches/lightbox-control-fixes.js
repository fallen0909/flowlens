(() => {
  if (window.__flowLensLightboxControlFixes) return;
  window.__flowLensLightboxControlFixes = true;

  const PORNPICS_GALLERY_RE = /\/((?:[a-z]{2}\/)?galleries\/[^/?#]+?-\d+\/?)(?:[?#].*)?$/i;
  const PORNPICS_QUEUE_CURRENT_KEY = "flowlens-pornpics-current-gallery";
  const PORNPICS_REFERRER_DONE_KEY = "flowlens-pornpics-referrer-scanned";
  const PORNPICS_CATEGORY_URL_KEY = "flowlens-pornpics-category-url";
  const PORNPICS_CATEGORY_QUEUE_PREFIX = "flowlens-pornpics-category-queue:";
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

  function isPornpicsHost(url = location.href) {
    try { return /(^|\.)pornpics\.com$/i.test(new URL(url, location.href).hostname); } catch { return false; }
  }

  function isPornpicsAssetUrl(value) {
    try {
      const parsed = new URL(String(value || ""), location.href);
      return /pornpics/i.test(parsed.hostname) || (isPornpicsHost() && /\.(?:avif|gif|jpe?g|png|webp|mp4|webm|mov|m4v)(?:$|[?#])/i.test(parsed.href));
    } catch {
      return false;
    }
  }

  function installPornpicsReferrerPatch() {
    if (window.__flowLensPornpicsReferrerPatch) return;
    window.__flowLensPornpicsReferrerPatch = true;
    const imageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    if (imageSrc?.set && imageSrc?.get) {
      Object.defineProperty(HTMLImageElement.prototype, "src", {
        configurable: true,
        enumerable: imageSrc.enumerable,
        get: imageSrc.get,
        set(value) {
          if (isPornpicsAssetUrl(value)) this.referrerPolicy = "no-referrer-when-downgrade";
          return imageSrc.set.call(this, value);
        }
      });
    }
    const mediaSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
    if (mediaSrc?.set && mediaSrc?.get) {
      Object.defineProperty(HTMLMediaElement.prototype, "src", {
        configurable: true,
        enumerable: mediaSrc.enumerable,
        get: mediaSrc.get,
        set(value) {
          if (isPornpicsAssetUrl(value)) this.referrerPolicy = "no-referrer-when-downgrade";
          return mediaSrc.set.call(this, value);
        }
      });
    }
    const nativeSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function patchedSetAttribute(name, value) {
      if (/^(src|srcset|poster)$/i.test(String(name || "")) && isPornpicsAssetUrl(value) && "referrerPolicy" in this) {
        this.referrerPolicy = "no-referrer-when-downgrade";
      }
      return nativeSetAttribute.call(this, name, value);
    };
  }

  function installControlStyle() {
    if (document.getElementById("flowlens-lightbox-control-fixes-style")) return;
    const style = document.createElement("style");
    style.id = "flowlens-lightbox-control-fixes-style";
    style.textContent = `
      #xiv-lightbox .xiv-lightbox-slideshow,
      #xiv-lightbox .xiv-lightbox-fav,
      #xiv-lightbox .xiv-lightbox-close {
        position: fixed !important;
        top: max(10px, env(safe-area-inset-top, 0px) + 10px) !important;
        transform: none !important;
        transition: none !important;
        will-change: auto !important;
      }
      #xiv-lightbox .xiv-lightbox-arrow {
        position: fixed !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        transition: none !important;
        will-change: auto !important;
      }
      #xiv-lightbox[data-zoom="actual"] .xiv-lightbox-close,
      #xiv-lightbox[data-zoom="actual"] .xiv-lightbox-fav,
      #xiv-lightbox[data-zoom="actual"] .xiv-lightbox-slideshow,
      #xiv-lightbox[data-fl-shortcut-zoom="true"] .xiv-lightbox-close,
      #xiv-lightbox[data-fl-shortcut-zoom="true"] .xiv-lightbox-fav,
      #xiv-lightbox[data-fl-shortcut-zoom="true"] .xiv-lightbox-slideshow {
        position: fixed !important;
        top: max(10px, env(safe-area-inset-top, 0px) + 10px) !important;
      }
      #xiv-lightbox[data-zoom="actual"] .xiv-lightbox-arrow,
      #xiv-lightbox[data-fl-shortcut-zoom="true"] .xiv-lightbox-arrow {
        position: fixed !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow svg {
        display: block !important;
        width: 24px !important;
        height: 24px !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function slideshowIconMarkup(active = slideshowActive) {
    if (active) {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.8" height="14" rx="1.2" fill="currentColor"></rect><rect x="13.2" y="5" width="3.8" height="14" rx="1.2" fill="currentColor"></rect></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.4 0-1.8L9.6 4.9C8.9 4.5 8 5 8 5.8Z" fill="currentColor"></path></svg>';
  }

  function slideshowButtonMarkup() {
    const active = slideshowActive ? "true" : "false";
    const title = slideshowActive ? "暂停大图自动切换" : "开始大图自动切换";
    return `<button class="xiv-lightbox-slideshow" type="button" data-active="${active}" data-fl-stable="true" title="${title}" aria-label="${title}">${slideshowIconMarkup(slideshowActive)}</button>`;
  }

  function installLightboxInnerHTMLPatch() {
    if (window.__flowLensStableSlideshowInnerHTML) return;
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    if (!descriptor?.set || !descriptor?.get) return;
    window.__flowLensStableSlideshowInnerHTML = true;
    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value) {
        let next = value;
        try {
          if (this?.id === "xiv-lightbox" && typeof next === "string" && next.includes("xiv-lightbox-fav") && !next.includes("xiv-lightbox-slideshow")) {
            next = next.replace(/<button\s+class="xiv-lightbox-fav"/i, `${slideshowButtonMarkup()}<button class="xiv-lightbox-fav"`);
          }
        } catch {}
        return descriptor.set.call(this, next);
      }
    });
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

  function drawSlideshowButton(button, active = slideshowActive) {
    if (!button) return;
    const wanted = active ? "pause" : "play";
    button.dataset.active = active ? "true" : "false";
    button.dataset.flUnifiedIcon = wanted;
    const title = active ? "暂停大图自动切换" : "开始大图自动切换";
    button.title = title;
    button.setAttribute("aria-label", title);
    if (button.dataset.flControlIcon === wanted && button.querySelector("svg")) return;
    button.dataset.flControlIcon = wanted;
    button.innerHTML = slideshowIconMarkup(active);
  }

  function setSlideshowButtonState(active) {
    document.querySelectorAll(".xiv-lightbox-slideshow").forEach((button) => drawSlideshowButton(button, active));
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

  function onWindowWheel(event) {
    if (handleLightboxZoomWheel(event)) claim(event);
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

  function currentPornpicsCategoryUrl() {
    const current = normalizedUrl(location.href);
    if (!current || isPornpicsGalleryUrl(current) || !isPornpicsHost(current)) return "";
    return current;
  }

  function pornpicsStorageKey(url = location.href) {
    try { return `flowlens-gallery-queue:${new URL(url, location.href).origin}`; } catch { return "flowlens-gallery-queue"; }
  }

  function pornpicsCategoryQueueKey(categoryUrl) {
    const normalized = normalizedUrl(categoryUrl || "");
    if (!normalized) return "";
    try {
      const parsed = new URL(normalized, location.href);
      parsed.hash = "";
      parsed.search = "";
      return `${PORNPICS_CATEGORY_QUEUE_PREFIX}${parsed.origin}${parsed.pathname}`;
    } catch {
      return "";
    }
  }

  function uniqueGalleryQueue(queue) {
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
    return clean;
  }

  function readPornpicsQueue() {
    try {
      const data = JSON.parse(sessionStorage.getItem(pornpicsStorageKey()) || "[]");
      return Array.isArray(data) ? uniqueGalleryQueue(data) : [];
    } catch {
      return [];
    }
  }

  function writePornpicsQueue(queue) {
    const clean = uniqueGalleryQueue(queue);
    if (clean.length > 1) {
      try { sessionStorage.setItem(pornpicsStorageKey(), JSON.stringify(clean.slice(0, 500))); } catch {}
    }
    return clean;
  }

  function readCategoryQueue(categoryUrl = "") {
    const key = pornpicsCategoryQueueKey(categoryUrl || sessionStorage.getItem(PORNPICS_CATEGORY_URL_KEY) || "");
    if (!key) return [];
    try {
      const data = JSON.parse(sessionStorage.getItem(key) || "[]");
      return Array.isArray(data) ? uniqueGalleryQueue(data) : [];
    } catch {
      return [];
    }
  }

  function writeCategoryQueue(categoryUrl, queue) {
    const key = pornpicsCategoryQueueKey(categoryUrl);
    const clean = uniqueGalleryQueue(queue);
    if (!key || clean.length < 2) return clean;
    try {
      sessionStorage.setItem(key, JSON.stringify(clean.slice(0, 500)));
      sessionStorage.setItem(PORNPICS_CATEGORY_URL_KEY, normalizedUrl(categoryUrl));
    } catch {}
    return clean;
  }

  function collectPornpicsQueueFromHtml(html, base) {
    const found = [];
    const linkRe = /<a\b[^>]*?href=["']([^"']+)["'][^>]*>/gi;
    const urlRe = /(?:https?:)?\/\/(?:www\.)?pornpics\.com\/(?:[a-z]{2}\/)?galleries\/[^"'<>\s\\]+?-\d+\/?|["'\s(=](\/(?:[a-z]{2}\/)?galleries\/[^"'<>\s\\]+?-\d+\/?)|(?:data-url|data-href)=["']([^"']+)["']/gi;
    let match;
    while ((match = linkRe.exec(html))) {
      const url = normalizedUrl(match[1], base);
      if (isPornpicsGalleryUrl(url)) found.push(url);
    }
    while ((match = urlRe.exec(html))) {
      const raw = match[1] || match[2] || match[0].replace(/^["'\s(=]+/, "");
      const url = normalizedUrl(raw, base);
      if (isPornpicsGalleryUrl(url)) found.push(url);
    }
    return uniqueGalleryQueue(found);
  }

  function collectPornpicsQueueFromDocument(doc = document, base = location.href) {
    const roots = Array.from(doc.querySelectorAll?.("#main, main, .main, .content, .container, body") || []);
    const scanRoots = roots.length ? roots : [doc.documentElement || doc.body];
    const found = [];
    scanRoots.forEach((scope) => {
      scope?.querySelectorAll?.("a[href], [data-url], [data-href]").forEach((node) => {
        ["href", "data-url", "data-href"].forEach((attr) => {
          const value = node.getAttribute?.(attr);
          const url = normalizedUrl(value || "", base);
          if (isPornpicsGalleryUrl(url)) found.push(url);
        });
      });
    });
    const html = doc.documentElement?.innerHTML || "";
    collectPornpicsQueueFromHtml(html, base).forEach((url) => found.push(url));
    return uniqueGalleryQueue(found);
  }

  function rememberCurrentCategoryQueue() {
    const category = currentPornpicsCategoryUrl();
    if (!category) return [];
    const queue = collectPornpicsQueueFromDocument(document, category);
    if (queue.length > 1) {
      writeCategoryQueue(category, queue);
      writePornpicsQueue(queue);
    }
    return queue;
  }

  function mergePornpicsQueue(extra = []) {
    if (!isPornpicsHost()) return [];
    const current = normalizedUrl(sessionStorage.getItem(PORNPICS_QUEUE_CURRENT_KEY) || location.href);
    const category = sessionStorage.getItem(PORNPICS_CATEGORY_URL_KEY) || "";
    const categoryQueue = readCategoryQueue(category);
    if (categoryQueue.length > 1) return writePornpicsQueue([...categoryQueue, current, ...extra]);
    const visibleQueue = currentPornpicsCategoryUrl() ? rememberCurrentCategoryQueue() : [];
    return writePornpicsQueue([
      ...readPornpicsQueue(),
      ...visibleQueue,
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

  function activePornpicsQueue() {
    const categoryQueue = readCategoryQueue();
    if (categoryQueue.length > 1) return categoryQueue;
    return mergePornpicsQueue();
  }

  function pornpicsQueueTarget(delta) {
    const queue = activePornpicsQueue();
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
    const queue = activePornpicsQueue();
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
    } else {
      rememberCurrentCategoryQueue();
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
        writeCategoryQueue(referrer, queue);
        writePornpicsQueue(queue);
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
    const category = currentPornpicsCategoryUrl();
    if (category) {
      const queue = rememberCurrentCategoryQueue();
      if (queue.length > 1) writeCategoryQueue(category, queue);
    }
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

  function isTypingTarget(target) {
    return !!target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  }

  function handleImageStreamArrowKey(event) {
    const app = root();
    if (!app || app.dataset.active !== "true" || isLightboxOpen()) return false;
    if (isTypingTarget(event.target) || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return false;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;
    if (isPornpicsHost()) {
      const targetUrl = pornpicsQueueTarget(event.key === "ArrowRight" ? 1 : -1);
      if (!targetUrl) return false;
      void loadPornpicsGallery(targetUrl);
      return true;
    }
    const button = app.querySelector(event.key === "ArrowRight" ? '[data-xiv="next-set"]' : '[data-xiv="prev-set"]');
    if (!button || button.disabled) return false;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }

  function handleGalleryQueueKeydown(event) {
    if (handleImageStreamArrowKey(event)) return true;
    if (!isPornpicsHost()) return false;
    const target = event.target;
    if (isTypingTarget(target)) return false;
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return false;
    const isPrev = event.key === "," || event.key === "，" || event.code === "Comma";
    const isNext = event.key === "." || event.key === "。" || event.code === "Period";
    if (!isPrev && !isNext) return false;
    const targetUrl = pornpicsQueueTarget(isNext ? 1 : -1);
    if (!targetUrl) return false;
    void loadPornpicsGallery(targetUrl);
    return true;
  }

  function onWindowKeydown(event) {
    if (handleGalleryQueueKeydown(event)) claim(event);
  }

  window.__flowLensHandleLightboxZoomWheel = handleLightboxZoomWheel;
  window.__flowLensHandleGalleryQueueKeydown = handleGalleryQueueKeydown;

  installControlStyle();
  installPornpicsReferrerPatch();
  installLightboxInnerHTMLPatch();
  window.addEventListener("pointerdown", onSlideshowControlEvent, true);
  window.addEventListener("mousedown", onSlideshowControlEvent, true);
  window.addEventListener("touchstart", onSlideshowControlEvent, { capture: true, passive: false });
  window.addEventListener("click", onSlideshowControlEvent, true);
  window.addEventListener("wheel", onWindowWheel, { capture: true, passive: false });
  window.addEventListener("keydown", onWindowKeydown, true);
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

  const observer = new MutationObserver(() => {
    installControlStyle();
    document.querySelectorAll(".xiv-lightbox-slideshow").forEach((button) => drawSlideshowButton(button, slideshowActive));
    if (currentPornpicsCategoryUrl()) rememberCurrentCategoryQueue();
    schedulePornpicsSync(160);
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "data-enabled", "href", "data-url", "data-href", "src", "poster", "data-active"] });

  [0, 300, 900, 1800, 3200].forEach((delay) => window.setTimeout(() => {
    installControlStyle();
    document.querySelectorAll(".xiv-lightbox-slideshow").forEach((button) => drawSlideshowButton(button, slideshowActive));
    if (currentPornpicsCategoryUrl()) rememberCurrentCategoryQueue();
    mergePornpicsQueue();
    schedulePornpicsSync(30);
  }, delay));
  void seedPornpicsQueueFromReferrer();
})();
