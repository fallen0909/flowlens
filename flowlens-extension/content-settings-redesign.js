(() => {
  if (window.__flowLensSettingsRedesign) return;
  window.__flowLensSettingsRedesign = true;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const SPEEDS = [800, 1200, 1800, 2400, 3200];
  let timer = 0;

  const css = `
    #xiv-root [data-panel="settings"] {
      width: min(560px, calc(100vw - 24px)) !important;
      max-height: min(84vh, 720px) !important;
      overflow: auto !important;
      padding: 18px !important;
      border-radius: 22px !important;
      background: rgba(246,247,249,.96) !important;
      color: #111 !important;
      box-shadow: 0 24px 80px rgba(0,0,0,.28) !important;
      border: 1px solid rgba(0,0,0,.08) !important;
      backdrop-filter: blur(18px) !important;
    }
    #xiv-root[data-theme="dark"] [data-panel="settings"] {
      background: rgba(20,21,25,.96) !important;
      color: #f5f5f5 !important;
      border-color: rgba(255,255,255,.12) !important;
    }
    #xiv-root [data-panel="settings"] h3,
    #xiv-root [data-panel="settings"] .xiv-panel-title {
      margin: 0 0 14px !important;
      font-size: 22px !important;
      line-height: 1.2 !important;
      font-weight: 900 !important;
    }
    #xiv-root [data-panel="settings"] .xiv-setting-row {
      min-height: 48px !important;
      padding: 12px 0 !important;
      border-top: 1px solid rgba(0,0,0,.08) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 16px !important;
      font-size: 15px !important;
      font-weight: 850 !important;
    }
    #xiv-root[data-theme="dark"] [data-panel="settings"] .xiv-setting-row {
      border-top-color: rgba(255,255,255,.1) !important;
    }
    #xiv-root [data-panel="settings"] .xiv-setting-row span:first-child,
    #xiv-root [data-panel="settings"] .xiv-setting-row > span:first-child {
      line-height: 1.35 !important;
    }
    #xiv-root [data-panel="settings"] input[type="checkbox"] {
      width: 24px !important;
      height: 24px !important;
      accent-color: #111 !important;
      flex: 0 0 auto !important;
    }
    #xiv-root [data-panel="settings"] select,
    #xiv-root [data-panel="settings"] .xiv-fl-filter-select {
      min-width: 168px !important;
      height: 44px !important;
      border-radius: 999px !important;
      border: 1px solid rgba(0,0,0,.1) !important;
      background: rgba(255,255,255,.82) !important;
      color: #111 !important;
      padding: 0 40px 0 18px !important;
      font-size: 15px !important;
      font-weight: 850 !important;
    }
    #xiv-root[data-theme="dark"] [data-panel="settings"] select,
    #xiv-root[data-theme="dark"] [data-panel="settings"] .xiv-fl-filter-select {
      background: rgba(255,255,255,.1) !important;
      color: #fff !important;
      border-color: rgba(255,255,255,.14) !important;
    }
    #xiv-root [data-panel="settings"] .xiv-fl-stepper,
    #xiv-root [data-panel="settings"] .xiv-fl-speed-stepper {
      display: inline-flex !important;
      align-items: center !important;
      gap: 14px !important;
      flex: 0 0 auto !important;
    }
    #xiv-root [data-panel="settings"] .xiv-fl-stepper button,
    #xiv-root [data-panel="settings"] .xiv-fl-speed-stepper button {
      width: 48px !important;
      height: 48px !important;
      border-radius: 999px !important;
      border: 1px solid rgba(0,0,0,.1) !important;
      background: rgba(255,255,255,.9) !important;
      color: #111 !important;
      font-size: 24px !important;
      font-weight: 900 !important;
      cursor: pointer !important;
    }
    #xiv-root[data-theme="dark"] [data-panel="settings"] .xiv-fl-stepper button,
    #xiv-root[data-theme="dark"] [data-panel="settings"] .xiv-fl-speed-stepper button {
      background: rgba(255,255,255,.1) !important;
      color: #fff !important;
      border-color: rgba(255,255,255,.14) !important;
    }
    #xiv-root [data-panel="settings"] .xiv-fl-stepper strong,
    #xiv-root [data-panel="settings"] .xiv-fl-speed-stepper strong {
      min-width: 64px !important;
      text-align: center !important;
      font-size: 17px !important;
      font-weight: 900 !important;
    }
    .xiv-fl-setting-section {
      margin: 16px 0 8px !important;
      padding: 0 !important;
      font-size: 13px !important;
      letter-spacing: .08em !important;
      color: #6b7280 !important;
      font-weight: 950 !important;
    }
    #xiv-root[data-theme="dark"] .xiv-fl-setting-section { color: #a8b0bf !important; }
    .xiv-fl-shortcut-card {
      margin-top: 14px !important;
      padding: 14px !important;
      border-radius: 18px !important;
      background: rgba(255,255,255,.72) !important;
      border: 1px solid rgba(0,0,0,.08) !important;
    }
    #xiv-root[data-theme="dark"] .xiv-fl-shortcut-card {
      background: rgba(255,255,255,.07) !important;
      border-color: rgba(255,255,255,.1) !important;
    }
    .xiv-fl-shortcut-card h4 {
      margin: 0 0 10px !important;
      font-size: 15px !important;
      font-weight: 950 !important;
    }
    .xiv-fl-shortcut-grid {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 8px 12px !important;
      font-size: 13px !important;
      line-height: 1.35 !important;
    }
    .xiv-fl-shortcut-grid div { display: flex !important; align-items: center !important; gap: 8px !important; min-width: 0 !important; }
    .xiv-fl-shortcut-grid kbd {
      min-width: 28px !important;
      padding: 4px 8px !important;
      border-radius: 8px !important;
      background: rgba(0,0,0,.08) !important;
      text-align: center !important;
      font-weight: 950 !important;
      font-size: 12px !important;
      color: inherit !important;
      flex: 0 0 auto !important;
    }
    #xiv-root[data-theme="dark"] .xiv-fl-shortcut-grid kbd { background: rgba(255,255,255,.12) !important; }
    @media (max-width: 560px) {
      #xiv-root [data-panel="settings"] { padding: 14px !important; border-radius: 18px !important; }
      #xiv-root [data-panel="settings"] .xiv-setting-row { align-items: flex-start !important; flex-direction: column !important; gap: 10px !important; }
      .xiv-fl-shortcut-grid { grid-template-columns: 1fr !important; }
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-fl-settings-redesign-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-fl-settings-redesign-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function readSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; }
  }

  function writeSettings(patch) {
    const next = { ...readSettings(), ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    try { if (chrome?.storage?.local?.set) chrome.storage.local.set({ [SETTINGS_KEY]: next }); } catch { /* ignore */ }
    return next;
  }

  function currentDelay() {
    const settings = readSettings();
    const raw = Number(settings.lightboxAutoDelay || 1200);
    return SPEEDS.reduce((best, item) => Math.abs(item - raw) < Math.abs(best - raw) ? item : best, SPEEDS[0]);
  }

  function speedLabel(ms) {
    if (ms <= 800) return "Fast";
    if (ms <= 1200) return "Default";
    if (ms <= 1800) return "Quick";
    if (ms <= 2400) return "Normal";
    return "Slow";
  }

  function updateSpeedValue() {
    const value = document.querySelector('[data-fl-speed-value]');
    if (!value) return;
    const ms = currentDelay();
    value.textContent = `${speedLabel(ms)} ${Math.round(ms / 100) / 10}秒`;
  }

  function changeDelay(delta) {
    const current = currentDelay();
    const index = Math.max(0, SPEEDS.indexOf(current));
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, index + delta))];
    writeSettings({ lightboxAutoDelay: next });
    updateSpeedValue();
    const status = document.getElementById("xiv-status");
    if (status) status.textContent = `大图切换速度：${speedLabel(next)} ${Math.round(next / 100) / 10}秒`;
  }

  function makeSection(title) {
    const node = document.createElement("div");
    node.className = "xiv-fl-setting-section";
    node.textContent = title;
    return node;
  }

  function makeSpeedRow() {
    const row = document.createElement("label");
    row.className = "xiv-setting-row";
    row.dataset.flAddon = "lightbox-speed";
    row.innerHTML = `
      <span>大图切换速度</span>
      <span class="xiv-fl-speed-stepper">
        <button type="button" data-fl-speed-minus>−</button>
        <strong data-fl-speed-value>适中 2.6秒</strong>
        <button type="button" data-fl-speed-plus>+</button>
      </span>`;
    row.querySelector("[data-fl-speed-minus]").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      changeDelay(1);
    });
    row.querySelector("[data-fl-speed-plus]").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      changeDelay(-1);
    });
    return row;
  }

  function makeShortcutCard() {
    const card = document.createElement("div");
    card.className = "xiv-fl-shortcut-card";
    card.dataset.flAddon = "shortcut-guide";
    card.innerHTML = `
      <h4>快捷键指引</h4>
      <div class="xiv-fl-shortcut-grid">
        <div><kbd>G</kbd><span>打开 / 关闭图片流</span></div>
        <div><kbd>Esc</kbd><span>关闭大图 / 退出</span></div>
        <div><kbd>1</kbd><span>全部</span></div>
        <div><kbd>2</kbd><span>只看图片</span></div>
        <div><kbd>3</kbd><span>只看视频</span></div>
        <div><kbd>V</kbd><span>循环筛选</span></div>
        <div><kbd>A</kbd><span>自动滚动</span></div>
        <div><kbd>P</kbd><span>大图自动切换</span></div>
        <div><kbd>S</kbd><span>选择模式</span></div>
        <div><kbd>Shift+D</kbd><span>下载已选</span></div>
      </div>`;
    return card;
  }

  function normalizeSettingsPanel() {
    const panel = document.querySelector('#xiv-root [data-panel="settings"]');
    if (!panel) return;
    panel.querySelectorAll('.xiv-fl-setting-section, [data-fl-addon="lightbox-speed"], [data-fl-addon="shortcut-guide"]').forEach((node) => node.remove());

    const rows = [...panel.querySelectorAll('.xiv-setting-row')];
    const firstRow = rows[0];
    if (firstRow) firstRow.before(makeSection("基础显示"));

    const filterRow = [...panel.querySelectorAll('.xiv-setting-row')].find((row) => /图片流筛选|主题/.test(row.textContent || ""));
    if (filterRow) filterRow.before(makeSection("浏览控制"));

    const themeRow = [...panel.querySelectorAll('.xiv-setting-row')].find((row) => /主题/.test(row.textContent || ""));
    const speedRow = makeSpeedRow();
    if (themeRow) themeRow.before(speedRow);
    else panel.appendChild(speedRow);

    panel.appendChild(makeSection("操作说明"));
    panel.appendChild(makeShortcutCard());
    updateSpeedValue();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      injectStyle();
      normalizeSettingsPanel();
    }, 120);
  }

  injectStyle();
  schedule();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-open", "data-active", "class"] });
})();
