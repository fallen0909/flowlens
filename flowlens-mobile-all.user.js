// ==UserScript==
// @name         瀑光 FlowLens 手机整合版
// @namespace    local.flowlens.mobile.all
// @version      1.4.12
// @description  手机 Edge / Tampermonkey 整合版：修复大图幻灯片按钮点击，设置里新增大图切换速度。
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
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/global-settings.js?v=1.4.12
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/flowlens-core.js?v=1.4.12
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/optimizer.js?v=1.4.12
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/fixes.js?v=1.4.12
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/product.js?v=1.4.12
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/ui-cleanup.js?v=1.4.12
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/lightbox-stable.js?v=1.4.12
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/settings-compact.js?v=1.4.12
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/zhihu.js?v=1.4.12
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/topfix.js?v=1.4.12
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/media-sync.js?v=1.4.12
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/mobile/mobile-center.js?v=1.4.12
// ==/UserScript==

/* FlowLens mobile integrated loader v1.4.12. Official mobile entry. Shared source lives under src/. */
