(() => {
  if (window.__flowLensSettingsCompactV3) return;
  window.__flowLensSettingsCompactV3 = true;

  const STYLE_ID = "xiv-fl-settings-modules-v3-style";
  let timer = 0;

  const icons = {
    display: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4-1.8A4.8 4.8 0 0 0 7 18Z"/><path d="m9 14 3 3 3-3M12 10v7"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4Z"/></svg>',
    advanced: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>'
  };

  const css = `
    #xiv-root [data-panel="settings"] {
      --fl-ink: #17191f;
      --fl-muted: #737986;
      --fl-line: rgba(29,35,48,.12);
      --fl-surface: rgba(255,255,255,.82);
      --fl-soft: #f1f3f7;
      --fl-accent: #315bd8;
      width: min(500px, calc(100vw - 24px)) !important;
      max-width: min(500px, calc(100vw - 24px)) !important;
      max-height: min(84vh, 780px) !important;
      box-sizing: border-box !important;
      padding: 18px !important;
      overflow: auto !important;
      border: 1px solid rgba(255,255,255,.7) !important;
      border-radius: 22px !important;
      background: rgba(247,248,250,.96) !important;
      color: var(--fl-ink) !important;
      box-shadow: 0 24px 80px rgba(24,29,40,.28) !important;
      backdrop-filter: blur(22px) saturate(1.1) !important;
      scrollbar-width: thin !important;
      font-family: "MiSans", "HarmonyOS Sans SC", "Microsoft YaHei UI", sans-serif !important;
    }
    #xiv-root[data-theme="dark"] [data-panel="settings"] {
      --fl-ink: #f3f4f6;
      --fl-muted: #9da3af;
      --fl-line: rgba(255,255,255,.11);
      --fl-surface: rgba(30,33,40,.84);
      --fl-soft: #252832;
      background: rgba(20,22,27,.96) !important;
      border-color: rgba(255,255,255,.1) !important;
    }
    #xiv-root [data-panel="settings"] > h3 {
      margin: 0 !important;
      color: var(--fl-ink) !important;
      font-size: 24px !important;
      font-weight: 900 !important;
      line-height: 1.1 !important;
      letter-spacing: -.04em !important;
    }
    #xiv-root [data-panel="settings"] > .fl-version-row {
      min-height: 28px !important;
      margin: 4px 0 14px !important;
      padding: 0 !important;
      border: 0 !important;
      color: var(--fl-muted) !important;
      font-size: 11px !important;
      font-weight: 750 !important;
    }
    #xiv-root [data-panel="settings"] > .fl-version-row strong {
      min-width: 0 !important;
      padding: 5px 9px !important;
      border-radius: 999px !important;
      background: rgba(49,91,216,.1) !important;
      color: var(--fl-accent) !important;
      font-size: 12px !important;
      font-weight: 900 !important;
    }
    #xiv-root .xiv-settings-group {
      margin: 0 0 10px !important;
      overflow: clip !important;
      border: 1px solid var(--fl-line) !important;
      border-radius: 15px !important;
      background: var(--fl-surface) !important;
    }
    #xiv-root .xiv-settings-group > summary {
      min-height: 62px !important;
      box-sizing: border-box !important;
      display: grid !important;
      grid-template-columns: 34px minmax(0,1fr) 18px !important;
      align-items: center !important;
      gap: 10px !important;
      padding: 10px 13px !important;
      color: var(--fl-ink) !important;
      cursor: pointer !important;
      list-style: none !important;
      user-select: none !important;
    }
    #xiv-root .xiv-settings-group > summary::-webkit-details-marker { display: none !important; }
    #xiv-root .xiv-settings-group > summary:hover { background: rgba(49,91,216,.045) !important; }
    #xiv-root .xiv-settings-group-icon {
      width: 34px !important;
      height: 34px !important;
      display: grid !important;
      place-items: center !important;
      border-radius: 10px !important;
      background: var(--fl-soft) !important;
      color: var(--fl-accent) !important;
    }
    #xiv-root .xiv-settings-group-icon svg { width: 18px !important; height: 18px !important; }
    #xiv-root .xiv-settings-group-copy { min-width: 0 !important; }
    #xiv-root .xiv-settings-group-copy b,
    #xiv-root .xiv-settings-group-copy small { display: block !important; }
    #xiv-root .xiv-settings-group-copy b { font-size: 14px !important; font-weight: 900 !important; line-height: 1.2 !important; }
    #xiv-root .xiv-settings-group-copy small { margin-top: 3px !important; color: var(--fl-muted) !important; font-size: 10px !important; font-weight: 650 !important; line-height: 1.25 !important; }
    #xiv-root .xiv-settings-group-chevron {
      width: 8px !important;
      height: 8px !important;
      justify-self: center !important;
      border-right: 2px solid currentColor !important;
      border-bottom: 2px solid currentColor !important;
      opacity: .48 !important;
      transform: rotate(45deg) translate(-2px,-2px) !important;
      transition: transform .18s ease !important;
    }
    #xiv-root .xiv-settings-group[open] > summary .xiv-settings-group-chevron { transform: rotate(225deg) translate(-2px,-2px) !important; }
    #xiv-root .xiv-settings-group-body { padding: 0 13px 12px !important; border-top: 1px solid var(--fl-line) !important; }
    #xiv-root .xiv-settings-group .xiv-setting-row {
      min-height: 50px !important;
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: 8px 1px !important;
      border: 0 !important;
      border-bottom: 1px solid var(--fl-line) !important;
      color: var(--fl-ink) !important;
      font-size: 13px !important;
      font-weight: 800 !important;
      line-height: 1.25 !important;
    }
    #xiv-root .xiv-settings-group .xiv-setting-row:last-child { border-bottom: 0 !important; }
    #xiv-root .xiv-settings-group .xiv-setting-row > span:first-child { color: var(--fl-ink) !important; font-size: 13px !important; font-weight: 800 !important; }
    #xiv-root .xiv-settings-group .xiv-setting-row input[type="checkbox"] {
      appearance: none !important;
      width: 40px !important;
      height: 23px !important;
      flex: 0 0 auto !important;
      margin: 0 !important;
      border: 1px solid rgba(127,127,127,.3) !important;
      border-radius: 999px !important;
      background: radial-gradient(circle at 11px 50%, #fff 0 7px, transparent 7.5px), rgba(127,127,127,.3) !important;
      cursor: pointer !important;
    }
    #xiv-root .xiv-settings-group .xiv-setting-row input[type="checkbox"]:checked {
      border-color: var(--fl-accent) !important;
      background: radial-gradient(circle at 28px 50%, #fff 0 7px, transparent 7.5px), var(--fl-accent) !important;
    }
    #xiv-root .xiv-settings-group .xiv-setting-row select {
      min-width: 146px !important;
      height: 36px !important;
      padding: 0 34px 0 13px !important;
      border: 1px solid var(--fl-line) !important;
      border-radius: 10px !important;
      background-color: var(--fl-soft) !important;
      color: var(--fl-ink) !important;
      font: 850 12px/1 "MiSans", "Microsoft YaHei UI", sans-serif !important;
    }
    #xiv-root .xiv-settings-group .xiv-setting-row button {
      width: 34px !important;
      height: 34px !important;
      min-width: 34px !important;
      border-radius: 10px !important;
      font-size: 18px !important;
    }
    #xiv-root .xiv-settings-group .xiv-setting-row strong,
    #xiv-root .xiv-settings-group .xiv-setting-row b { min-width: 48px !important; font-size: 14px !important; text-align: center !important; }
    #xiv-root .xiv-settings-group[data-settings-group="cloud"] .xiv-settings-group-body { padding: 12px !important; }
    #xiv-root .xiv-settings-group .xiv-cd2-settings {
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
    }
    #xiv-root .xiv-settings-group .xiv-cd2-settings-head { display: none !important; }
    #xiv-root .xiv-settings-group .xiv-cd2-play-modes { margin: 0 0 12px !important; gap: 8px !important; }
    #xiv-root .xiv-settings-group .xiv-cd2-play-mode-card {
      min-height: 64px !important;
      border-color: var(--fl-line) !important;
      border-radius: 12px !important;
      background: var(--fl-soft) !important;
    }
    #xiv-root .xiv-settings-group .xiv-cd2-play-mode input:checked + .xiv-cd2-play-mode-card {
      border-color: var(--fl-accent) !important;
      background: rgba(49,91,216,.08) !important;
      box-shadow: inset 0 0 0 1px var(--fl-accent) !important;
    }
    #xiv-root .xiv-settings-group .xiv-cd2-field { color: var(--fl-muted) !important; font-size: 10px !important; font-weight: 750 !important; }
    #xiv-root .xiv-settings-group .xiv-cd2-field input {
      height: 39px !important;
      border-color: var(--fl-line) !important;
      border-radius: 10px !important;
      background: var(--fl-soft) !important;
      color: var(--fl-ink) !important;
      font-size: 11px !important;
    }
    #xiv-root .xiv-settings-group .xiv-cd2-field small { margin: 2px 0 0 !important; color: var(--fl-muted) !important; font-size: 9px !important; }
    #xiv-root .xiv-settings-group .xiv-cd2-controls button {
      min-height: 34px !important;
      border-radius: 10px !important;
      background: var(--fl-soft) !important;
      color: var(--fl-ink) !important;
      font-size: 11px !important;
    }
    #xiv-root .xiv-settings-group .xiv-cd2-controls [data-cd2-action="save"] { background: var(--fl-accent) !important; color: #fff !important; }
    #xiv-root .xiv-settings-group .fl-page-bookmark-settings {
      margin: 0 !important;
      padding: 12px 0 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
    }
    #xiv-root .xiv-settings-group .fl-page-bookmark-settings-title { display: none !important; }
    #xiv-root .xiv-settings-group .fl-page-bookmark-settings-btn { min-height: 46px !important; border-radius: 11px !important; background: var(--fl-soft) !important; color: var(--fl-ink) !important; }
    #xiv-root .xiv-settings-group[data-settings-group="advanced"] .xiv-settings-group-body > details {
      margin: 10px 0 0 !important;
      border: 1px solid var(--fl-line) !important;
      border-radius: 11px !important;
      background: var(--fl-soft) !important;
      overflow: hidden !important;
    }
    #xiv-root .xiv-settings-group[data-settings-group="advanced"] .xiv-settings-group-body > details > summary {
      padding: 11px 12px !important;
      color: var(--fl-ink) !important;
      font-size: 12px !important;
      font-weight: 850 !important;
      cursor: pointer !important;
    }
    #xiv-root .xiv-fl-shortcuts-mini { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 8px !important; padding: 0 11px 11px !important; color: var(--fl-muted) !important; font-size: 11px !important; }
    #xiv-root .xiv-fl-shortcuts-mini kbd { display: inline-grid !important; min-width: 28px !important; margin-right: 6px !important; padding: 3px 5px !important; place-items: center !important; border-radius: 6px !important; background: rgba(127,127,127,.14) !important; color: var(--fl-ink) !important; font-size: 10px !important; font-weight: 950 !important; }
    #xiv-root .xiv-fl-compact-section { display: none !important; }
    @media (max-width: 560px) {
      #xiv-root [data-panel="settings"] {
        position: fixed !important;
        top: max(58px, calc(env(safe-area-inset-top, 0px) + 50px)) !important;
        right: max(8px, env(safe-area-inset-right, 0px)) !important;
        left: auto !important;
        bottom: auto !important;
        width: min(380px, calc(100vw - 16px)) !important;
        max-width: calc(100vw - 16px) !important;
        max-height: min(78vh, calc(100vh - 74px - env(safe-area-inset-bottom, 0px))) !important;
        padding: 14px !important;
      }
      #xiv-root .xiv-cd2-play-modes { grid-template-columns: 1fr !important; }
      #xiv-root .xiv-fl-shortcuts-mini { grid-template-columns: 1fr !important; }
    }
  `;

  function injectStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = css;
      document.documentElement.appendChild(style);
    } else if (style !== document.documentElement.lastElementChild) {
      document.documentElement.appendChild(style);
    }
  }

  function findPanel() {
    return document.querySelector('#xiv-root [data-panel="settings"]');
  }

  function makeGroup(key, title, description, open = false) {
    const group = document.createElement("details");
    group.className = "xiv-settings-group";
    group.dataset.settingsGroup = key;
    group.open = open;
    group.innerHTML = `
      <summary>
        <span class="xiv-settings-group-icon">${icons[key]}</span>
        <span class="xiv-settings-group-copy"><b>${title}</b><small>${description}</small></span>
        <i class="xiv-settings-group-chevron" aria-hidden="true"></i>
      </summary>
      <div class="xiv-settings-group-body"></div>`;
    return group;
  }

  function ensureGroup(panel, key, title, description, open = false) {
    let group = panel.querySelector(`:scope > .xiv-settings-group[data-settings-group="${key}"]`);
    if (!group) {
      group = makeGroup(key, title, description, open);
      panel.appendChild(group);
    }
    return group;
  }

  function makeShortcuts() {
    const node = document.createElement("details");
    node.className = "xiv-fl-shortcuts-wrap";
    node.innerHTML = `
      <summary>快捷键</summary>
      <div class="xiv-fl-shortcuts-mini">
        <span><kbd>G</kbd>开关图片流</span><span><kbd>Esc</kbd>退出/关闭</span>
        <span><kbd>1/2/3</kbd>全部/图/视频</span><span><kbd>V</kbd>循环筛选</span>
        <span><kbd>A</kbd>自动滚动</span><span><kbd>P</kbd>大图自动切换</span>
        <span><kbd>M</kbd>抓取磁力/ED2K</span><span><kbd>←/→</kbd>上一组/下一组</span>
        <span><kbd>S</kbd>选择模式</span><span><kbd>Shift+D</kbd>下载已选</span>
      </div>`;
    return node;
  }

  function apply() {
    injectStyle();
    const panel = findPanel();
    if (!panel) return;
    panel.querySelectorAll(":scope > .xiv-fl-compact-section").forEach((node) => node.remove());
    panel.querySelectorAll(".xiv-fl-speed-row").forEach((node) => node.remove());

    const display = ensureGroup(panel, "display", "显示与浏览", "入口、布局、筛选和大图播放", true);
    const cloud = ensureGroup(panel, "cloud", "磁力与播放", "CloudDrive2、115 转存和播放方式");
    const bookmark = ensureGroup(panel, "bookmark", "页面收藏", "收藏当前页面和查看收藏列表");
    const advanced = ensureGroup(panel, "advanced", "高级设置", "广告过滤、快捷键和低频选项");
    const displayBody = display.querySelector(".xiv-settings-group-body");
    const cloudBody = cloud.querySelector(".xiv-settings-group-body");
    const bookmarkBody = bookmark.querySelector(".xiv-settings-group-body");
    const advancedBody = advanced.querySelector(".xiv-settings-group-body");

    panel.querySelectorAll(":scope > .xiv-setting-row").forEach((row) => displayBody.appendChild(row));
    panel.querySelectorAll(":scope > .xiv-cd2-settings").forEach((section) => cloudBody.appendChild(section));
    panel.querySelectorAll(":scope > .fl-page-bookmark-settings").forEach((section) => bookmarkBody.appendChild(section));

    if (!advancedBody.querySelector(".xiv-fl-shortcuts-wrap")) advancedBody.appendChild(makeShortcuts());
    [...panel.children].forEach((node) => {
      if (node.matches("h3, .fl-version-row, .xiv-settings-group, style")) return;
      if (node.matches("small") || node.matches("details")) advancedBody.appendChild(node);
    });

    const desiredGroups = [display, cloud, bookmark, advanced];
    const currentGroups = [...panel.querySelectorAll(":scope > .xiv-settings-group")];
    if (desiredGroups.some((group, index) => currentGroups[index] !== group)) {
      desiredGroups.forEach((group) => panel.appendChild(group));
    }
    if (!cloudBody.querySelector(".xiv-cd2-settings")) cloud.hidden = true;
    else cloud.hidden = false;
    if (!bookmarkBody.querySelector(".fl-page-bookmark-settings")) bookmark.hidden = true;
    else bookmark.hidden = false;
  }

  function schedule() {
    clearTimeout(timer);
    timer = window.setTimeout(apply, 90);
  }

  injectStyle();
  schedule();
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "data-open", "data-active"]
  });
})();
