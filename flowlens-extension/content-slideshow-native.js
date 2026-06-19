(() => {
  if (window.__flowLensSlideshowNativePatch) return;
  window.__flowLensSlideshowNativePatch = true;

  const VERSION = "1.4.34";
  const SPEED_KEY = "flowlens-lightbox-slideshow-delay-v1";
  const SETTINGS_KEY = "flowlens-settings-v2";
  const SPEED_OPTIONS = [800, 1200, 1800, 2400, 3200];
  const DEFAULT_DELAY = 1200;
  function readSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; }
  }
  function writeSettings(patch) {
    const next = { ...readSettings(), ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
    try { chrome?.storage?.local?.set?.({ [SETTINGS_KEY]: next }); } catch {}
    try { window.__flowLensSyncGlobalSettings?.(); } catch {}
    return next;
  }
  function readDelay() {
    const settings = readSettings();
    const stored = Number(settings.lightboxAutoDelay || 0);
    if (SPEED_OPTIONS.includes(stored)) return stored;
    try {
      const legacy = Number(localStorage.getItem(SPEED_KEY) || 0);
      if (SPEED_OPTIONS.includes(legacy)) return legacy;
    } catch {}
    return DEFAULT_DELAY;
  }
  function writeDelay(value) {
    writeSettings({ lightboxAutoDelay: value });
    try { localStorage.setItem(SPEED_KEY, String(value)); } catch {}
  }
  let delay = readDelay();
  if (!SPEED_OPTIONS.includes(delay)) delay = DEFAULT_DELAY;
  let timer = 0;
  let active = false;
  let bootTimer = 0;

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { return root()?.querySelector("#xiv-lightbox"); }
  function isOpen() { return lightbox()?.dataset.active === "true"; }
  function coreApi() { return window.__flowLensControl || null; }
  function currentVideoElement() { return lightbox()?.querySelector("video") || null; }
  function currentVideoFrame() { return lightbox()?.querySelector(".xiv-video-frame[data-media-url], iframe[data-media-url]") || null; }
  function zoomPaused() { return lightbox()?.dataset.zoom === "actual"; }
  function videoStillPlaying() {
    const video = currentVideoElement();
    if (video) {
      const duration = Number(video.duration || 0);
      if (!video.ended && (!Number.isFinite(duration) || duration <= 0 || video.currentTime < duration - 0.35)) {
        video.play?.().catch?.(() => {});
        if (video.dataset.flSlideEndedBound !== VERSION) {
          video.dataset.flSlideEndedBound = VERSION;
          video.addEventListener("ended", () => {
            if (active && isOpen()) setTimeout(nativeNext, 120);
          });
        }
        return true;
      }
      return false;
    }
    const frame = currentVideoFrame();
    if (frame && lightbox()?.dataset.flVideoEnded !== "true") return true;
    return false;
  }

  function nativeNext() {
    if (!isOpen()) {
      stop(false);
      return;
    }
    if (zoomPaused()) {
      syncButton();
      return;
    }
    if (videoStillPlaying()) {
      syncButton();
      return;
    }
    if (coreApi()?.showAdjacent?.(1)) return;
    const box = lightbox();
    const arrow = box?.querySelector('.xiv-lightbox-arrow[data-side="right"]');
    if (arrow) {
      arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return;
    }
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
  }

  function restart() {
    clearInterval(timer);
    timer = setInterval(nativeNext, delay);
    syncButton();
  }
  function start() {
    if (active) return;
    active = true;
    restart();
  }
  function stop(update = true) {
    active = false;
    clearInterval(timer);
    timer = 0;
    if (update) syncButton();
  }
  function toggle() { active ? stop() : start(); }
  function icon() {
    return active
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.8" height="14" rx="1.2"/><rect x="13.2" y="5" width="3.8" height="14" rx="1.2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.4 0-1.8L9.6 4.9C8.9 4.5 8 5 8 5.8Z"/></svg>';
  }
  function button() { return root()?.querySelector(".xiv-lightbox-slideshow"); }
  function syncButton() {
    const app = root();
    const btn = button();
    if (!app || !btn) return;
    const open = coreApi()?.isLightboxOpen?.() ?? isOpen();
    app.dataset.flLightbox = open ? "true" : "false";
    if (!open) {
      stop(false);
      return;
    }
    const title = active
      ? zoomPaused()
        ? "1:1 查看中，自动切换已暂停"
        : videoStillPlaying()
          ? "等待当前视频播放完"
          : "暂停大图自动切换"
      : "开始大图自动切换";
    const nextIcon = icon();
    btn.dataset.active = active ? "true" : "false";
    if (btn.dataset.flIconState !== String(active)) {
      btn.innerHTML = nextIcon;
      btn.dataset.flIconState = String(active);
    }
    btn.title = title;
    btn.setAttribute("aria-label", title);
  }
  function rebindButton() {
    const old = button();
    if (!old || old.dataset.flNativeBound === VERSION) return;
    const fresh = old.cloneNode(false);
    fresh.className = old.className;
    fresh.type = "button";
    fresh.dataset.flNativeBound = VERSION;
    fresh.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }, true);
    fresh.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      toggle();
    }, true);
    old.replaceWith(fresh);
    syncButton();
  }
  function speedText(ms) {
    if (ms <= 800) return "极速 0.8秒";
    if (ms <= 1200) return "默认 1.2秒";
    if (ms <= 1800) return "较快 1.8秒";
    if (ms <= 2400) return "普通 2.4秒";
    return "慢速 3.2秒";
  }
  function syncSettings() {
    const panel = root()?.querySelector('[data-panel="settings"]');
    if (!panel) return;
    const version = panel.querySelector(".fl-version-row strong");
    if (version) version.textContent = `v${VERSION}`;
    const select = panel.querySelector(".fl-slideshow-speed");
    if (select && select.dataset.flNativeBound !== VERSION) {
      select.dataset.flNativeBound = VERSION;
      select.addEventListener("change", () => {
        const value = Number(select.value || DEFAULT_DELAY);
        delay = SPEED_OPTIONS.includes(value) ? value : DEFAULT_DELAY;
        writeDelay(delay);
        if (active) restart();
      });
    }
    if (select) {
      select.value = String(delay);
      const option = [...select.options].find((item) => Number(item.value) === delay);
      if (option) option.textContent = speedText(delay);
    }
  }
  function tick() {
    rebindButton();
    syncButton();
    syncSettings();
  }
  function boot() {
    tick();
    clearTimeout(bootTimer);
    if (!root()) bootTimer = setTimeout(boot, 500);
  }
  document.addEventListener("click", () => setTimeout(tick, 120), true);
  document.addEventListener("keydown", () => setTimeout(tick, 120), true);
  document.addEventListener("fullscreenchange", tick, true);
  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "XIV_VIDEO_TIME" && message.eventName === "ended" && active && isOpen()) {
      lightbox().dataset.flVideoEnded = "true";
      setTimeout(nativeNext, 120);
    }
  });
  setInterval(tick, 1200);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
