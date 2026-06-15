const fs = require("fs");
const path = require("path");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const contentPath = path.join(root, "content.js");
const outputPath = path.join(root, "xchina-immersive-viewer.user.js");

let content = fs.readFileSync(contentPath, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

function replaceOnce(source, search, replacement) {
  if (!source.includes(search)) {
    throw new Error(`userscript build failed: missing transform target:\n${search.slice(0, 160)}`);
  }
  return source.replace(search, replacement);
}

const userscriptHeader = `// ==UserScript==
// @name         瀑光 FlowLens
// @namespace    local.xchina-immersive-viewer
// @version      ${manifest.version}
// @description  手机 Edge / Tampermonkey 版：把多图网页整理成沉浸式全屏瀑布流。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      *
// ==/UserScript==
`;

const userscriptHelpers = `  const xivUserscriptMode = typeof GM_xmlhttpRequest === "function" || typeof GM_download === "function";

  function userscriptRequest(url, options = {}) {
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
          if (status >= 200 && status < 300) {
            resolve({
              ok: true,
              status,
              contentType: response.responseHeaders?.match(/^content-type:\\s*([^\\r\\n]+)/im)?.[1] || "",
              response: response.response,
              text: response.responseText || ""
            });
            return;
          }
          resolve({ ok: false, error: \`HTTP \${status || "unknown"}\` });
        },
        onerror: (error) => resolve({ ok: false, error: String(error?.error || error?.message || "request failed") }),
        onabort: () => resolve({ ok: false, error: "request aborted" }),
        ontimeout: () => resolve({ ok: false, error: "request timeout" })
      });
    });
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

`;

content = replaceOnce(
  content,
  "  window.__xchinaImmersiveViewer = true;\n\n",
  "  window.__xchinaImmersiveViewer = true;\n\n" + userscriptHelpers
);

content = replaceOnce(
  content,
  `  function fetchImageViaBackground(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "XIV_FETCH_IMAGE",
        url,
        referrer: location.href
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response);
      });
    });
  }
`,
  `  function fetchImageViaBackground(url) {
    if (xivUserscriptMode) {
      return userscriptRequest(url, {
        responseType: "arraybuffer",
        headers: {
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        }
      }).then((response) => {
        if (!response.ok || !response.response) return response;
        return {
          ok: true,
          contentType: response.contentType || "",
          base64: arrayBufferToBase64(response.response)
        };
      });
    }

    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        resolve({ ok: false, error: "extension runtime unavailable" });
        return;
      }
      chrome.runtime.sendMessage({
        type: "XIV_FETCH_IMAGE",
        url,
        referrer: location.href
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response);
      });
    });
  }
`
);

content = replaceOnce(
  content,
  `  function fetchTextViaBackground(url, referrer = location.href) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "XIV_FETCH_TEXT",
        url,
        referrer
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response);
      });
    });
  }
`,
  `  function fetchTextViaBackground(url, referrer = location.href) {
    if (xivUserscriptMode) {
      return userscriptRequest(url, {
        responseType: "text",
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      }).then((response) => {
        if (!response.ok) return response;
        return {
          ok: true,
          contentType: response.contentType || "",
          text: response.text || ""
        };
      });
    }

    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        resolve({ ok: false, error: "extension runtime unavailable" });
        return;
      }
      chrome.runtime.sendMessage({
        type: "XIV_FETCH_TEXT",
        url,
        referrer
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response);
      });
    });
  }
`
);

content = replaceOnce(
  content,
  `  function downloadUrlViaBackground(url, filename, options = {}) {
    return new Promise((resolve) => {
      try {
        if (!chrome?.runtime?.sendMessage) {
          resolve({ ok: false, error: "extension runtime unavailable" });
          return;
        }
        chrome.runtime.sendMessage({
          type: "XIV_DOWNLOAD_URL",
          url,
          filename,
          referrer: location.href,
          direct: options.direct === true
        }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: "no response" });
        });
      } catch (error) {
        resolve({ ok: false, error: String(error?.message || error) });
      }
    });
  }
`,
  `  function downloadUrlViaBackground(url, filename, options = {}) {
    if (xivUserscriptMode && typeof GM_download === "function") {
      return new Promise((resolve) => {
        try {
          GM_download({
            url,
            name: filename.replace(/^图片\\//, ""),
            saveAs: false,
            onload: () => resolve({ ok: true, via: "GM_download" }),
            onerror: (error) => resolve({ ok: false, error: String(error?.error || error?.message || "download failed") }),
            ontimeout: () => resolve({ ok: false, error: "download timeout" })
          });
        } catch (error) {
          resolve({ ok: false, error: String(error?.message || error) });
        }
      });
    }

    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
          resolve({ ok: false, error: "extension runtime unavailable" });
          return;
        }
        chrome.runtime.sendMessage({
          type: "XIV_DOWNLOAD_URL",
          url,
          filename,
          referrer: location.href,
          direct: options.direct === true
        }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: "no response" });
        });
      } catch (error) {
        resolve({ ok: false, error: String(error?.message || error) });
      }
    });
  }
`
);

content = replaceOnce(
  content,
  `  chrome.runtime?.onMessage?.addListener((message) => {
    if (message?.type === "XIV_TOGGLE") {
      if (state.active) closeViewer();
      else openViewer();
    }
  });
`,
  `  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "XIV_TOGGLE") {
        if (state.active) closeViewer();
        else openViewer();
      }
    });
  }
`
);

fs.writeFileSync(outputPath, `${userscriptHeader}\n${content}`, "utf8");
console.log(`built ${path.relative(process.cwd(), outputPath).replace(/\\\\/g, "/")}`);
