// ==UserScript==
// @name         瀑光 FlowLens 手机整合版
// @namespace    local.flowlens.mobile.all
// @version      1.4.7
// @description  手机 Edge / Tampermonkey 真整合版：同步电脑端 v1.4.7 功能，支持媒体切换按钮和大图视频自动播放。
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
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-global-settings.user.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens.user.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-optimizer.user.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-fixes.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-product.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-ui-cleanup.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-lightbox-stable.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-settings-compact-v2.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-zhihu.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-mobile-center.user.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-media-sync.js?v=1.4.7
// ==/UserScript==

/* Legacy v1.4.6 installer bridge. It now points users to the stable v1.4.7 mobile update channel. */
