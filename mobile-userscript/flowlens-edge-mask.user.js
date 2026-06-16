// ==UserScript==
// @name         瀑光 FlowLens 手机直链图片兼容
// @namespace    local.flowlens.edge.mask
// @version      1.2.23
// @description  清理旧顶部遮罩，并让直接打开的图片链接可以被瀑光识别。
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  function cleanup() {
    document.getElementById("xiv-fl-edge-mask-style")?.remove();
    document.getElementById("xiv-fl-edge-mask")?.remove();
  }

  function isPictureUrl(url) {
    try {
      const path = new URL(url, location.href).pathname.toLowerCase();
      return path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".png") || path.endsWith(".webp") || path.endsWith(".gif") || path.endsWith(".avif");
    } catch {
      return false;
    }
  }

  function addPictureHint(url) {
    if (!isPictureUrl(url) || !document.body || document.getElementById("xiv-direct-picture-hint")) return;
    const box = document.createElement("div");
    box.id = "xiv-direct-picture-hint";
    box.style.cssText = "position:absolute;left:-9999px;top:0;width:260px;height:260px;overflow:hidden;pointer-events:none;";
    const img = document.createElement("img");
    img.src = new URL(url, location.href).href;
    img.setAttribute("data-original", img.src);
    img.setAttribute("data-src", img.src);
    img.referrerPolicy = "no-referrer-when-downgrade";
    img.style.cssText = "display:block;width:240px;height:240px;object-fit:contain;";
    box.appendChild(img);
    document.body.appendChild(box);
  }

  function run() {
    cleanup();
    addPictureHint(location.href);
    document.querySelectorAll("img").forEach((img) => {
      const value = img.getAttribute("data-original") || img.getAttribute("data-src") || img.currentSrc || img.src;
      if (!value || !isPictureUrl(value)) return;
      img.setAttribute("data-original", value);
      img.setAttribute("data-src", value);
      if (!img.getAttribute("src")) img.setAttribute("src", value);
    });
  }

  run();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  setTimeout(run, 800);
})();
