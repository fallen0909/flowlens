// ==UserScript==
// @name         瀑光 FlowLens 电脑油猴版
// @namespace    local.flowlens.desktop
// @version      1.7.4
// @description  正式安装版：沉浸式网页图片与视频瀑布流，修复幻灯片自动播放并聚焦正文主图。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-desktop.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-desktop.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/version.js?v=1.7.4
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/global-settings.js?v=1.7.4
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/content-focus.js?v=1.7.4
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/item-gallery.js?v=1.7.4
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/flowlens-core.js?v=1.7.4
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/optimizer.js?v=1.7.4
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/product.js?v=1.7.4
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/fixes.js?v=1.7.4
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/ui-cleanup.js?v=1.7.4
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/lightbox-stable.js?v=1.7.4
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/settings-compact.js?v=1.7.4
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/zhihu.js?v=1.7.4
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/topfix.js?v=1.7.4
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/media-sync.js?v=1.7.4
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/slideshow-bridge.js?v=1.7.4
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/page-bookmarks.js?v=1.7.4
// ==/UserScript==

(() => {
  const previous = window.__FlowLensVersion && typeof window.__FlowLensVersion === "object" ? window.__FlowLensVersion : {};
  window.__FlowLensVersion = Object.freeze({
    ...previous,
    name: "瀑光 FlowLens",
    version: "1.7.4",
    channel: "stable",
    releaseDate: "2026-06-24",
    entry: "flowlens-desktop.user.js"
  });
  window.__FLOWLENS_VERSION__ = "1.7.4";
})();