(() => {
  if (window.__flowLensSettingsCompactV2) return;
  window.__flowLensSettingsCompactV2 = true;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const SPEED_KEY = "flowlens-lightbox-slideshow-delay-v1";
  const SPEEDS = [800, 1200, 1800, 2400, 3200];
  const DEFAULT_DELAY = 1200;
  let timer = 0;

  const css = `
    #xiv-root [data-panel="settings"],
    #xiv-root .xiv-settings,
    #xiv-root .xiv-settings-panel,
    #xiv-root .xiv-panel:has(.xiv-setting-row) {
      width: min(460px, calc(100vw - 24px)) !important;
      max-width: min(460px, calc(100vw - 24px)) !important;
      max-height: min(82vh, 720px) !important;
      overflow: auto !important;
      padding: 14px 16px 16px !important;
      border-radius: 20px !important;
      font-size: 13px !important;
      scrollbar-width: thin !important;
    }
    #xiv-root [data-panel="settings"] h3,
    #xiv-root .xiv-settings h3,
    #xiv-root .xiv-settings-panel h3,
    #xiv-root .xiv-panel:has(.xiv-setting-row) h3 {
      font-size: 20px !important;
      margin: 0 0 8px !important;
      line-height: 1.15 !important;
      letter-spacing: -.02em !important;
    }
    #xiv-root .xiv-setting-row {
      min-height: 38px !important;
      padding: 8px 2px !important;
      gap: 12px !important;
      font-size: 13px !important;
      line-height: 1.25 !important;
      border-top-color: rgba(127,127,127,.16) !important;
    }
    #xiv-root .xiv-setting-row input[type="checkbox"] {
      appearance: none !important;
      width: 38px !important;
      height: 22px !important;
      flex: 0 0 auto !important;
      margin: 0 !important;
      border: 1px solid rgba(127,127,127,.28) !important;
      border-radius: 999px !important;
      background: radial-gradient(circle at 11px 50%, #fff 0 7px, transparent 7.5px), rgba(127,127,127,.3) !important;
      box-shadow: none !important;
      cursor: pointer !important;
      transition: background .18s ease, border-color .18s ease !important;
    }
    #xiv-root .xiv-setting-row input[type="checkbox"]:checked {
      border-color: #4f72ff !important;
      background: radial-gradient(circle at 26px 50%, #fff 0 7px, transparent 7.5px), #4f72ff !important;
    }
    #xiv-root .xiv-setting-row select {
      min-width: 144px !important;
      height: 36px !important;
      border-radius: 999px !important;
      padding: 0 34px 0 14px !important;
      font-size: 13px !important;
      font-weight: 800 !important;
    }
    #xiv-root .xiv-setting-row button {
      width: 36px !important;
      height: 36px !important;
      min-width: 36px !important;
      border-radius: 999px !important;
      font-size: 19px !important;
      line-height: 1 !important;
    }
    #xiv-root .xiv-setting-row strong,
    #xiv-root .xiv-setting-row b {
      min-width: 52px !important;
      text-align: center !important;
      font-size: 15px !important;
    }
    .xiv-fl-compact-section {
      margin: 12px 0 2px !important;
      padding: 5px 8px !important;
      border-radius: 8px !important;
      background: rgba(92,104,132,.08) !important;
      color: #6d7482 !important;
      font-size: 11px !important;
      font-weight: 900 !important;
      letter-spacing: .08em !important;
    }
    #xiv-root[data-theme="dark"] .xiv-fl-compact-section { color: #b7bdc9 !important; background: rgba(255,255,255,.07) !important; }
    .xiv-fl-speed-row .xiv-fl-speed-control {
      display: inline-flex !important;
      align-items: center !important;
      gap: 7px !important;
      flex: 0 0 auto !important;
    }
    .xiv-fl-speed-row .xiv-fl-speed-value {
      min-width: 88px !important;
      text-align: center !important;
      font-size: 13px !important;
      font-weight: 800 !important;
      white-space: nowrap !important;
    }
    .xiv-fl-shortcuts-wrap {
      margin-top: 12px !important;
      border-radius: 12px !important;
      background: rgba(0,0,0,.035) !important;
      overflow: hidden !important;
    }
    #xiv-root[data-theme="dark"] .xiv-fl-shortcuts-wrap { background: rgba(255,255,255,.06) !important; }
    .xiv-fl-shortcuts-wrap summary { padding: 10px 12px !important; cursor: pointer !important; font-size: 12px !important; font-weight: 850 !important; }
    .xiv-fl-shortcuts-mini {
      padding: 0 10px 10px !important;
      border-radius: 14px !important;
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 7px 8px !important;
      font-size: 12px !important;
      line-height: 1.3 !important;
    }
    .xiv-fl-shortcuts-mini kbd {
      display: inline-block !important;
      min-width: 28px !important;
      padding: 3px 6px !important;
      margin-right: 6px !important;
      border-radius: 7px !important;
      background: rgba(0,0,0,.1) !important;
      font-size: 11px !important;
      font-weight: 950 !important;
      text-align: center !important;
    }
    #xiv-root[data-theme="dark"] .xiv-fl-shortcuts-mini kbd { background: rgba(255,255,255,.14) !important; }
    @media (max-width: 560px) {
      #xiv-root [data-panel="settings"],
      #xiv-root .xiv-settings,
      #xiv-root .xiv-settings-panel,
      #xiv-root .xiv-panel:has(.xiv-setting-row) {
        position: fixed !important;
        top: max(58px, calc(env(safe-area-inset-top, 0px) + 50px)) !important;
        right: max(8px, env(safe-area-inset-right, 0px)) !important;
        left: auto !important;
        bottom: auto !important;
        width: min(356px, calc(100vw - 16px)) !important;
        max-width: calc(100vw - 16px) !important;
        height: auto !important;
        max-height: min(76vh, calc(100vh - 74px - env(safe-area-inset-bottom, 0px))) !important;
        padding: 12px !important;
      }
      .xiv-fl-shortcuts-mini { grid-template-columns: 1fr !important; }
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-fl-settings-compact-v2-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-fl-settings-compact-v2-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function readSettings() {
    const extensionSettings = window.__flowLensSettingsStore?.read?.();
    if (extensionSettings) return extensionSettings;
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; }
  }

  function writeSettings(patch) {
    if (window.__flowLensSettingsStore?.write) return window.__flowLensSettingsStore.write(patch);
    const next = { ...readSettings(), ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    try { (chrome?.storage?.sync || chrome?.storage?.local)?.set?.({ [SETTINGS_KEY]: next }); } catch {}
    try { window.__flowLensSyncGlobalSettings?.(); } catch {}
    return next;
  }

  function readGlobalSpeed() {
    const settings = readSettings();
    const stored = Number(settings.lightboxAutoDelay || 0);
    if (SPEEDS.includes(stored)) return stored;
    try {
      const legacy = Number(localStorage.getItem(SPEED_KEY) || 0);
      if (SPEEDS.includes(legacy)) return legacy;
    } catch {}
    return DEFAULT_DELAY;
  }

  function writeGlobalSpeed(value) {
    writeSettings({ lightboxAutoDelay: value });
    try { localStorage.setItem(SPEED_KEY, String(value)); } catch {}
  }

  function nearestSpeed(value) {
    const raw = Number(value || DEFAULT_DELAY);
    return SPEEDS.reduce((best, item) => Math.abs(item - raw) < Math.abs(best - raw) ? item : best, SPEEDS[0]);
  }

  function speedLabel(ms) {
    if (ms <= 800) return "极速";
    if (ms <= 1200) return "默认";
    if (ms <= 1800) return "较快";
    if (ms <= 2400) return "普通";
    return "慢速";
  }

  function currentSpeed() {
    return nearestSpeed(readGlobalSpeed());
  }

  function updateSpeedLabel() {
    const node = document.querySelector(".xiv-fl-speed-value");
    if (!node) return;
    const ms = currentSpeed();
    const text = `${speedLabel(ms)} ${Math.round(ms / 100) / 10}秒`;
    if (node.textContent !== text) node.textContent = text;
  }

  function changeSpeed(delta) {
    const ms = currentSpeed();
    const index = Math.max(0, SPEEDS.indexOf(ms));
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, index + delta))];
    writeGlobalSpeed(next);
    updateSpeedLabel();
    const status = document.getElementById("xiv-status");
    if (status) status.textContent = `大图切换速度：${speedLabel(next)} ${Math.round(next / 100) / 10}秒`;
  }

  function findSettingsPanel() {
    const candidates = [
      ...document.querySelectorAll('#xiv-root [data-panel="settings"], #xiv-root .xiv-settings, #xiv-root .xiv-settings-panel, #xiv-root .xiv-panel')
    ];
    return candidates.find((node) => /瀑光设置|图片流列数|自动滚动速度|图片流筛选|主题/.test(node.textContent || "")) || null;
  }

  function makeSection(text) {
    const node = document.createElement("div");
    node.className = "xiv-fl-compact-section";
    node.dataset.flCompact = "true";
    node.textContent = text;
    return node;
  }

  function makeSpeedRow() {
    const row = document.createElement("div");
    row.className = "xiv-setting-row xiv-fl-speed-row";
    row.dataset.flCompact = "true";
    row.innerHTML = `
      <span>大图切换速度</span>
      <span class="xiv-fl-speed-control">
        <button type="button" data-fl-speed-slower title="变慢">−</button>
        <span class="xiv-fl-speed-value">适中 2.6秒</span>
        <button type="button" data-fl-speed-faster title="变快">+</button>
      </span>`;
    row.querySelector("[data-fl-speed-slower]").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      changeSpeed(1);
    });
    row.querySelector("[data-fl-speed-faster]").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      changeSpeed(-1);
    });
    return row;
  }

  function makeShortcuts() {
    const node = document.createElement("details");
    node.className = "xiv-fl-shortcuts-wrap";
    node.dataset.flCompact = "true";
    node.innerHTML = `
      <summary>快捷键</summary>
      <div class="xiv-fl-shortcuts-mini">
        <span><kbd>G</kbd>开关图片流</span>
        <span><kbd>Esc</kbd>退出/关闭</span>
        <span><kbd>1/2/3</kbd>全部/图/视频</span>
        <span><kbd>V</kbd>循环筛选</span>
        <span><kbd>A</kbd>自动滚动</span>
        <span><kbd>P</kbd>大图自动切换</span>
        <span><kbd>M</kbd>抓取磁力/ED2K</span>
        <span><kbd>←/→</kbd>上一组/下一组</span>
        <span><kbd>S</kbd>选择模式</span>
        <span><kbd>Shift+D</kbd>下载已选</span>
      </div>`;
    return node;
  }

  function ensureSection(panel, key, text, before) {
    if (!before || panel.querySelector(`[data-fl-section="${key}"]`)) return;
    const section = makeSection(text);
    section.dataset.flSection = key;
    before.before(section);
  }

  function apply() {
    injectStyle();
    const panel = findSettingsPanel();
    if (!panel) return;
    const rows = [...panel.querySelectorAll('.xiv-setting-row')];
    const title = panel.querySelector('h3, .xiv-panel-title');
    const firstRow = rows[0];
    ensureSection(panel, "display", "显示与入口", firstRow);
    const filterRow = rows.find((row) => /图片流筛选|主题/.test(row.textContent || ""));
    ensureSection(panel, "browse", "浏览控制", filterRow);
    const themeRow = rows.find((row) => /主题/.test(row.textContent || ""));
    if (!panel.querySelector(".xiv-fl-speed-row")) {
      const speedRow = makeSpeedRow();
      if (themeRow) themeRow.before(speedRow);
      else panel.appendChild(speedRow);
    }
    if (!panel.querySelector(".xiv-fl-shortcuts-wrap")) panel.appendChild(makeShortcuts());
    updateSpeedLabel();
    if (title && title.textContent !== "瀑光设置") title.textContent = "瀑光设置";
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(apply, 80);
  }

  injectStyle();
  schedule();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "data-active", "data-open"] });
})();
