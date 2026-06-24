(() => {
  if (window.__flowLensSlideshowBridgePatch) return;
  window.__flowLensSlideshowBridgePatch = true;
  window.__flowLensSlideshowNativePatch = true;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const LEGACY_SPEED_KEY = "flowlens-lightbox-slideshow-delay-v1";
  const SPEED_OPTIONS = [800, 1200, 1800, 2400, 3200];
  const DEFAULT_DELAY = 1200;

  let active = false;
  let timer = 0;
  let observer = null;
  let lightboxObserver = null;
  let lightboxObserverTarget = null;

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { return root()?.querySelector("#xiv-lightbox"); }
  function button() { return root()?.querySelector(".xiv-lightbox-slideshow"); }
  function coreApi() { return window.__flowLensControl || null; }
  function isOpen() { return lightbox()?.dataset.active === "true"; }

  function readSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; }
  }

  function delay() {
    const fromSettings = Number(readSettings().lightboxAutoDelay || 0);
    if (SPEED_OPTIONS.includes(fromSettings)) return fromSettings;
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

  function icon() {
    return active
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="3.8" height="14" rx="1.2"/><rect x="13.2" y="5" width="3.8" height="14" rx="1.2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.4 0-1.8L9.6 4.9C8.9 4.5 8 5 8 5.8Z"/></svg>';
  }

  function updateButton() {
    const app = root();
    const btn = button();
    if (app) app.dataset.flLightbox = isOpen() ? "true" : "false";
    if (!btn) return;
    btn.dataset.flBridge = "true";
    btn.dataset.active = active ? "true" : "false";
    btn.title = active ? "暂停大图自动切换" : `开始大图自动切换（${speedLabel(delay())}）`;
    btn.setAttribute("aria-label", btn.title);
    btn.innerHTML = icon();
  }

  function clearTimer() {
    clearTimeout(timer);
    timer = 0;
  }

  function currentVideo() {
    return lightbox()?.querySelector("video") || null;
  }

  function ensureVideoPlaying() {
    const video = currentVideo();
    if (!video) return false;
    if (video.paused && !video.ended) {
      try { video.play()?.catch?.(() => {}); } catch {}
    }
    return true;
  }

  function videoStillRunning() {
    const box = lightbox();
    if (!box) return false;
    const video = currentVideo();
    if (video) {
      ensureVideoPlaying();
      const duration = Number(video.duration || 0);
      if (video.ended) return false;
      if (Number.isFinite(duration) && duration > 0 && Number(video.currentTime || 0) >= duration - 0.35) return false;
      return true;
    }
    const frame = box.querySelector("iframe[data-media-url]");
    if (frame && box.dataset.flVideoEnded !== "true") return true;
    return false;
  }

  function fallbackNext() {
    const box = lightbox();
    const arrow = box?.querySelector?.('.xiv-lightbox-arrow[data-side="right"]');
    if (arrow) {
      arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    }
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
    return true;
  }

  function scheduleNext(wait = delay()) {
    clearTimer();
    if (!active) return;
    timer = window.setTimeout(tick, Math.max(250, Number(wait) || DEFAULT_DELAY));
    updateButton();
  }

  function tick() {
    if (!active) return;
    if (!isOpen()) {
      stop(false);
      return;
    }
    if (videoStillRunning()) {
      scheduleNext(650);
      return;
    }
    const moved = coreApi()?.showAdjacent?.(1);
    if (!moved) fallbackNext();
    window.setTimeout(() => {
      ensureVideoPlaying();
      updateButton();
    }, 120);
    scheduleNext(delay());
  }

  function start() {
    if (active || !isOpen()) return;
    active = true;
    ensureVideoPlaying();
    scheduleNext(videoStillRunning() ? 650 : delay());
    updateButton();
  }

  function stop(update = true) {
    active = false;
    clearTimer();
    if (update) updateButton();
  }

  function toggle() {
    if (active) stop();
    else start();
  }

  function intercept(event) {
    if (!event.target?.closest?.(".xiv-lightbox-slideshow")) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (event.type === "click") toggle();
  }

  function watchLightbox() {
    const box = lightbox();
    if (!box || box === lightboxObserverTarget) return;
    lightboxObserver?.disconnect?.();
    lightboxObserverTarget = box;
    lightboxObserver = new MutationObserver(() => {
      if (!isOpen()) stop(false);
      else if (active) ensureVideoPlaying();
      updateButton();
    });
    lightboxObserver.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "data-fl-video-ended"] });
  }

  function refresh() {
    if (!isOpen()) stop(false);
    watchLightbox();
    updateButton();
  }

  document.addEventListener("pointerdown", intercept, true);
  document.addEventListener("click", intercept, true);
  document.addEventListener("ended", (event) => {
    if (active && event.target?.matches?.("#xiv-lightbox video")) scheduleNext(250);
  }, true);
  document.addEventListener("change", (event) => {
    if (event.target?.matches?.(".fl-slideshow-speed")) scheduleNext(active ? delay() : 0);
  }, true);
  document.addEventListener("keydown", () => window.setTimeout(refresh, 120), true);
  document.addEventListener("fullscreenchange", refresh, true);

  observer = new MutationObserver(refresh);
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "data-fl-lightbox"] });
  window.setTimeout(refresh, 0);
  window.setTimeout(refresh, 500);
})();