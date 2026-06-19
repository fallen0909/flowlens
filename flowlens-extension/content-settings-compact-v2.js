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
      width: min(420px, calc(100vw - 24px)) !important;
      max-width: min(420px, calc(100vw - 24px)) !important;
      max-height: min(76vh, 640px) !important;
      overflow: auto !important;
      padding: 16px !important;
      border-radius: 18px !important;
      font-size: 14px !important;
    }
    #xiv-root [data-panel="settings"] h3,
    #xiv-root .xiv-settings h3,
    #xiv-root .xiv-settings-panel h3,
    #xiv-root .xiv-panel:has(.xiv-setting-row) h3 {
      font-size: 22px !important;
      margin: 0 0 12px !important;
      line-height: 1.15 !important;
    }
    #xiv-root .xiv-setting-row {
      min-height: 42px !important;
      padding: 10px 0 !important;
      gap: 12px !important;
      font-size: 14px !important;
      line-height: 1.25 !important;
    }
    #xiv-root .xiv-setting-row input[type="checkbox"] {
      width: 22px !important;
      height: 22px !important;
      flex: 0 0 auto !important;
    }
    #xiv-root .xiv-setting-row select {
      min-width: 138px !important;
      height: 40px !important;
      border-radius: 999px !important;
      padding: 0 34px 0 14px !important;
      font-size: 14px !important;
      font-weight: 850 !important;
    }
    #xiv-root .xiv-setting-row button {
      width: 42px !important;
      height: 42px !important;
      min-width: 42px !important;
      border-radius: 999px !important;
      font-size: 22px !important;
      line-height: 1 !important;
    }
    #xiv-root .xiv-setting-row strong,
    #xiv-root .xiv-setting-row b {
      min-width: 52px !important;
      text-align: center !important;
      font-size: 15px !important;
    }
    .xiv-fl-compact-section {
      margin: 12px 0 4px !important;
      color: #7a8190 !important;
      font-size: 12px !important;
      font-weight: 950 !important;
      letter-spacing: .06em !important;
    }
    #xiv-root[data-theme="dark"] .xiv-fl-compact-section { color: #aab1c0 !important; }
    .xiv-fl-speed-row .xiv-fl-speed-control {
      display: inline-flex !important;
      align-items: center !important;
      gap: 10px !important;
      flex: 0 0 auto !important;
    }
    .xiv-fl-speed-row .xiv-fl-speed-value {
      min-width: 72px !important;
      text-align: center !important;
      font-size: 14px !important;
      font-weight: 900 !important;
      white-space: nowrap !important;
    }
    .xiv-fl-shortcuts-mini {
      margin-top: 10px !important;
      padding: 10px !important;
      border-radius: 14px !important;
      background: rgba(0,0,0,.045) !important;
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 7px 8px !important;
      font-size: 12px !important;
      line-height: 1.3 !important;
    }
    #xiv-root[data-theme="dark"] .xiv-fl-shortcuts-mini { background: rgba(255,255,255,.08) !important; }
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
        max-height: min(68vh, calc(100vh - 74px - env(safe-area-inset-bottom, 0px))) !important;
        padding: 10px !important;
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
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; }
  }

  function writeSettings(patch) {
    const next = { ...readSettings(), ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    try { chrome?.storage?.local?.set?.({ [SETTINGS_KEY]: next }); } catch {}
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
    node.textContent = `${speedLabel(ms)} ${Math.round(ms / 100) / 10}秒`;
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
    const node = document.createElement("div");
    node.className = "xiv-fl-shortcuts-mini";
    node.dataset.flCompact = "true";
    node.innerHTML = `
      <span><kbd>G</kbd>开关图片流</span>
      <span><kbd>Esc</kbd>退出/关闭</span>
      <span><kbd>1/2/3</kbd>全部/图/视频</span>
      <span><kbd>V</kbd>循环筛选</span>
      <span><kbd>A</kbd>自动滚动</span>
      <span><kbd>P</kbd>大图自动切换</span>
      <span><kbd>,/.</kbd>上一组/下一组</span>
      <span><kbd>S</kbd>选择模式</span>
      <span><kbd>Shift+D</kbd>下载已选</span>`;
    return node;
  }

  function apply() {
    injectStyle();
    const panel = findSettingsPanel();
    if (!panel) return;
    panel.querySelectorAll('[data-fl-compact="true"]').forEach((node) => node.remove());
    const rows = [...panel.querySelectorAll('.xiv-setting-row')];
    const title = panel.querySelector('h3, .xiv-panel-title');
    const firstRow = rows[0];
    if (firstRow) firstRow.before(makeSection("基础显示"));
    const filterRow = rows.find((row) => /图片流筛选|主题/.test(row.textContent || ""));
    if (filterRow) filterRow.before(makeSection("浏览控制"));
    const themeRow = rows.find((row) => /主题/.test(row.textContent || ""));
    const speedRow = makeSpeedRow();
    if (themeRow) themeRow.before(speedRow);
    else panel.appendChild(speedRow);
    panel.appendChild(makeSection("快捷键"));
    panel.appendChild(makeShortcuts());
    updateSpeedLabel();
    if (title) title.textContent = "瀑光设置";
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(apply, 80);
  }

  injectStyle();
  schedule();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "data-active", "data-open"] });
})();
