(() => {
  if (window.__flowLensIosSmoothPatch) return;
  window.__flowLensIosSmoothPatch = true;

  const STYLE_ID = "flowlens-lightbox-ios-smooth-style";
  const PRELOAD_OFFSETS = [1, 2, 3, -1];
  const preloadCache = new Map();
  const internalSrcSets = new WeakSet();
  const pendingTokens = new WeakMap();

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #xiv-lightbox[data-active="true"] {
        contain: paint;
        -webkit-font-smoothing: antialiased;
      }
      #xiv-lightbox img.xiv-fl-smooth-media,
      #xiv-lightbox video.xiv-fl-smooth-media,
      #xiv-lightbox iframe.xiv-fl-smooth-media,
      #xiv-lightbox .xiv-video-frame.xiv-fl-smooth-media {
        opacity: 1 !important;
        transform: translate3d(0, 0, 0) !important;
        transition: none !important;
        will-change: transform !important;
        backface-visibility: hidden !important;
        -webkit-backface-visibility: hidden !important;
        filter: none !important;
      }
      #xiv-lightbox img.xiv-fl-smooth-decoded {
        image-rendering: auto;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function activeLightbox() {
    const node = document.getElementById("xiv-lightbox");
    return node?.dataset.active === "true" ? node : null;
  }

  function coreApi() {
    return window.__flowLensControl || null;
  }

  function normalizeUrl(value) {
    const text = String(value || "");
    if (!text) return "";
    if (/^(?:blob|data):/i.test(text)) return text;
    try {
      const parsed = new URL(text, location.href);
      parsed.hash = "";
      return parsed.href;
    } catch {
      return text.replace(/#.*$/, "");
    }
  }

  function sameUrl(a, b) {
    const left = normalizeUrl(a);
    const right = normalizeUrl(b);
    return !!left && !!right && left === right;
  }

  function isVideoUrl(url) {
    return /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(String(url || ""));
  }

  function referrerPolicyFor(url, fallback = "") {
    if (fallback) return fallback;
    try {
      const parsed = new URL(url, location.href);
      return /(^|\.)(xchina\.co|155picpic\.com)$/i.test(parsed.hostname) ? "no-referrer-when-downgrade" : "no-referrer";
    } catch {
      return "no-referrer";
    }
  }

  function warmImage(url, referrerPolicy = "") {
    const key = normalizeUrl(url);
    if (!key || isVideoUrl(key) || /^(?:blob|data):/i.test(key)) return Promise.resolve(false);

    const cached = preloadCache.get(key);
    if (cached && Date.now() - cached.time < 90000) return cached.promise;

    const img = new Image();
    img.decoding = "async";
    img.referrerPolicy = referrerPolicyFor(key, referrerPolicy);

    let done = false;
    let timer = 0;
    const finish = (ok) => {
      if (done) return ok;
      done = true;
      clearTimeout(timer);
      return ok;
    };

    const waitLoad = new Promise((resolve) => {
      img.onload = () => resolve(finish(true));
      img.onerror = () => resolve(finish(false));
      timer = window.setTimeout(() => resolve(finish(false)), 2600);
    });

    img.src = key;
    const decode = img.decode ? img.decode().then(() => true, () => false) : waitLoad;
    const promise = Promise.race([decode, waitLoad]).then((ok) => ok !== false);
    preloadCache.set(key, { promise, time: Date.now(), image: img });
    return promise;
  }

  function markSmoothMedia(media) {
    if (!media || !media.classList) return;
    media.classList.add("xiv-fl-smooth-media");
  }

  function shouldSmoothSwap(img, nextUrl) {
    if (!img || img.tagName !== "IMG") return false;
    if (internalSrcSets.has(img)) return false;
    const lb = activeLightbox();
    if (!lb || !lb.contains(img)) return false;
    const target = normalizeUrl(nextUrl);
    if (!target || /^(?:blob|data):/i.test(target)) return false;
    const current = normalizeUrl(img.currentSrc || img.src || "");
    if (!current || sameUrl(current, target)) return false;
    return true;
  }

  function findImageSrcDescriptor() {
    let proto = HTMLImageElement.prototype;
    while (proto) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, "src");
      if (descriptor?.get && descriptor?.set) return descriptor;
      proto = Object.getPrototypeOf(proto);
    }
    return null;
  }

  function installSmoothSrcSetter() {
    const descriptor = findImageSrcDescriptor();
    if (!descriptor || HTMLImageElement.prototype.__flowLensSmoothSrcInstalled) return;

    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value) {
        const url = String(value || "");
        if (!shouldSmoothSwap(this, url)) {
          descriptor.set.call(this, value);
          return;
        }
        smoothSetSrc(this, url, descriptor);
      }
    });

    Object.defineProperty(HTMLImageElement.prototype, "__flowLensSmoothSrcInstalled", {
      configurable: false,
      enumerable: false,
      value: true
    });
  }

  async function smoothSetSrc(img, url, descriptor) {
    const token = `${Date.now()}:${Math.random()}`;
    pendingTokens.set(img, token);
    markSmoothMedia(img);

    await warmImage(url, img.referrerPolicy || "");
    if (!img.isConnected || pendingTokens.get(img) !== token) return;

    const onReady = () => {
      if (pendingTokens.get(img) !== token) return;
      pendingTokens.delete(img);
      img.classList.add("xiv-fl-smooth-decoded");
      markSmoothMedia(img);
      warmAdjacentFromLightbox();
    };

    img.addEventListener("load", onReady, { once: true });
    img.addEventListener("error", onReady, { once: true });

    internalSrcSets.add(img);
    try {
      descriptor.set.call(img, url);
    } finally {
      queueMicrotask(() => internalSrcSets.delete(img));
    }

    if (img.complete) window.setTimeout(onReady, 0);
    window.setTimeout(onReady, 140);
  }

  function sortedTiles() {
    return [...document.querySelectorAll("#xiv-grid .xiv-tile")]
      .sort((a, b) => Number(a.dataset.index || 0) - Number(b.dataset.index || 0));
  }

  function warmAroundIndex(index) {
    const tiles = sortedTiles();
    if (!tiles.length || !Number.isFinite(index)) return;
    for (const offset of [0, ...PRELOAD_OFFSETS]) {
      const tile = tiles[index + offset];
      const url = tile?.dataset.url || "";
      if (url && !isVideoUrl(url)) warmImage(url);
    }
  }

  function warmAdjacentFromLightbox() {
    const index = Number(coreApi()?.getLightboxIndex?.());
    if (Number.isFinite(index)) warmAroundIndex(index);
  }

  function bindTilePreload() {
    document.addEventListener("pointerdown", (event) => {
      const tile = event.target?.closest?.("#xiv-grid .xiv-tile");
      if (!tile) return;
      warmAroundIndex(Number(tile.dataset.index || 0));
    }, true);
  }

  function decorateLightboxMedia(root = activeLightbox()) {
    if (!root) return;
    root.querySelectorAll("img, video, iframe, .xiv-video-frame").forEach(markSmoothMedia);
    warmAdjacentFromLightbox();
  }

  function observeLightbox() {
    const observer = new MutationObserver((mutations) => {
      let shouldDecorate = false;
      for (const mutation of mutations) {
        if (mutation.target?.id === "xiv-lightbox") shouldDecorate = true;
        if ([...mutation.addedNodes].some((node) => node?.nodeType === 1 && (node.matches?.("#xiv-lightbox img, #xiv-lightbox video, #xiv-lightbox iframe, #xiv-lightbox .xiv-video-frame") || node.querySelector?.("#xiv-lightbox img, #xiv-lightbox video, #xiv-lightbox iframe, #xiv-lightbox .xiv-video-frame")))) {
          shouldDecorate = true;
        }
      }
      if (shouldDecorate) requestAnimationFrame(() => decorateLightboxMedia());
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-active", "src", "class"]
    });
  }

  installStyle();
  installSmoothSrcSetter();
  bindTilePreload();
  observeLightbox();
})();
