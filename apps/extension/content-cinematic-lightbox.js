(() => {
  if (window.__flowLensFastLightboxPatch) return;
  window.__flowLensFastLightboxPatch = true;

  const STYLE_ID = "flowlens-fast-lightbox-style";
  const PRELOAD_OFFSETS = [0, 1, 2, 3, 4, 5, -1, -2];
  const warmedImages = new Map();
  let refreshTimer = 0;

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #xiv-lightbox[data-active="true"] {
        overflow: hidden !important;
        scrollbar-width: none !important;
        overscroll-behavior: none !important;
      }
      #xiv-lightbox[data-active="true"]::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
      #xiv-lightbox[data-active="true"][data-zoom="actual"],
      #xiv-lightbox[data-active="true"][data-fl-shortcut-zoom="true"] {
        overflow: auto !important;
        scrollbar-width: none !important;
      }
      #xiv-lightbox[data-active="true"] > img,
      #xiv-lightbox[data-active="true"] > video {
        transform: translate3d(0, 0, 0);
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }
      #xiv-lightbox[data-active="true"]:not([data-zoom="actual"]):not([data-fl-shortcut-zoom="true"]) > img,
      #xiv-lightbox[data-active="true"]:not([data-zoom="actual"]):not([data-fl-shortcut-zoom="true"]) > video {
        max-width: 100vw !important;
        max-height: 100svh !important;
        margin: 0 auto !important;
        object-fit: contain !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function lightbox() {
    const node = document.getElementById("xiv-lightbox");
    return node?.dataset.active === "true" ? node : null;
  }

  function coreApi() {
    return window.__flowLensControl || null;
  }

  function isImageUrl(url) {
    return /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(String(url || "")) || /^data:image\//i.test(String(url || ""));
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

  function warmImage(url) {
    const key = normalizeUrl(url);
    if (!key || !isImageUrl(key) || /^blob:/i.test(key)) return Promise.resolve(false);
    const cached = warmedImages.get(key);
    if (cached && Date.now() - cached.time < 180000) return cached.promise;

    const img = new Image();
    img.decoding = "async";
    try { img.fetchPriority = "high"; } catch {}
    try { img.referrerPolicy = "no-referrer"; } catch {}

    let timer = 0;
    const loaded = new Promise((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      timer = window.setTimeout(() => resolve(false), 1800);
    });
    img.src = key;
    const decoded = img.decode ? img.decode().then(() => true, () => false) : loaded;
    const promise = Promise.race([loaded, decoded]).finally(() => clearTimeout(timer));
    warmedImages.set(key, { image: img, promise, time: Date.now() });
    if (warmedImages.size > 90) {
      const oldest = [...warmedImages.entries()].sort((a, b) => a[1].time - b[1].time).slice(0, 24);
      oldest.forEach(([oldKey]) => warmedImages.delete(oldKey));
    }
    return promise;
  }

  function sortedTiles() {
    return [...document.querySelectorAll("#xiv-grid .xiv-tile")]
      .sort((a, b) => Number(a.dataset.index || 0) - Number(b.dataset.index || 0));
  }

  function tilePreview(tile) {
    const media = tile?.querySelector("img, video");
    return media?.currentSrc || media?.src || tile?.dataset?.url || "";
  }

  function warmAdjacentImages() {
    const tiles = sortedTiles();
    const current = Number(coreApi()?.getLightboxIndex?.());
    if (!tiles.length || !Number.isFinite(current)) return;
    PRELOAD_OFFSETS.forEach((offset) => {
      const tile = tiles[current + offset];
      const src = tilePreview(tile);
      if (src) warmImage(src);
    });
  }

  function refresh() {
    installStyle();
    if (!lightbox()) return;
    warmAdjacentImages();
  }

  function scheduleRefresh(delay = 80) {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refresh, delay);
  }

  document.addEventListener("pointerdown", (event) => {
    const tile = event.target?.closest?.("#xiv-grid .xiv-tile");
    if (!tile) return;
    const index = Number(tile.dataset.index || 0);
    const tiles = sortedTiles();
    PRELOAD_OFFSETS.forEach((offset) => {
      const src = tilePreview(tiles[index + offset]);
      if (src) warmImage(src);
    });
  }, true);

  new MutationObserver(() => scheduleRefresh(80)).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-active", "src", "data-index"]
  });

  installStyle();
  scheduleRefresh(0);
})();
