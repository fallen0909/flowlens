// ==UserScript==
// @name         瀑光 FlowLens 手机整合版
// @namespace    local.flowlens.mobile.all
// @version      1.4.6
// @description  手机 Edge / Tampermonkey 真整合版：同步电脑端 v1.4.6 修复，含去重、稳定大图、紧凑设置、1:1 居中。
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
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-global-settings.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-optimizer.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-fixes.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-product.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-ui-cleanup.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-lightbox-stable.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-settings-compact-v2.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-zhihu.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-mobile-center.user.js
// ==/UserScript==

/* Legacy update bridge. Users installed from flowlens-mobile-v1.3.7.user.js will be upgraded to the stable v1.4.6 update channel. */
