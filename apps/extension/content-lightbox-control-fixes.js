(() => {
  if (window.__flowLensLightboxControlFixes) return;
  window.__flowLensLightboxControlFixes = true;
  window.__flowLensSlideshowNativePatch = true;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const SPEED_OPTIONS = [800, 1200, 1800, 2400, 3200];
  const DEFAULT_DELAY = 1200;

  let playing = false;
  let timer = 0;
  let pointerDownAt = 0;

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { return document.getElementById("xiv-lightbox"); }
  function isOpen() { return lightbox()?.dataset.active === "true"; }
  function coreApi() { return window.__flowLensControl || null; }

  function claim(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }

  function readDelay() {
    try {
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {};
      const value = Number(settings.lightboxAutoDelay || 0);
      return SPEED_OPTIONS.includes(value) ? value : DEFAULT_DELAY;
    } catch {
      return DEFAULT_DELAY;
    }
  }

  function injectStyle() {
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
        z-index: 2147483647 !important;
      }
      #xiv-lightbox .xiv-lightbox-arrow {
        position: fixed !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        transition: none !important;
        will-change: auto !important;
        z-index: 2147483647 !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow {
        right: 118px !important;
        width: 42px !important;
        height: 42px !important;
        border-radius: 999px !important;
        border: 1px solid rgba(255,255,255,.26) !important;
        background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.22), rgba(18,18,20,.72)) !important;
        color: #fff !important;
        display: grid !important;
        place-items: center !important;
        padding: 0 !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        box-shadow: 0 12px 30px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.18) !important;
        backdrop-filter: blur(12px) !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow[data-active="true"] {
        color: #111 !important;
        background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.95), rgba(255,255,255,.76)) !important;
        border-color: rgba(255,255,255,.7) !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow svg {
        width: 22px !important;
        height: 22px !important;
        display: block !important;
        pointer-events: none !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function playIcon(active = playing) {
    return active
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="3.8" height="14" rx="1.2"></rect><rect x="13.2" y="5" width="3.8" height="14" rx="1.2"></rect></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.4 0-1.8L9.6 4.9C8.9 4.5 8 5 8 5.8Z"></path></svg>';
  }

  function ensureButton() {
    const lb = lightbox();
    if (!lb || lb.dataset.active !== "true") return null;
    let button = lb.querySelector(".xiv-lightbox-slideshow");
    if (!button) {
      button = document.createElement("button");
      button.className = "xiv-lightbox-slideshow";
      button.type = "button";
      const fav = lb.querySelector(".xiv-lightbox-fav");
      if (fav) fav.before(button);
      else lb.appendChild(button);
    }
    drawButton(button);
    return button;
  }

  function drawButton(button = lightbox()?.querySelector(".xiv-lightbox-slideshow")) {
    if (!button) return;
    const title = playing ? "Pause slideshow" : "Start slideshow";
    const activeValue = playing ? "true" : "false";
    if (button.dataset.active !== activeValue) button.dataset.active = activeValue;
    if (button.title !== title) button.title = title;
    if (button.getAttribute("aria-label") !== title) button.setAttribute("aria-label", title);
    const state = playing ? "pause" : "play";
    if (button.dataset.flIcon !== state || !button.querySelector("svg")) {
      button.dataset.flIcon = state;
      button.innerHTML = playIcon(playing);
    }
  }

  function currentVideoStillPlaying() {
    const video = lightbox()?.querySelector("video");
    if (!video) return false;
    try {
      video.playsInline = true;
      if (video.paused && !video.ended) video.play?.()?.catch?.(() => {});
    } catch {}
    const duration = Number(video.duration || 0);
    if (video.ended) return false;
    return !(Number.isFinite(duration) && duration > 0 && Number(video.currentTime || 0) >= duration - 0.35);
  }

  function nextItem() {
    if (!isOpen()) {
      stop();
      return;
    }
    if (lightbox()?.dataset.zoom === "actual") {
      schedule();
      return;
    }
    if (currentVideoStillPlaying()) {
      schedule(650);
      return;
    }
    if (!coreApi()?.showAdjacent?.(1)) {
      lightbox()?.querySelector?.('.xiv-lightbox-arrow[data-side="right"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }
    schedule();
  }

  function schedule(delay = readDelay()) {
    clearTimeout(timer);
    if (!playing) return;
    timer = window.setTimeout(nextItem, Math.max(350, Number(delay) || DEFAULT_DELAY));
    drawButton();
  }

  function start() {
    if (!isOpen()) return;
    playing = true;
    schedule(currentVideoStillPlaying() ? 650 : readDelay());
    drawButton();
  }

  function stop() {
    playing = false;
    clearTimeout(timer);
    timer = 0;
    drawButton();
  }

  function toggle() {
    playing ? stop() : start();
  }

  function slideshowButton(target) {
    return target?.closest?.(".xiv-lightbox-slideshow") || null;
  }

  function onSlideshowEvent(event) {
    if (!isOpen() || !slideshowButton(event.target)) return;
    claim(event);
    if (event.type === "pointerdown") {
      pointerDownAt = Date.now();
      return;
    }
    if (event.type === "click") toggle();
  }

  function mediaElement() {
    return lightbox()?.querySelector("img, video") || null;
  }

  function numberFromCss(value) {
    const n = Number.parseFloat(String(value || ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function handleLightboxZoomWheel(event) {
    const lb = lightbox();
    if (!lb || lb.dataset.active !== "true" || lb.dataset.zoom !== "actual") return false;
    const media = mediaElement();
    if (!media) return false;
    const delta = Math.abs(event.deltaY || 0) >= Math.abs(event.deltaX || 0) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 2) return true;

    const beforeScrollWidth = Math.max(1, lb.scrollWidth);
    const beforeScrollHeight = Math.max(1, lb.scrollHeight);
    const keepX = (lb.scrollLeft + lb.clientWidth / 2) / beforeScrollWidth;
    const keepY = (lb.scrollTop + lb.clientHeight / 2) / beforeScrollHeight;
    const rect = media.getBoundingClientRect?.();
    const currentWidth = numberFromCss(media.style.getPropertyValue("--xiv-actual-width")) || Math.max(1, Math.round(rect?.width || media.clientWidth || 1));
    const currentHeight = numberFromCss(media.style.getPropertyValue("--xiv-actual-height")) || Math.max(1, Math.round(rect?.height || media.clientHeight || 1));
    if (!numberFromCss(media.dataset.flWheelZoomBaseWidth)) media.dataset.flWheelZoomBaseWidth = String(currentWidth);
    if (!numberFromCss(media.dataset.flWheelZoomBaseHeight)) media.dataset.flWheelZoomBaseHeight = String(currentHeight);
    const baseWidth = numberFromCss(media.dataset.flWheelZoomBaseWidth) || currentWidth;
    const baseHeight = numberFromCss(media.dataset.flWheelZoomBaseHeight) || currentHeight;
    const ratio = baseHeight / Math.max(1, baseWidth);
    const multiplier = delta < 0 ? 1.12 : 1 / 1.12;
    const nextWidth = Math.round(Math.max(Math.max(80, baseWidth * 0.35), Math.min(currentWidth * multiplier, Math.max(baseWidth * 6, lb.clientWidth * 6))));
    const nextHeight = Math.round(Math.max(1, nextWidth * ratio));
    media.style.setProperty("--xiv-actual-width", `${nextWidth}px`);
    media.style.setProperty("--xiv-actual-height", `${nextHeight}px`);
    lb.dataset.flZoomFactor = String(Math.round((nextWidth / baseWidth) * 100) / 100);

    const recenter = () => {
      if (!lb.isConnected || lb.dataset.active !== "true" || lb.dataset.zoom !== "actual") return;
      lb.scrollTo?.({
        left: Math.max(0, Math.round(lb.scrollWidth * keepX - lb.clientWidth / 2)),
        top: Math.max(0, Math.round(lb.scrollHeight * keepY - lb.clientHeight / 2)),
        behavior: "auto"
      });
    };
    requestAnimationFrame(recenter);
    window.setTimeout(recenter, 40);
    return true;
  }

  function isTypingTarget(target) {
    return !!target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  }

  function handleGalleryQueueKeydown(event) {
    const app = root();
    if (!app || app.dataset.active !== "true" || isOpen()) return false;
    if (isTypingTarget(event.target) || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return false;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;
    const selector = event.key === "ArrowRight" ? '[data-xiv="next-set"]' : '[data-xiv="prev-set"]';
    const button = app.querySelector(selector);
    if (!button || (button.disabled && button.dataset.enabled !== "true")) return false;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }

  function refresh() {
    injectStyle();
    if (!isOpen()) stop();
    ensureButton();
    drawButton();
  }

  window.__flowLensHandleLightboxZoomWheel = handleLightboxZoomWheel;
  window.__flowLensHandleGalleryQueueKeydown = handleGalleryQueueKeydown;

  window.addEventListener("pointerdown", onSlideshowEvent, true);
  window.addEventListener("click", onSlideshowEvent, true);
  document.addEventListener("pointerdown", onSlideshowEvent, true);
  document.addEventListener("click", onSlideshowEvent, true);
  window.addEventListener("wheel", (event) => {
    if (handleLightboxZoomWheel(event)) claim(event);
  }, { capture: true, passive: false });
  window.addEventListener("keydown", (event) => {
    if (handleGalleryQueueKeydown(event)) claim(event);
  }, true);
  window.addEventListener("fullscreenchange", refresh, true);
  new MutationObserver(refresh).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "data-zoom", "src"] });
  refresh();
})();
