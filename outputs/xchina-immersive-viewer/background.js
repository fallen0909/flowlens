chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "XIV_TOGGLE" });
  } catch {
    await chrome.scripting?.executeScript?.({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    await chrome.tabs.sendMessage(tab.id, { type: "XIV_TOGGLE" });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "XIV_DOWNLOAD_URL") {
    downloadImage(message.url, message.filename, message.referrer || sender?.tab?.url || "https://xchina.co/", {
      direct: message.direct === true
    })
      .then((downloadId) => sendResponse({ ok: true, downloadId }))
      .catch((error) => sendResponse({
        ok: false,
        error: String(error?.message || error),
        url: message.url,
        filename: message.filename
      }));

    return true;
  }

  if (message?.type === "XIV_FETCH_TEXT") {
    fetch(message.url, {
      credentials: "include",
      referrer: message.referrer || sender?.tab?.url || "https://xchina.co/",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        sendResponse({
          ok: true,
          contentType: res.headers.get("content-type") || "",
          text: await res.text()
        });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error) });
      });

    return true;
  }

  if (message?.type !== "XIV_FETCH_IMAGE") return false;

  fetch(message.url, {
    credentials: "include",
    referrer: message.referrer || "https://x.810114.xyz/",
    headers: {
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    }
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get("content-type") || "";
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      sendResponse({ ok: true, contentType, base64: btoa(binary) });
    })
    .catch((error) => {
      sendResponse({ ok: false, error: String(error?.message || error) });
    });

  return true;
});

function safeDownloadFilename(filename) {
  const fallback = "\u56fe\u7247/image.jpg";
  const value = String(filename || fallback)
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.replace(/[<>:"|?*\x00-\x1f]+/g, "_").trim())
    .filter(Boolean)
    .join("/");
  return value || fallback;
}

async function downloadImage(url, filename, referrer, options = {}) {
  if (!url) throw new Error("missing url");
  if (!isDownloadableImageUrl(url)) throw new Error("not an image url");
  await hideDownloadUi();
  if (options.direct) {
    return startDownload(url, filename);
  }
  if (shouldFetchBeforeDownload(url)) {
    const dataUrl = await fetchImageAsDataUrl(url, referrer);
    return startDownload(dataUrl, filename);
  }
  try {
    return await startDownload(url, filename);
  } catch (error) {
    const message = String(error?.message || error);
    throw new Error(message);
  }
}

async function hideDownloadUi() {
  try {
    if (chrome.downloads?.setUiOptions) {
      await chrome.downloads.setUiOptions({ enabled: false });
      return;
    }
    chrome.downloads?.setShelfEnabled?.(false);
  } catch {
    // Some Chromium builds or permission states can reject this; downloads still work.
  }
}

function shouldFetchBeforeDownload(url) {
  try {
    const parsed = new URL(url);
    return /(^|\.)img\.xchina\.io$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function isDownloadableImageUrl(url) {
  try {
    const parsed = new URL(url);
    const format = parsed.searchParams.get("format")?.toLowerCase() || "";
    if (["jpg", "jpeg", "png", "webp", "avif", "gif"].includes(format)) return true;
    return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function fetchImageAsDataUrl(url, referrer) {
  const res = await fetch(url, {
    credentials: "include",
    referrer: referrer || "https://xchina.co/",
    headers: {
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  if (!/^image\//i.test(contentType)) throw new Error(`not image: ${contentType || "unknown"} ${url}`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

function startDownload(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url,
      filename: safeDownloadFilename(filename),
      conflictAction: "uniquify",
      saveAs: false
    }, (downloadId) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(downloadId);
    });
  });
}

const RELOAD_ALARM = "xiv-dev-auto-reload";
const RELOAD_TOKEN_KEY = "xivReloadToken";

async function readReloadToken() {
  try {
    const url = `${chrome.runtime.getURL("reload-token.txt")}?t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return "";
    return (await res.text()).trim();
  } catch {
    return "";
  }
}

async function checkDevAutoReload() {
  const token = await readReloadToken();
  if (!token) return;

  const stored = await chrome.storage.local.get(RELOAD_TOKEN_KEY);
  const previous = stored[RELOAD_TOKEN_KEY] || "";
  if (!previous) {
    await chrome.storage.local.set({ [RELOAD_TOKEN_KEY]: token });
    return;
  }
  if (previous !== token) {
    await chrome.storage.local.set({ [RELOAD_TOKEN_KEY]: token });
    chrome.runtime.reload();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(RELOAD_ALARM, { periodInMinutes: 1 });
  hideDownloadUi();
  checkDevAutoReload();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(RELOAD_ALARM, { periodInMinutes: 1 });
  hideDownloadUi();
  checkDevAutoReload();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RELOAD_ALARM) checkDevAutoReload();
});

chrome.alarms.create(RELOAD_ALARM, { periodInMinutes: 1 });
hideDownloadUi();
checkDevAutoReload();
