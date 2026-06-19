// ==UserScript==
// @name         瀑光 FlowLens 手机大图居中补丁
// @namespace    local.flowlens.mobile.center
// @version      1.3.6
// @description  手机端 1:1 原尺寸放大后，自动把图片居中显示。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMobileCenterPatch) return;
  window.__flowLensMobileCenterPatch = true;

  let centerTimer = 0;
  let settleTimer = 0;

  const css = `
    #xiv-lightbox[data-zoom="actual"] {
      scroll-behavior: auto !important;
      overscroll-behavior: contain !important;
    }
    #xiv-lightbox[data-zoom="actual"] > img {
      width: var(--xiv-mobile-actual-width, auto) !important;
      height: var(--xiv-mobile-actual-height, auto) !important;
      max-width: none !important;
      max-height: none !important;
      flex: 0 0 auto !important;
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-mobile-center-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-mobile-center-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function lightbox() {
    const node = document.getElementById("xiv-lightbox");
    return node && node.dataset.active === "true" ? node : null;
  }

  function currentImage() {
    return lightbox()?.querySelector?.("img") || null;
  }

  function imageKey(img) {
    return img?.currentSrc || img?.src || "";
  }

  function isActualMode() {
    const lb = lightbox();
    return !!lb && lb.dataset.zoom === "actual";
  }

  function centerNow(force = false) {
    const lb = lightbox();
    const img = currentImage();
    if (!lb || !img || lb.dataset.zoom !== "actual") return;
    if (lb.dataset.dragging === "true") return;

    if (!img.complete || !img.naturalWidth || !img.naturalHeight) {
      img.addEventListener("load", () => scheduleCenter(true, 40), { once: true });
      return;
    }

    const token = [imageKey(img), lb.clientWidth, lb.clientHeight, img.naturalWidth, img.naturalHeight].join("|");
    if (!force && lb.dataset.flActualCentered === token) return;
    lb.dataset.flActualCentered = token;

    const dpr = Math.max(1, Number(window.devicePixelRatio || 1));
    const cssWidth = Math.max(1, Math.round(img.naturalWidth / dpr));
    const cssHeight = Math.max(1, Math.round(img.naturalHeight / dpr));
    img.style.setProperty("--xiv-mobile-actual-width", `${cssWidth}px`);
    img.style.setProperty("--xiv-mobile-actual-height", `${cssHeight}px`);

    const run = () => {
      if (!isActualMode() || lightbox()?.dataset.dragging === "true") return;
      const current = lightbox();
      if (!current) return;
      const left = Math.max(0, Math.round((current.scrollWidth - current.clientWidth) / 2));
      const top = Math.max(0, Math.round((current.scrollHeight - current.clientHeight) / 2));
      current.scrollTo({ left, top, behavior: "auto" });
    };

    requestAnimationFrame(run);
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(run, 140);
  }

  function scheduleCenter(force = false, delay = 80) {
    clearTimeout(centerTimer);
    centerTimer = window.setTimeout(() => centerNow(force), delay);
  }

  function rememberActualBeforeClick(event) {
    const lb = lightbox();
    if (!lb || !event.target?.matches?.("#xiv-lightbox img")) return;
    lb.dataset.flWasActualBeforeClick = lb.dataset.zoom === "actual" ? "true" : "false";
  }

  function centerAfterZoomClick(event) {
    const lb = lightbox();
    if (!lb || !event.target?.matches?.("#xiv-lightbox img")) return;
    window.setTimeout(() => {
      const current = lightbox();
      if (!current) return;
      const wasActual = current.dataset.flWasActualBeforeClick === "true";
      if (!wasActual && current.dataset.zoom === "actual") scheduleCenter(true, 30);
    }, 0);
  }

  injectStyle();

  document.addEventListener("pointerdown", rememberActualBeforeClick, true);
  document.addEventListener("click", centerAfterZoomClick, true);

  window.addEventListener("resize", () => scheduleCenter(true, 120), { passive: true });
  window.addEventListener("orientationchange", () => scheduleCenter(true, 260), { passive: true });

  new MutationObserver((mutations) => {
    let shouldCenter = false;
    for (const mutation of mutations) {
      if (mutation.target?.id === "xiv-lightbox" && (mutation.attributeName === "data-zoom" || mutation.attributeName === "data-active")) shouldCenter = true;
      if (mutation.target?.tagName === "IMG" && mutation.target.closest?.("#xiv-lightbox")) shouldCenter = true;
      if ([...mutation.addedNodes].some((node) => node?.nodeType === 1 && (node.matches?.("#xiv-lightbox img") || node.querySelector?.("#xiv-lightbox img")))) shouldCenter = true;
    }
    if (shouldCenter) scheduleCenter(false, 90);
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-zoom", "data-active", "src", "class"]
  });
})();
