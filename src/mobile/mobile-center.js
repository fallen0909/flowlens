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

  let centerFrame = 0;
  let forceCenter = false;

  const css = `
    #xiv-lightbox[data-active="true"] {
      overflow-anchor: none !important;
    }
    #xiv-lightbox[data-active="true"] > img {
      transform: none !important;
      will-change: auto !important;
      backface-visibility: visible !important;
      -webkit-backface-visibility: visible !important;
    }
    #xiv-lightbox[data-zoom="actual"] {
      scroll-behavior: auto !important;
      overscroll-behavior: contain !important;
    }
    #xiv-lightbox[data-zoom="actual"] > img {
      width: var(--xiv-actual-width, auto) !important;
      height: var(--xiv-actual-height, auto) !important;
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
    return img?.dataset?.sourceUrl || img?.src || img?.currentSrc || "";
  }

  function isActualMode() {
    const lb = lightbox();
    return !!lb && lb.dataset.zoom === "actual";
  }

  function centerNow(force = false) {
    const lb = lightbox();
    const img = currentImage();
    if (!lb || !img || lb.dataset.zoom !== "actual") return;
    if (lb.dataset.dragging === "true" || lb.dataset.flDragging === "true") return;
    const openToken = lb.dataset.openToken;
    const source = imageKey(img);
    const isCurrent = () => lightbox() === lb && currentImage() === img
      && lb.dataset.openToken === openToken && imageKey(img) === source && isActualMode();

    if (!img.complete || !img.naturalWidth || !img.naturalHeight) {
      img.addEventListener("load", () => {
        if (isCurrent()) scheduleCenter(true);
      }, { once: true });
    }

    const centerToken = () => [source, openToken, lb.clientWidth, lb.clientHeight, img.naturalWidth, img.naturalHeight,
      img.style.getPropertyValue("--xiv-actual-width"), img.style.getPropertyValue("--xiv-actual-height")].join("|");
    const token = centerToken();
    if (!force && lb.dataset.flActualCentered === token) return;
    lb.dataset.flActualCentered = token;

    // The core owns zoom dimensions, including its 1.5x fallback and wheel zoom.
    // Recomputing natural size / DPR here can shrink a just-enlarged image.
    const run = () => {
      if (!isCurrent() || centerToken() !== token || lb.dataset.dragging === "true" || lb.dataset.flDragging === "true") return;
      const left = Math.max(0, Math.round((lb.scrollWidth - lb.clientWidth) / 2));
      const top = Math.max(0, Math.round((lb.scrollHeight - lb.clientHeight) / 2));
      if (Math.abs(lb.scrollLeft - left) >= 1 || Math.abs(lb.scrollTop - top) >= 1) lb.scrollTo({ left, top, behavior: "auto" });
    };

    run();
  }

  function scheduleCenter(force = false) {
    forceCenter = forceCenter || force;
    if (centerFrame) return;
    centerFrame = requestAnimationFrame(() => {
      centerFrame = 0;
      const force = forceCenter;
      forceCenter = false;
      centerNow(force);
    });
  }

  injectStyle();

  window.addEventListener("resize", () => scheduleCenter(true), { passive: true });
  window.addEventListener("orientationchange", () => scheduleCenter(true), { passive: true });

  new MutationObserver((mutations) => {
    let shouldCenter = false;
    for (const mutation of mutations) {
      if (mutation.target?.id === "xiv-lightbox") shouldCenter = true;
      if (mutation.target?.tagName === "IMG" && mutation.target.closest?.("#xiv-lightbox")) shouldCenter = true;
      if ([...mutation.addedNodes].some((node) => node?.nodeType === 1 && (node.matches?.("#xiv-lightbox img") || node.querySelector?.("#xiv-lightbox img")))) shouldCenter = true;
    }
    if (!isActualMode()) {
      cancelAnimationFrame(centerFrame);
      centerFrame = 0;
      forceCenter = false;
      const lb = document.getElementById("xiv-lightbox");
      if (lb) delete lb.dataset.flActualCentered;
      return;
    }
    if (shouldCenter) centerNow();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-zoom", "data-active", "data-open-token", "src", "class"]
  });
})();
