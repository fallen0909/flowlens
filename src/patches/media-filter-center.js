(() => {
  if (window.__flowLensMediaFilterCenter) return;
  window.__flowLensMediaFilterCenter = true;

  const STORE_KEY = "flowlens-media-filter-center-v1";
  const MAX_LOG = 80;
  const defaultConfig = {
    enabled: true,
    smart: true,
    diagnostics: true,
    showTileButton: true,
    hosts: "",
    terms: "6a38baf0e4f9b.webp\n6914a1e352a47.webp"
  };
  const logs = [];
  const adapters = [];
  let timer = 0;

  function readConfig() {
    try {
      return { ...defaultConfig, ...(JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {}) };
    } catch {
      return { ...defaultConfig };
    }
  }

  function writeConfig(next) {
    const config = { ...readConfig(), ...next };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(config)); } catch {}
    refreshUi();
    scheduleApply(10);
    return config;
  }

  function splitLines(text) {
    return String(text || "").split(/[\n,;]/).map((item) => item.trim()).filter(Boolean);
  }

  function clean(value) {
    return String(value || "").replaceAll("\\/", "/").replace(/\\u002f/gi, "/").replaceAll("&amp;", "&");
  }

  function urlInfo(value) {
    try {
      const parsed = new URL(clean(value), location.href);
      return { href: parsed.href, host: parsed.hostname.toLowerCase(), path: parsed.pathname.toLowerCase(), name: (parsed.pathname.split("/").pop() || "").toLowerCase() };
    } catch {
      const text = clean(value).toLowerCase();
      return { href: text, host: "", path: text, name: text.split(/[/?#]/)[0].split("/").pop() || text };
    }
  }

  function currentAdapter() {
    const url = location.href;
    return adapters.find((item) => {
      try { return item.match?.(url); } catch { return false; }
    }) || null;
  }

  function registerAdapter(adapter) {
    if (!adapter?.id || adapters.some((item) => item.id === adapter.id)) return;
    adapters.push(adapter);
  }

  function reasonFor(value, node = null) {
    const config = readConfig();
    if (!config.enabled || !value) return "";
    const info = urlInfo(value);
    const hay = `${info.href} ${info.name} ${node?.textContent || ""}`.toLowerCase();
    const term = splitLines(config.terms).find((item) => hay.includes(item.toLowerCase()));
    if (term) return `关键词：${term}`;
    const hostRule = splitLines(config.hosts).find((item) => info.host === item.toLowerCase() || info.host.endsWith(`.${item.toLowerCase()}`));
    if (hostRule) return `来源域名：${hostRule}`;
    const adapter = currentAdapter();
    const adapterReason = adapter?.reason?.(info, node, config);
    if (adapterReason) return adapterReason;
    if (config.smart && node) {
      const label = [node.getAttribute?.("alt"), node.getAttribute?.("title"), node.getAttribute?.("aria-label"), node.closest?.("a")?.textContent, node.textContent].join(" ");
      if (/广告|推广|下载|扫码|官方APP|APP下载|sponsor|promo|banner/i.test(label)) return "周边文字";
      const rect = node.getBoundingClientRect?.();
      if (rect?.width > 260 && rect?.height > 40 && rect.width / Math.max(1, rect.height) > 2.6) return "横幅比例";
    }
    return "";
  }

  function nodeReason(node) {
    if (!node?.getAttribute) return "";
    const attrs = ["src", "currentSrc", "href", "poster", "file", "zoomfile", "data-file", "data-zoomfile", "data-src", "data-original", "data-lazy-src", "data-url", "data-full", "data-large", "srcset", "data-srcset", "style"];
    for (const attr of attrs) {
      const value = attr === "currentSrc" ? node.currentSrc : node.getAttribute(attr);
      const reason = reasonFor(value, node);
      if (reason) return reason;
    }
    return "";
  }

  function logBlocked(url, reason) {
    if (!readConfig().diagnostics) return;
    logs.unshift({ url: String(url || "").slice(0, 220), reason, time: new Date().toLocaleTimeString() });
    logs.splice(MAX_LOG);
    refreshLog();
  }

  function removeTile(tile, reason) {
    const url = tile?.dataset?.url || tile?.querySelector?.("img,video")?.dataset?.sourceUrl || "";
    logBlocked(url, reason);
    tile?.remove?.();
  }

  function addTerm(value) {
    const info = urlInfo(value);
    const marker = info.name || info.href;
    if (!marker) return;
    const config = readConfig();
    const terms = splitLines(config.terms);
    if (!terms.some((item) => item.toLowerCase() === marker.toLowerCase())) terms.push(marker);
    writeConfig({ terms: terms.join("\n") });
  }

  function currentLightboxUrl() {
    const media = document.querySelector("#xiv-lightbox > img, #xiv-lightbox > video, #xiv-lightbox iframe");
    return media?.currentSrc || media?.src || media?.dataset?.sourceUrl || "";
  }

  function decorateTile(tile) {
    const config = readConfig();
    if (!config.showTileButton || tile.querySelector(".fl-mf-block")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fl-mf-block";
    button.title = "拉黑这张图";
    button.textContent = "×";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const url = tile.dataset.url || tile.querySelector("img,video")?.src || "";
      addTerm(url);
      removeTile(tile, "手动拉黑");
    }, true);
    tile.appendChild(button);
  }

  function applyFilters() {
    const config = readConfig();
    document.documentElement.dataset.flMediaFilter = config.enabled ? "true" : "false";
    document.querySelectorAll("#xiv-grid .xiv-tile").forEach((tile) => {
      decorateTile(tile);
      if (!config.enabled) return;
      const reason = reasonFor(tile.dataset.url, tile) || nodeReason(tile);
      if (reason) removeTile(tile, reason);
    });
    const lb = document.querySelector("#xiv-lightbox[data-active='true']");
    const url = currentLightboxUrl();
    const reason = url ? reasonFor(url, lb) : "";
    if (reason && window.__flowLensControl?.showAdjacent) {
      logBlocked(url, reason);
      window.__flowLensControl.showAdjacent(1);
    }
  }

  function scheduleApply(delay = 120) {
    clearTimeout(timer);
    timer = setTimeout(applyFilters, delay);
  }

  function installStyle() {
    if (document.getElementById("fl-media-filter-style")) return;
    const style = document.createElement("style");
    style.id = "fl-media-filter-style";
    style.textContent = `
      .fl-mf-section { margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.14); }
      .fl-mf-section h4 { margin: 0 0 8px; font-size: 14px; }
      .fl-mf-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 8px 0; font-size: 13px; }
      .fl-mf-section textarea { width: 100%; min-height: 54px; resize: vertical; box-sizing: border-box; border-radius: 10px; border: 1px solid rgba(255,255,255,.18); background: rgba(0,0,0,.18); color: inherit; padding: 8px; }
      .fl-mf-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
      .fl-mf-actions button, .fl-mf-section button { border: 0; border-radius: 999px; padding: 7px 10px; font-weight: 800; cursor: pointer; }
      .fl-mf-log { max-height: 120px; overflow: auto; margin-top: 8px; font-size: 11px; opacity: .86; white-space: pre-wrap; }
      .fl-mf-block { position: absolute; top: 7px; right: 7px; z-index: 5; width: 25px; height: 25px; border-radius: 999px; border: 0; background: rgba(0,0,0,.56); color: white; font: 900 18px/1 system-ui; opacity: 0; pointer-events: auto; }
      .xiv-tile:hover .fl-mf-block, .fl-mf-block:focus { opacity: 1; }
      #xiv-root[data-theme='light'] .fl-mf-section textarea { background: rgba(255,255,255,.88); color: #151515; border-color: rgba(0,0,0,.16); }
    `;
    document.documentElement.appendChild(style);
  }

  function ensureUi() {
    const panel = document.querySelector(".xiv-panel[data-panel='settings']");
    if (!panel || panel.querySelector(".fl-mf-section")) return;
    const section = document.createElement("section");
    section.className = "fl-mf-section";
    section.innerHTML = `
      <h4>广告识别中心</h4>
      <label class="fl-mf-row"><span>启用识别过滤</span><input type="checkbox" data-fl-mf="enabled"></label>
      <label class="fl-mf-row"><span>智能识别</span><input type="checkbox" data-fl-mf="smart"></label>
      <label class="fl-mf-row"><span>显示拉黑按钮</span><input type="checkbox" data-fl-mf="showTileButton"></label>
      <label class="fl-mf-row"><span>记录过滤原因</span><input type="checkbox" data-fl-mf="diagnostics"></label>
      <small>来源域名过滤（一行一个）</small>
      <textarea data-fl-mf="hosts" placeholder="例如：example.com"></textarea>
      <small>图片黑名单/关键词（一行一个，可填文件名或 URL 片段）</small>
      <textarea data-fl-mf="terms"></textarea>
      <div class="fl-mf-actions"><button type="button" data-fl-mf-action="block-current">拉黑当前大图</button><button type="button" data-fl-mf-action="apply">立即重新过滤</button><button type="button" data-fl-mf-action="clear-log">清空日志</button></div>
      <small data-fl-mf-adapter></small>
      <div class="fl-mf-log" data-fl-mf-log></div>
    `;
    panel.appendChild(section);
    section.addEventListener("change", onUiChange);
    section.addEventListener("click", onUiClick);
    refreshUi();
  }

  function onUiChange(event) {
    const key = event.target?.dataset?.flMf;
    if (!key) return;
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    writeConfig({ [key]: value });
  }

  function onUiClick(event) {
    const action = event.target?.dataset?.flMfAction;
    if (!action) return;
    if (action === "apply") applyFilters();
    if (action === "clear-log") { logs.length = 0; refreshLog(); }
    if (action === "block-current") {
      const url = currentLightboxUrl();
      if (url) addTerm(url);
      applyFilters();
    }
  }

  function refreshUi() {
    const section = document.querySelector(".fl-mf-section");
    if (!section) return;
    const config = readConfig();
    section.querySelectorAll("[data-fl-mf]").forEach((node) => {
      const key = node.dataset.flMf;
      if (node.type === "checkbox") node.checked = !!config[key];
      else node.value = String(config[key] || "");
    });
    const adapter = currentAdapter();
    const label = section.querySelector("[data-fl-mf-adapter]");
    if (label) label.textContent = `当前站点适配器：${adapter?.name || "通用"}`;
    refreshLog();
  }

  function refreshLog() {
    const log = document.querySelector("[data-fl-mf-log]");
    if (!log) return;
    log.textContent = logs.length ? logs.map((item) => `${item.time}｜${item.reason}｜${item.url}`).join("\n") : "暂无过滤记录";
  }

  registerAdapter({
    id: "xchina-photo",
    name: "xchina 图库",
    match: (url) => /xchina\.co\/photo\/id-/i.test(url),
    reason(info, node, config) {
      if (!config.smart) return "";
      const text = [node?.textContent, node?.getAttribute?.("alt"), node?.getAttribute?.("title")].join(" ");
      if (/galgameclub|姬游社|PC\+安卓|APP下载|删除被禁止|收录绝版/i.test(text)) return "xchina 推广图";
      return "";
    }
  });

  window.__flowLensMediaFilter = { readConfig, writeConfig, reasonFor, addTerm, registerAdapter, applyFilters };
  installStyle();
  const observer = new MutationObserver(() => { ensureUi(); scheduleApply(); });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset", "data-src", "data-original", "data-url", "style", "data-active"] });
  document.addEventListener("click", () => scheduleApply(180), true);
  ensureUi();
  scheduleApply(300);
})();
