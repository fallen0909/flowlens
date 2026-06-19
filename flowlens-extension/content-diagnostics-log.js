(() => {
  if (window.__flowLensDiagnosticsPatch) return;
  window.__flowLensDiagnosticsPatch = true;

  const VERSION = "1.4.35";
  const MAX_EVENTS = 80;
  const failedMedia = [];
  const runtimeEvents = [];

  function push(list, item) {
    list.push({ time: new Date().toISOString(), ...item });
    if (list.length > MAX_EVENTS) list.splice(0, list.length - MAX_EVENTS);
  }

  window.addEventListener("error", (event) => {
    const target = event.target;
    if (!target || !["IMG", "VIDEO", "SOURCE", "IFRAME"].includes(target.tagName)) return;
    const src = target.currentSrc || target.src || target.getAttribute?.("src") || target.getAttribute?.("data-src") || "";
    if (!src) return;
    const rect = target.getBoundingClientRect?.();
    push(failedMedia, {
      type: "media-error",
      tag: target.tagName,
      src,
      inFlowLens: !!target.closest?.("#xiv-root"),
      size: rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : "unknown"
    });
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    push(runtimeEvents, { type: "unhandledrejection", message: String(event.reason?.message || event.reason || "") });
  });

  window.addEventListener("error", (event) => {
    if (event.target && event.target !== window) return;
    push(runtimeEvents, { type: "runtime-error", message: event.message || "", file: event.filename || "", line: event.lineno || 0 });
  });

  function root() { return document.getElementById("xiv-root"); }
  function settingsPanel() { return root()?.querySelector('[data-panel="settings"]'); }
  function filterSelect() { return root()?.querySelector('#xiv-topbar .xiv-select[data-xiv="filter"]'); }
  function mediaKind(tile) {
    const url = tile?.dataset?.url || "";
    if (/\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(url) || tile?.querySelector?.("video")) return "video";
    return "image";
  }
  function tileSnapshot() {
    const tiles = [...(root()?.querySelectorAll(".xiv-tile") || [])];
    let images = 0;
    let videos = 0;
    let hidden = 0;
    for (const tile of tiles) {
      if (mediaKind(tile) === "video") videos += 1;
      else images += 1;
      const style = getComputedStyle(tile);
      if (style.display === "none" || style.visibility === "hidden" || tile.hidden) hidden += 1;
    }
    return {
      total: tiles.length,
      images,
      videos,
      hidden,
      samples: tiles.slice(0, 12).map((tile) => ({
        index: tile.dataset.index || "",
        kind: mediaKind(tile),
        url: tile.dataset.url || "",
        visible: getComputedStyle(tile).display !== "none" && !tile.hidden
      }))
    };
  }
  function storageSnapshot() {
    const result = {};
    for (const key of ["flowlens-settings-v2", "flowlens-media-filter-v2", "flowlens-lightbox-slideshow-delay-v1"]) {
      try { result[key] = localStorage.getItem(key); } catch { result[key] = "<blocked>"; }
    }
    return result;
  }
  function buildLog() {
    const app = root();
    const box = app?.querySelector("#xiv-lightbox");
    return JSON.stringify({
      version: VERSION,
      generatedAt: new Date().toISOString(),
      page: {
        url: location.href,
        title: document.title,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        devicePixelRatio: window.devicePixelRatio || 1
      },
      flowlens: {
        loaded: !!app,
        active: app?.dataset.active || "",
        theme: app?.dataset.theme || "",
        filter: filterSelect()?.value || "",
        lightboxActive: box?.dataset.active || "",
        lightboxZoom: box?.dataset.zoom || ""
      },
      tiles: tileSnapshot(),
      storage: storageSnapshot(),
      failedMedia,
      runtimeEvents
    }, null, 2);
  }
  async function copyLog() {
    const text = buildLog();
    try {
      await navigator.clipboard.writeText(text);
      toast("分析日志已复制，可以直接发给我");
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;height:38vh;z-index:2147483647;font:12px/1.4 monospace;";
      document.body.appendChild(area);
      area.select();
      toast("已生成日志，请手动复制文本框内容");
    }
  }
  function toast(message) {
    document.getElementById("fl-diagnostics-toast")?.remove();
    const node = document.createElement("div");
    node.id = "fl-diagnostics-toast";
    node.textContent = message;
    node.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;background:rgba(0,0,0,.78);color:#fff;padding:10px 14px;border-radius:999px;font:800 13px/1.2 system-ui,sans-serif;box-shadow:0 10px 26px rgba(0,0,0,.28);";
    document.documentElement.appendChild(node);
    setTimeout(() => node.remove(), 2200);
  }
  function ensureStyle() {
    if (document.getElementById("fl-diagnostics-style")) return;
    const style = document.createElement("style");
    style.id = "fl-diagnostics-style";
    style.textContent = `
      #xiv-root .fl-diagnostics-row {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 12px !important;
      }
      #xiv-root .fl-diagnostics-row > span {
        min-width: 0 !important;
        flex: 1 1 auto !important;
      }
      #xiv-root .fl-diagnostics-row button {
        width: auto !important;
        min-width: 112px !important;
        max-width: 132px !important;
        height: 38px !important;
        padding: 0 16px !important;
        border-radius: 999px !important;
        border: 1px solid rgba(0,0,0,.12) !important;
        background: rgba(255,255,255,.92) !important;
        color: #111 !important;
        font: 900 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        white-space: nowrap !important;
        writing-mode: horizontal-tb !important;
        cursor: pointer !important;
      }
      #xiv-root[data-theme="dark"] .fl-diagnostics-row button,
      #xiv-root:not([data-theme="light"]) .fl-diagnostics-row button {
        border-color: rgba(255,255,255,.16) !important;
        background: rgba(255,255,255,.12) !important;
        color: #fff !important;
      }
      #xiv-root .fl-diagnostics-row small { display:block; margin-top:6px; opacity:.58; font-size:12px; line-height:1.35; }
      @media (max-width: 820px) {
        #xiv-root .fl-diagnostics-row button { min-width: 96px !important; height: 36px !important; padding: 0 12px !important; font-size: 12px !important; }
      }
    `;
    document.documentElement.appendChild(style);
  }
  function ensureRow() {
    const panel = settingsPanel();
    if (!panel) return;
    ensureStyle();
    let row = panel.querySelector(".fl-diagnostics-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "xiv-setting-row fl-diagnostics-row";
      row.innerHTML = `<span><b>分析日志</b><small>复制页面、图片加载、筛选和错误信息</small></span><button type="button">复制日志</button>`;
      panel.appendChild(row);
      row.querySelector("button")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        copyLog();
      });
    }
  }
  function tick() { ensureRow(); }
  document.addEventListener("click", () => setTimeout(tick, 120), true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tick, { once: true });
  else tick();
})();
