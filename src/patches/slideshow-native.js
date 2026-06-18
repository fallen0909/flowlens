(() => {
  if (window.__flowLensSlideshowNativePatch) return;
  window.__flowLensSlideshowNativePatch = true;

  const VERSION = "1.4.16";
  const SPEED_KEY = "flowlens-lightbox-slideshow-delay-v1";
  const SPEED_OPTIONS = [1200, 1800, 2800, 4000, 6000];
  let delay = Number(localStorage.getItem(SPEED_KEY) || 2800);
  if (!SPEED_OPTIONS.includes(delay)) delay = 2800;
  let timer = 0;
  let active = false;
  let bootTimer = 0;

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { return root()?.querySelector("#xiv-lightbox"); }
  function isOpen() { return lightbox()?.dataset.active === "true"; }

  function nativeNext() {
    if (!isOpen()) {
      stop(false);
      return;
    }
    const box = lightbox();
    const arrow = box?.querySelector('.xiv-lightbox-arrow[data-side="right"]');
    if (arrow) {
      arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
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
    setTimeout(nativeNext, 180);
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
    app.dataset.flLightbox = isOpen() ? "true" : "false";
    if (!isOpen()) {
      stop(false);
      return;
    }
    btn.dataset.active = active ? "true" : "false";
    btn.innerHTML = icon();
    btn.title = active ? "暂停幻灯片自动切换" : "开始幻灯片自动切换";
  }
  function rebindButton() {
    const old = button();
    if (!old || old.dataset.flNativeBound === "1.4.16") return;
    const fresh = old.cloneNode(false);
    fresh.className = old.className;
    fresh.type = "button";
    fresh.dataset.flNativeBound = "1.4.16";
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
    if (ms <= 1200) return "很快 1.2秒";
    if (ms <= 1800) return "较快 1.8秒";
    if (ms <= 2800) return "正常 2.8秒";
    if (ms <= 4000) return "较慢 4秒";
    return "很慢 6秒";
  }
  function syncSettings() {
    const panel = root()?.querySelector('[data-panel="settings"]');
    if (!panel) return;
    const version = panel.querySelector(".fl-version-row strong");
    if (version) version.textContent = `v${VERSION}`;
    const select = panel.querySelector(".fl-slideshow-speed");
    if (select && select.dataset.flNativeBound !== "1.4.16") {
      select.dataset.flNativeBound = "1.4.16";
      select.addEventListener("change", () => {
        const value = Number(select.value || 2800);
        delay = SPEED_OPTIONS.includes(value) ? value : 2800;
        localStorage.setItem(SPEED_KEY, String(delay));
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
  setInterval(tick, 1200);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
