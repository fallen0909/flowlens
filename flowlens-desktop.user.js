// ==UserScript==
// @name         瀑光 FlowLens 电脑油猴版
// @namespace    local.flowlens.desktop
// @version      1.4.15
// @description  电脑 Edge / Chrome / Firefox + Tampermonkey 版：新增分析日志复制功能，用于排查图片加载、筛选和大图切换问题。
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
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/global-settings.js?v=1.4.15
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/flowlens-core.js?v=1.4.15
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/optimizer.js?v=1.4.15
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/fixes.js?v=1.4.15
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/product.js?v=1.4.15
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/ui-cleanup.js?v=1.4.15
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/lightbox-stable.js?v=1.4.15
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/settings-compact.js?v=1.4.15
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/zhihu.js?v=1.4.15
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/topfix.js?v=1.4.15
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/media-sync.js?v=1.4.15
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/slideshow-native.js?v=1.4.15
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/diagnostics-log.js?v=1.4.15
// ==/UserScript==

/* FlowLens desktop userscript loader v1.4.15. */
