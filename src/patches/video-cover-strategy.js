(() => {
  if (window.__flowLensVideoCoverStrategyPatch) return;
  window.__flowLensVideoCoverStrategyPatch = true;

  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
  const IMAGE_RE = /\.(avif|gif|jpe?g|png|webp)(?:[?#]|$)|[?&]format=(?:avif|gif|jpe?g|png|webp)\b/i;
  const posterByVideo = new Map();
  const failedPosters = new Set();
  let collectTimer = 0;
  let enhanceTimer = 0;

  function absoluteUrl(raw, base = location.href) {
    if (!raw || /^data:/i.test(raw)) return "";
    try { return new URL(raw, base).href; } catch { return ""; }
  }

  function mediaKey(url) {
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      return `${parsed.origin}${parsed.pathname}`.toLowerCase();
    } catch {
      return String(url || "").split("#")[0].split("?")[0].toLowerCase();
    }
  }

  function isVideoUrl(url) { return VIDEO_RE.test(String(url || "")); }
  function isImageUrl(url) { return IMAGE_RE.test(String(url || "")); }

  function rememberPoster(videoUrl, posterUrl) {
    const video = absoluteUrl(videoUrl);
    const poster = absoluteUrl(posterUrl);
    if (!video || !poster || !isVideoUrl(video) || !isImageUrl(poster)) return;
    const key = mediaKey(video);
    if (!posterByVideo.has(key) || /poster|thumb|cover|preview/i.test(poster)) {
      posterByVideo.set(key, poster);
    }
  }

  function attrUrl(node, names) {
    for (const name of names) {
      const value = node?.getAttribute?.(name) || "";
      const url = absoluteUrl(value, node?.baseURI || location.href);
      if (url) return url;
    }
    return "";
  }

  function nearestImageUrl(node) {
    const scope = node?.closest?.("a, article, li, div, figure, section") || node?.parentElement;
    const img = scope?.querySelector?.("img[src], img[data-src], img[data-original], img[data-thumb], img[data-lazy-src]");
    return attrUrl(img, ["src", "data-src", "data-original", "data-thumb", "data-lazy-src"]);
  }

  function collectPosters(root = document) {
    try {
      root.querySelectorAll?.("video").forEach((video) => {
        const poster = absoluteUrl(video.getAttribute("poster") || video.poster || "", video.baseURI || location.href)
          || attrUrl(video, ["data-poster", "data-thumb", "data-thumbnail", "data-cover", "data-preview"])
          || nearestImageUrl(video);
        const urls = [
          video.currentSrc,
          video.src,
          attrUrl(video, ["src", "data-src", "data-url"]),
          ...[...video.querySelectorAll("source[src]")].map((source) => attrUrl(source, ["src", "data-src"]))
        ].filter(Boolean);
        urls.forEach((url) => rememberPoster(url, poster));
      });

      root.querySelectorAll?.("a[href]").forEach((link) => {
        const href = attrUrl(link, ["href"]);
        if (!isVideoUrl(href)) return;
        const poster = nearestImageUrl(link)
          || attrUrl(link, ["data-poster", "data-thumb", "data-thumbnail", "data-cover", "data-preview"]);
        rememberPoster(href, poster);
      });

      const metaVideo = attrUrl(root.querySelector?.('meta[property="og:video"], meta[name="twitter:player:stream"]'), ["content"]);
      const metaPoster = attrUrl(root.querySelector?.('meta[property="og:image"], meta[name="twitter:image"]'), ["content"]);
      rememberPoster(metaVideo, metaPoster);
    } catch {
      // Poster discovery is best-effort; fallback cards still keep the grid usable.
    }
  }

  function posterFor(videoUrl, tile) {
    const fromTileVideo = tile?.querySelector?.("video[poster]")?.poster || "";
    if (fromTileVideo && isImageUrl(fromTileVideo)) return fromTileVideo;
    return posterByVideo.get(mediaKey(videoUrl)) || "";
  }

  function injectStyle() {
    if (document.getElementById("fl-video-cover-strategy-style")) return;
    const style = document.createElement("style");
    style.id = "fl-video-cover-strategy-style";
    style.textContent = `
      #xiv-root .fl-video-cover-img {
        width: 100% !important;
        height: auto !important;
        display: block !important;
        object-fit: cover !important;
        background: #111 !important;
      }
      #xiv-root .fl-video-cover-fallback {
        width: 100% !important;
        aspect-ratio: var(--fl-video-cover-ratio, 16 / 9) !important;
        min-height: 92px !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 8px !important;
        border-radius: inherit !important;
        background: linear-gradient(135deg, rgba(18,18,22,.96), rgba(42,42,50,.92)) !important;
        color: rgba(255,255,255,.92) !important;
        font: 900 13px/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        text-align: center !important;
        box-sizing: border-box !important;
      }
      #xiv-root .fl-video-cover-play {
        width: 46px !important;
        height: 46px !important;
        border-radius: 999px !important;
        display: grid !important;
        place-items: center !important;
        background: rgba(255,255,255,.16) !important;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.16) !important;
      }
      #xiv-root .fl-video-cover-play::before {
        content: "";
        width: 0;
        height: 0;
        border-top: 10px solid transparent;
        border-bottom: 10px solid transparent;
        border-left: 15px solid currentColor;
        margin-left: 4px;
      }
      #xiv-root .fl-video-cover-sub {
        opacity: .66 !important;
        font-size: 11px !important;
        font-weight: 750 !important;
      }
      #xiv-root[data-theme="light"] .fl-video-cover-fallback {
        background: linear-gradient(135deg, rgba(235,238,242,.98), rgba(210,216,225,.94)) !important;
        color: rgba(25,28,34,.9) !important;
      }
      #xiv-root[data-theme="light"] .fl-video-cover-play {
        background: rgba(0,0,0,.08) !important;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,.08) !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function videoRatioFromUrl(url) {
    const match = String(url || "").match(/(?:^|[/_-])(\d{2,5})x(\d{2,5})(?=[/_.-]|\.[a-z0-9]+(?:[?#]|$))/i);
    if (!match) return "16 / 9";
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width > 0 && height > 0 ? `${width} / ${height}` : "16 / 9";
  }

  function firstMediaChild(tile) {
    return tile?.querySelector?.(":scope > img, :scope > video, :scope > .xiv-video-placeholder, :scope > .fl-video-cover-fallback")
      || tile?.querySelector?.("img, video, .xiv-video-placeholder, .fl-video-cover-fallback")
      || null;
  }

  function replaceMedia(tile, node) {
    const media = firstMediaChild(tile);
    if (media) media.replaceWith(node);
    else tile.insertBefore(node, tile.firstChild);
    window.setTimeout(() => window.dispatchEvent(new Event("resize")), 30);
  }

  function fallbackCard(url, reason = "封面不可用") {
    const node = document.createElement("div");
    node.className = "fl-video-cover-fallback";
    node.dataset.sourceUrl = url;
    node.dataset.coverReason = reason;
    node.style.aspectRatio = videoRatioFromUrl(url);
    node.innerHTML = `<span class="fl-video-cover-play" aria-hidden="true"></span><strong>视频</strong><span class="fl-video-cover-sub">${reason}，点击播放</span>`;
    return node;
  }

  function replaceWithFallback(tile, url, reason) {
    if (!tile?.isConnected || tile.dataset.flVideoCoverFallback === "true") return;
    tile.dataset.flVideoCoverStage = "fallback";
    tile.dataset.flVideoCoverFallback = "true";
    replaceMedia(tile, fallbackCard(url, reason));
  }

  function posterImage(tile, url, poster) {
    const img = document.createElement("img");
    img.className = "fl-video-cover-img";
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = "";
    img.referrerPolicy = "no-referrer-when-downgrade";
    img.dataset.sourceUrl = url;
    img.dataset.posterUrl = poster;
    img.addEventListener("load", () => {
      tile.dataset.flVideoCoverStage = "poster";
      if (img.naturalWidth > 0 && img.naturalHeight > 0) img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
    }, { once: true });
    img.addEventListener("error", () => {
      failedPosters.add(mediaKey(poster));
      replaceWithFallback(tile, url, "封面加载失败");
    }, { once: true });
    img.src = poster;
    return img;
  }

  function applyPosterIfAvailable(tile, url) {
    const poster = posterFor(url, tile);
    if (!poster || failedPosters.has(mediaKey(poster))) return false;
    const current = firstMediaChild(tile);
    if (current?.tagName === "IMG" && mediaKey(current.currentSrc || current.src || "") === mediaKey(poster)) return true;
    replaceMedia(tile, posterImage(tile, url, poster));
    return true;
  }

  function watchVideoPreview(tile, video, url) {
    if (!video || video.dataset.flCoverWatched === "true") return;
    video.dataset.flCoverWatched = "true";
    let settled = false;
    const done = () => { settled = true; };
    ["loadeddata", "canplay", "seeked"].forEach((eventName) => video.addEventListener(eventName, done, { once: true }));
    video.addEventListener("error", () => {
      window.setTimeout(() => {
        if (settled || !tile.isConnected) return;
        if (applyPosterIfAvailable(tile, url)) return;
        replaceWithFallback(tile, url, "预览加载失败");
      }, 2400);
    });
    window.setTimeout(() => {
      if (settled || !tile.isConnected || tile.querySelector("img.fl-video-cover-img, .fl-video-cover-fallback")) return;
      if ((video.readyState || 0) >= 2 || video.dataset.previewCaptured === "true") return;
      if (applyPosterIfAvailable(tile, url)) return;
      replaceWithFallback(tile, url, "预览超时");
    }, 13000);
  }

  function enhanceTile(tile) {
    const url = tile?.dataset?.url || "";
    if (!isVideoUrl(url)) return;
    tile.dataset.flVideoCoverStrategy = "true";

    if (applyPosterIfAvailable(tile, url)) return;

    const video = tile.querySelector("video");
    if (video) {
      tile.dataset.flVideoCoverStage = "frame";
      watchVideoPreview(tile, video, url);
      return;
    }

    const placeholder = tile.querySelector(".xiv-video-placeholder");
    if (placeholder) replaceWithFallback(tile, url, "等待点击播放");
  }

  function enhanceAllTiles() {
    injectStyle();
    collectPosters(document);
    document.querySelectorAll("#xiv-root .xiv-tile").forEach(enhanceTile);
  }

  function scheduleEnhance() {
    clearTimeout(enhanceTimer);
    enhanceTimer = window.setTimeout(enhanceAllTiles, 100);
  }

  function schedulePosterCollect() {
    clearTimeout(collectTimer);
    collectTimer = window.setTimeout(() => collectPosters(document), 220);
  }

  injectStyle();
  collectPosters(document);
  scheduleEnhance();

  new MutationObserver((mutations) => {
    let shouldCollect = false;
    let shouldEnhance = false;
    for (const mutation of mutations) {
      if (mutation.target?.closest?.("#xiv-root")) shouldEnhance = true;
      for (const node of mutation.addedNodes || []) {
        if (node?.nodeType !== 1) continue;
        if (node.matches?.("video, source, a[href], img, meta") || node.querySelector?.("video, source, a[href], img, meta")) shouldCollect = true;
        if (node.matches?.("#xiv-root, .xiv-tile") || node.querySelector?.("#xiv-root .xiv-tile, .xiv-tile")) shouldEnhance = true;
      }
    }
    if (shouldCollect) schedulePosterCollect();
    if (shouldEnhance) scheduleEnhance();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "href", "poster", "data-src", "data-poster", "data-thumb", "data-url", "data-active"] });
})();
