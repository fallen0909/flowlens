// ==UserScript==
// @name         瀑光 FlowLens 手机布局与交互修复
// @namespace    local.flowlens.layout
// @version      1.2.12
// @description  修复手机端顶部细线、点图放大、视频缩略图和工具栏占位问题。
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMobileLayoutFix) return;
  window.__flowLensMobileLayoutFix = true;
})();
