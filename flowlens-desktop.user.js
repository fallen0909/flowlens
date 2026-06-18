// ==UserScript==
// @name         瀑光 FlowLens 电脑油猴版
// @namespace    local.flowlens.desktop
// @version      1.4.9
// @description  电脑 Edge / Chrome / Firefox + Tampermonkey 版：显示版本号，置顶按钮改为图/视频切换，大图支持幻灯片自动切换。
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
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/global-settings.js?v=1.4.9
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/flowlens-core.js?v=1.4.9
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/optimizer.js?v=1.4.9
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/fixes.js?v=1.4.9
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/product.js?v=1.4.9
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/ui-cleanup.js?v=1.4.9
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/lightbox-stable.js?v=1.4.9
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/settings-compact.js?v=1.4.9
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/zhihu.js?v=1.4.9
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/topfix.js?v=1.4.9
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/media-sync.js?v=1.4.9
// ==/UserScript==

/* FlowLens desktop userscript loader v1.4.9. Official desktop entry. Shared source lives under src/. */
