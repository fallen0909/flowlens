// ==UserScript==
// @name         瀑光 FlowLens 手机 Chrome Shim V7
// @namespace    local.flowlens.mobile.shim.v7
// @version      1.4.7
// @description  给桌面版核心脚本提供 Tampermonkey 运行环境兼容层。
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      *
// ==/UserScript==

(() => {
  if (window.__flowLensMobileShimV7) return;
  window.__flowLensMobileShimV7 = true;

  function request(url, options = {}) {
    return new Promise((resolve) => {
      if (typeof GM_xmlhttpRequest !== "function") {
        resolve({ ok: false, error: "GM_xmlhttpRequest unavailable" });
        return;
      }
      GM_xmlhttpRequest({
        method: options.method || "GET",
        url,
        responseType: options.responseType || "text",
        headers: options.headers || {},
        timeout: options.timeout || 45000,
        anonymous: false,
        onload: (response) => {
          const status = Number(response.status || 0);
          const headers = String(response.responseHeaders || "");
          const contentType = headers.match(/^content-type:\s*([^\r\n]+)/im)?.[1] || "";
          if (status >= 200 && status < 300) {
            resolve({ ok: true, status, contentType, response: response.response, text: response.responseText || "" });
          } else {
            resolve({ ok: false, error: `HTTP ${status || "unknown"}`, status, contentType });
          }
        },
        onerror: (error) => resolve({ ok: false, error: String(error?.error || error?.message || "request failed") }),
        onabort: () => resolve({ ok: false, error: "request aborted" }),
        ontimeout: () => resolve({ ok: false, error: "request timeout" })
      });
    });
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer || 0);
    let binary = "";
    const size = 0x8000;
    for (let i = 0; i < bytes.length; i += size) binary += String.fromCharCode(...bytes.subarray(i, i + size));
    return btoa(binary);
  }

  const local = {
    get(key, callback) {
      const result = {};
      try {
        if (Array.isArray(key)) {
          key.forEach((item) => { const raw = localStorage.getItem(item); result[item] = raw ? JSON.parse(raw) : undefined; });
        } else if (typeof key === "string") {
          const raw = localStorage.getItem(key);
          result[key] = raw ? JSON.parse(raw) : undefined;
        } else if (key && typeof key === "object") {
          Object.keys(key).forEach((item) => { const raw = localStorage.getItem(item); result[item] = raw ? JSON.parse(raw) : key[item]; });
        }
      } catch { /* ignore */ }
      callback?.(result);
    },
    set(items, callback) {
      try {
        Object.entries(items || {}).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
      } catch { /* ignore */ }
      callback?.();
    }
  };

  const runtime = {
    lastError: null,
    onMessage: { addListener() {} },
    sendMessage(message, callback) {
      runtime.lastError = null;
      const done = (payload) => { runtime.lastError = payload?.ok === false ? { message: payload.error || "request failed" } : null; callback?.(payload); runtime.lastError = null; };
      try {
        if (message?.type === "XIV_FETCH_TEXT") {
          request(message.url, { responseType: "text" }).then((res) => done(res.ok ? { ok: true, text: res.text, contentType: res.contentType } : res));
          return;
        }
        if (message?.type === "XIV_FETCH_IMAGE") {
          request(message.url, { responseType: "arraybuffer" }).then((res) => done(res.ok ? { ok: true, base64: arrayBufferToBase64(res.response), contentType: res.contentType } : res));
          return;
        }
        if (message?.type === "XIV_DOWNLOAD_URL") {
          const url = message.url;
          const filename = String(message.filename || "flowlens-download").replace(/^图片\//, "");
          if (typeof GM_download === "function") {
            try {
              GM_download({ url, name: filename, saveAs: false, onload: () => done({ ok: true }), onerror: (error) => done({ ok: false, error: String(error?.error || "download failed") }) });
              return;
            } catch { /* fall through */ }
          }
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.rel = "noopener";
          document.documentElement.appendChild(a);
          a.click();
          a.remove();
          done({ ok: true, via: "anchor" });
          return;
        }
        done({ ok: false, error: "unknown message" });
      } catch (error) {
        done({ ok: false, error: String(error?.message || error) });
      }
    }
  };

  window.chrome = window.chrome || {};
  window.chrome.runtime = window.chrome.runtime || runtime;
  window.chrome.storage = window.chrome.storage || { local };
})();
