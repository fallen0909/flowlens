(() => {
  if (window.__flowLensVersionDisplayPatch) return;
  window.__flowLensVersionDisplayPatch = true;

  let timer = 0;

  function currentVersion() {
    try {
      const info = typeof window.__flowLensGetVersion === "function"
        ? window.__flowLensGetVersion()
        : window.__FlowLensVersion;
      if (info?.version) return info.version;
    } catch {
      // Fall through to legacy globals.
    }
    return window.__FLOWLENS_VERSION__ || "dev";
  }

  function settingsPanel() {
    return document.querySelector('#xiv-root [data-panel="settings"], #xiv-root .xiv-settings, #xiv-root .xiv-settings-panel');
  }

  function makeVersionRow() {
    const row = document.createElement("div");
    row.className = "xiv-setting-row fl-version-row";
    row.dataset.flVersionRow = "true";
    row.innerHTML = `<span>瀑光版本</span><strong class="fl-version-value"></strong>`;
    return row;
  }

  function setRowValue(row) {
    const value = `v${currentVersion()}`;
    let target = row.querySelector?.(".fl-version-value, strong, b, em, code");
    if (!target) {
      const children = [...row.children];
      target = children.at(-1) || row;
    }
    if (target) target.textContent = value;
    row.dataset.flVersionSynced = "true";
  }

  function syncVersion() {
    const panel = settingsPanel();
    if (!panel) return;

    const rows = [...panel.querySelectorAll(".xiv-setting-row, label, div")];
    let versionRow = rows.find((row) => /瀑光版本|FlowLens\s*版本|版本/.test(row.textContent || "") && /v?\d+\.\d+\.\d+/.test(row.textContent || ""));

    if (!versionRow) {
      versionRow = makeVersionRow();
      const title = panel.querySelector("h3, .xiv-panel-title");
      if (title?.nextSibling) panel.insertBefore(versionRow, title.nextSibling);
      else panel.prepend(versionRow);
    }

    if (!versionRow.classList.contains("xiv-setting-row")) versionRow.classList.add("xiv-setting-row");
    versionRow.classList.add("fl-version-row");
    versionRow.dataset.flVersionRow = "true";
    setRowValue(versionRow);
  }

  function schedule() {
    clearTimeout(timer);
    timer = window.setTimeout(syncVersion, 80);
  }

  syncVersion();
  document.addEventListener("click", schedule, true);
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-active", "data-open", "class", "style"]
  });
})();
