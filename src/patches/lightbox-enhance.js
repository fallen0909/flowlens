(() => {
  if (window.__flowLensLightboxEnhancePatch) return;
  window.__flowLensLightboxEnhancePatch = true;
  window.__flowLensSlideshowNativePatch = true;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const LEGACY_SPEED_KEY = "flowlens-lightbox-slideshow-delay-v1";
  const STYLE_ID = "flowlens-lightbox-enhance-style";
  const SPEED_OPTIONS = [800, 1200, 1800, 2400, 3200];
  const DEFAULT_DELAY = 1200;
  const ZOOM_MAP = { "1": 1.5, "2": 2, "3": 4, "0": 1 };

  let slideshowActive = false;
  let slideshowTimer = 0;
  let refreshTimer = 0;
  let observer = null;
  let lightboxObserver = null;
  let lightboxObserverTarget = null;
  let zoomFactor = 1;
  let zoomMediaKey = "";
  let drag = null;
  let slideshowPointerHandledAt = 0;

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { return root()?.querySelector("#xiv-lightbox"); }
  function isOpen() { return lightbox()?.dataset.active === "true"; }
  function coreApi() { return window.__flowLensControl || null; }

  function readSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; }
  }

  function slideshowDelay() {
    const stored = Number(readSettings().lightboxAutoDelay || 0);
    if (SPEED_OPTIONS.includes(stored)) return stored;
    try {
      const legacy = Number(localStorage.getItem(LEGACY_SPEED_KEY) || 0);
      if (SPEED_OPTIONS.includes(legacy)) return legacy;
    } catch {}
    return DEFAULT_DELAY;
  }

  function speedLabel(ms) {
    if (ms <= 800) return "极速 0.8秒";
    if (ms <= 1200) return "默认 1.2秒";
    if (ms <= 1800) return "较快 1.8秒";
    if (ms <= 2400) return "普通 2.4秒";
    return "慢速 3.2秒";
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #xiv-lightbox[data-fl-shortcut-zoom="true"] {
        overflow: auto !important;
        align-items: flex-start !important;
        justify-content: flex-start !important;
        scroll-behavior: auto !important;
      }
      #xiv-lightbox[data-fl-shortcut-zoom="true"] img,
      #xiv-lightbox[data-fl-shortcut-zoom="true"] video,
      #xiv-lightbox[data-fl-shortcut-zoom="true"] iframe[data-media-url],
      #xiv-lightbox[data-fl-shortcut-zoom="true"] .xiv-video-frame {
        max-width: none !important;
        max-height: none !important;
        object-fit: contain !important;
        flex: 0 0 auto !important;
        cursor: grab !important;
      }
      #xiv-lightbox[data-fl-dragging="true"] img,
      #xiv-lightbox[data-fl-dragging="true"] video,
      #xiv-lightbox[data-fl-dragging="true"] iframe[data-media-url],
      #xiv-lightbox[data-fl-dragging="true"] .xiv-video-frame { cursor: grabbing !important; }
      #xiv-lightbox .fl-zoom-hint {
        position: fixed;
        left: 50%;
        bottom: max(20px, env(safe-area-inset-bottom, 0px) + 18px);
        transform: translateX(-50%);
        z-index: 2147483647;
        padding: 8px 12px;
        border-radius: 999px;
        color: #fff;
        background: rgba(0,0,0,.58);
        backdrop-filter: blur(10px);
        font: 850 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
        opacity: 0;
        transition: opacity .16s ease;
      }
      #xiv-lightbox .fl-zoom-hint[data-show="true"] { opacity: 1; }
    `;
    document.documentElement.appendChild(style);
  }

  function ensureButton() {
    const box = lightbox();
    if (!box || box.dataset.active !== "true") return null;
    let btn = box.querySelector(".xiv-lightbox-slideshow");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "xiv-lightbox-slideshow";
      const fav = box.querySelector(".xiv-lightbox-fav");
      if (fav?.parentNode === box) box.insertBefore(btn, fav);
      else box.appendChild(btn);
    }
    btn.dataset.active = slideshowActive ? "true" : "false";
    btn.title = slideshowActive ? "暂停大图自动切换" : `开始大图自动切换（${speedLabel(slideshowDelay())}）`;
    btn.setAttribute("aria-label", btn.title);
    return btn;
  }

  function removeButton() {
    stopSlideshow(false);
    lightbox()?.querySelector(".xiv-lightbox-slideshow")?.remove();
  }

  function mediaEl() { return lightbox()?.querySelector("img, video, iframe[data-media-url], .xiv-video-frame") || null; }
  function mediaKey(el = mediaEl()) { return el?.currentSrc || el?.src || el?.dataset?.mediaUrl || el?.getAttribute?.("src") || el?.getAttribute?.("srcdoc")?.slice(0, 120) || ""; }

  function iframeVideo(frame) {
    try { return frame?.contentDocument?.querySelector?.("video") || null; } catch { return null; }
  }

  function activeVideo() {
    const box = lightbox();
    return box?.querySelector("video") || iframeVideo(box?.querySelector("iframe[data-media-url], .xiv-video-frame"));
  }

  function playVideo(video) {
    if (!video) return false;
    if (!video.playsInline) video.playsInline = true;
    if (!video.paused && !video.ended) return true;
    try {
      const promise = video.play?.();
      promise?.catch?.(() => {
        try {
          video.muted = true;
          video.play?.()?.catch?.(() => {});
        } catch {}
      });
    } catch {}
    return true;
  }

  function videoRunning() {
    const video = activeVideo();
    if (!video) return false;
    playVideo(video);
    const duration = Number(video.duration || 0);
    if (video.ended) return false;
    if (Number.isFinite(duration) && duration > 0) return Number(video.currentTime || 0) < duration - 0.35;
    return true;
  }

  function goNext() {
    resetZoom(false);
    if (coreApi()?.showAdjacent?.(1)) return true;
    const arrow = lightbox()?.querySelector?.('.xiv-lightbox-arrow[data-side="right"]');
    if (arrow) {
      arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
    return false;
  }

  function scheduleSlideshow(wait = slideshowDelay()) {
    clearTimeout(slideshowTimer);
    if (!slideshowActive) return;
    slideshowTimer = window.setTimeout(slideshowTick, Math.max(250, Number(wait) || DEFAULT_DELAY));
    ensureButton();
    window.dispatchEvent(new CustomEvent("flowlens:slideshow-state", { detail: { active: slideshowActive } }));
  }

  function slideshowTick() {
    if (!slideshowActive) return;
    if (!isOpen()) { removeButton(); return; }
    if (videoRunning()) { scheduleSlideshow(650); return; }
    goNext();
    window.setTimeout(() => {
      const video = activeVideo();
      if (video) playVideo(video);
      ensureButton();
      window.dispatchEvent(new CustomEvent("flowlens:slideshow-state", { detail: { active: slideshowActive } }));
    }, 120);
    scheduleSlideshow(slideshowDelay());
  }

  function startSlideshow() {
    if (!isOpen()) return;
    slideshowActive = true;
    const video = activeVideo();
    if (video) playVideo(video);
    scheduleSlideshow(video ? 650 : slideshowDelay());
    ensureButton();
    window.dispatchEvent(new CustomEvent("flowlens:slideshow-state", { detail: { active: true } }));
  }

  function stopSlideshow(update = true) {
    slideshowActive = false;
    clearTimeout(slideshowTimer);
    slideshowTimer = 0;
    if (update && isOpen()) ensureButton();
    window.dispatchEvent(new CustomEvent("flowlens:slideshow-state", { detail: { active: false } }));
  }

  function toggleSlideshow() { slideshowActive ? stopSlideshow() : startSlideshow(); }

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
    hint.dataset.timer = String(window.setTimeout(() => { hint.dataset.show = "false"; }, 900));
  }

  function clearMediaStyle(el) {
    if (!el) return;
    ["width", "height", "max-width", "max-height", "margin", "margin-left", "margin-top", "margin-right", "margin-bottom"].forEach((p) => el.style.removeProperty(p));
  }

  function resetZoom(notify = false) {
    const box = lightbox();
    clearMediaStyle(mediaEl());
    if (box) {
      delete box.dataset.flShortcutZoom;
      delete box.dataset.flZoomFactor;
      delete box.dataset.flDragging;
      box.scrollTo?.({ left: 0, top: 0, behavior: "auto" });
    }
    zoomFactor = 1;
    zoomMediaKey = "";
    if (notify) showZoomHint("已恢复适应屏幕");
  }

  function baseSize(el) {
    const rect = el.getBoundingClientRect?.();
    return {
      width: Math.max(1, Math.round(rect?.width || el.clientWidth || el.naturalWidth || el.videoWidth || 1)),
      height: Math.max(1, Math.round(rect?.height || el.clientHeight || el.naturalHeight || el.videoHeight || 1))
    };
  }

  function applyZoom(factor, notify = true) {
    const box = lightbox();
    const el = mediaEl();
    if (!box || box.dataset.active !== "true" || !el) return;
    const next = Number(factor) > 1 ? Number(factor) : 1;
    if (next === 1) { resetZoom(true); return; }
    if (el.tagName === "IMG" && !el.complete) {
      el.addEventListener("load", () => applyZoom(next, notify), { once: true });
      return;
    }
    const key = mediaKey(el);
    if (zoomMediaKey && zoomMediaKey !== key) resetZoom(false);
    zoomMediaKey = key;
    const size = baseSize(el);
    const width = Math.round(size.width * next);
    const height = Math.round(size.height * next);
    const marginX = Math.max(40, Math.round((box.clientWidth - width) / 2));
    const marginY = Math.max(40, Math.round((box.clientHeight - height) / 2));
    el.style.setProperty("width", `${width}px`, "important");
    el.style.setProperty("height", `${height}px`, "important");
    el.style.setProperty("max-width", "none", "important");
    el.style.setProperty("max-height", "none", "important");
    el.style.setProperty("margin", `${marginY}px ${marginX}px`, "important");
    box.dataset.flShortcutZoom = "true";
    box.dataset.flZoomFactor = String(next);
    zoomFactor = next;
    const center = () => {
      if (!box.isConnected || box.dataset.active !== "true" || box.dataset.flDragging === "true") return;
      box.scrollTo?.({
        left: Math.max(0, Math.round(marginX + width / 2 - box.clientWidth / 2)),
        top: Math.max(0, Math.round(marginY + height / 2 - box.clientHeight / 2)),
        behavior: "auto"
      });
    };
    requestAnimationFrame(center);
    window.setTimeout(center, 120);
    if (notify) showZoomHint(`已放大 ${next}×`);
  }

  function claim(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function onSlideshowPointerDown(event) {
    if (!event.target?.closest?.(".xiv-lightbox-slideshow")) return;
    if (!isOpen()) return;
    slideshowPointerHandledAt = Date.now();
    claim(event);
    toggleSlideshow();
  }

  function onClick(event) {
    if (event.target?.closest?.(".xiv-lightbox-slideshow")) {
      claim(event);
      if (Date.now() - slideshowPointerHandledAt > 500) toggleSlideshow();
      return;
    }
    if (event.target?.closest?.(".xiv-lightbox-close")) window.setTimeout(removeButton, 40);
    if (event.target?.closest?.(".xiv-lightbox-arrow")) window.setTimeout(() => resetZoom(false), 40);
  }

  function onKeydown(event) {
    if (!isOpen()) return;
    const target = event.target;
    if (target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']")) return;
    if (event.key === "Escape") { window.setTimeout(removeButton, 40); return; }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") window.setTimeout(() => resetZoom(false), 40);
    if (!(event.key in ZOOM_MAP) || event.ctrlKey || event.metaKey || event.altKey) return;
    claim(event);
    applyZoom(ZOOM_MAP[event.key]);
  }

  function onPointerDown(event) {
    const box = lightbox();
    if (!box || box.dataset.active !== "true" || box.dataset.flShortcutZoom !== "true") return;
    if (!event.target?.closest?.("#xiv-lightbox img, #xiv-lightbox video, #xiv-lightbox iframe")) return;
    if (event.target?.closest?.(".xiv-lightbox-fav, .xiv-lightbox-close, .xiv-lightbox-arrow, .xiv-lightbox-slideshow")) return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop };
    box.dataset.flDragging = "true";
    event.target?.setPointerCapture?.(event.pointerId);
    claim(event);
  }

  function onPointerMove(event) {
    const box = lightbox();
    if (!box || !drag || drag.pointerId !== event.pointerId) return;
    box.scrollLeft = drag.left - (event.clientX - drag.x);
    box.scrollTop = drag.top - (event.clientY - drag.y);
    claim(event);
  }

  function onPointerUp(event) {
    const box = lightbox();
    if (!drag || (event && drag.pointerId !== event.pointerId)) return;
    drag = null;
    if (box) delete box.dataset.flDragging;
  }

  function watchLightbox() {
    const box = lightbox();
    if (!box || box === lightboxObserverTarget) return;
    lightboxObserver?.disconnect?.();
    lightboxObserverTarget = box;
    lightboxObserver = new MutationObserver(() => scheduleRefresh(50));
    lightboxObserver.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active"] });
  }

  function refresh() {
    installStyle();
    watchLightbox();
    if (!isOpen()) { removeButton(); resetZoom(false); return; }
    const key = mediaKey();
    if (zoomMediaKey && key && zoomMediaKey !== key) resetZoom(false);
    ensureButton();
  }

  function scheduleRefresh(delay = 80) {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refresh, delay);
  }

  window.addEventListener("message", (event) => {
    const msg = event.data || {};
    if (msg.type === "XIV_VIDEO_TIME" && msg.eventName === "ended" && slideshowActive) scheduleSlideshow(250);
  });
  document.addEventListener("pointerdown", onSlideshowPointerDown, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeydown, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);
  document.addEventListener("ended", (event) => {
    if (slideshowActive && event.target?.matches?.("#xiv-lightbox video")) scheduleSlideshow(250);
  }, true);

  observer = new MutationObserver(() => scheduleRefresh(80));
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active"] });
  scheduleRefresh(0);
})();