// ==UserScript==
// @name         瀑光 FlowLens 手机整合版
// @namespace    local.flowlens.mobile.all
// @version      1.4.45
// @description  手机 Edge / Tampermonkey 整合版：修正版本显示、优化视频卡片，新增页面收藏列表。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-all.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-all.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/version.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/global-settings.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/flowlens-core.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/optimizer.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/fixes.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/product.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/ui-cleanup.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/lightbox-stable.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/settings-compact.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/zhihu.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/topfix.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/media-sync.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/slideshow-native.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/video-cover-strategy.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/video-preview-card.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/page-bookmarks.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/version-display.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/diagnostics-log.js?v=1.4.45
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/mobile/mobile-center.js?v=1.4.45
// ==/UserScript==

/* FlowLens mobile integrated loader v1.4.45. Official mobile entry. Shared source lives under src/. */
