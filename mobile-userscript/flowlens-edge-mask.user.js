// ==UserScript==
// @name         瀑光 FlowLens 手机顶部白线遮罩
// @namespace    local.flowlens.edge.mask
// @version      1.2.20
// @description  撤回上一版顶部遮罩，清理可能导致顶部白条变大的遮罩元素。
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  // 1.2.19 的遮罩在浅色主题下会把 1px 白线扩大成一条浅色带。
  // 这里不再创建任何新遮罩，只负责清理旧样式和旧节点。
  function cleanup() {
    document.getElementById("xiv-fl-edge-mask-style")?.remove();
    document.getElementById("xiv-fl-edge-mask")?.remove();
  }

  cleanup();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cleanup, { once: true });
  }
})();
