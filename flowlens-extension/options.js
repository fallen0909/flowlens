(() => {
  const KEY = "flowlens-settings-v2";
  const SPEEDS = [800, 1200, 1800, 2400, 3200];
  const DEFAULTS = {
    launchCompact: false,
    launchHidden: false,
    launchX: 0,
    launchY: 0,
    columns: 3,
    theme: "system",
    autoScrollSpeed: 3,
    autoFullscreen: true,
    videoPreview: true,
    downloadFolder: "",
    lightboxAutoDelay: 1200
  };

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  function nearestSpeed(value) {
    const raw = Number(value || DEFAULTS.lightboxAutoDelay);
    return SPEEDS.reduce((best, item) => Math.abs(item - raw) < Math.abs(best - raw) ? item : best, SPEEDS[0]);
  }

  function speedLabel(ms) {
    if (ms <= 800) return "Fast";
    if (ms <= 1200) return "Default";
    if (ms <= 1800) return "Quick";
    if (ms <= 2400) return "Normal";
    return "Slow";
  }

  function read(callback) {
    try {
      chrome.storage.local.get(KEY, (result) => {
        const stored = result?.[KEY] || {};
        callback({ ...DEFAULTS, ...stored });
      });
    } catch {
      callback({ ...DEFAULTS });
    }
  }

  function write(settings, callback) {
    try {
      chrome.storage.local.set({ [KEY]: settings }, callback);
    } catch {
      callback?.();
    }
  }

  function $(id) { return document.getElementById(id); }

  let current = { ...DEFAULTS };

  function updateSpeedLabel() {
    const ms = nearestSpeed(current.lightboxAutoDelay);
    const node = $("lightboxSpeedLabel");
    if (node) node.textContent = `${speedLabel(ms)} ${Math.round(ms / 100) / 10}秒`;
  }

  function changeSpeed(delta) {
    const ms = nearestSpeed(current.lightboxAutoDelay);
    const index = Math.max(0, SPEEDS.indexOf(ms));
    current.lightboxAutoDelay = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, index + delta))];
    updateSpeedLabel();
  }

  function fill(settings) {
    current = { ...DEFAULTS, ...settings, lightboxAutoDelay: nearestSpeed(settings.lightboxAutoDelay) };
    $("columns").value = clamp(current.columns, 2, 8, 3);
    $("theme").value = ["system", "dark", "light"].includes(current.theme) ? current.theme : "system";
    $("autoFullscreen").checked = current.autoFullscreen !== false;
    $("videoPreview").checked = current.videoPreview !== false;
    $("launchHidden").checked = current.launchHidden === true;
    $("autoScrollSpeed").value = clamp(current.autoScrollSpeed, 1, 10, 3);
    $("downloadFolder").value = current.downloadFolder || "";
    updateSpeedLabel();
  }

  function collect() {
    return {
      ...current,
      columns: clamp($("columns").value, 2, 8, 3),
      theme: $("theme").value,
      autoFullscreen: $("autoFullscreen").checked,
      videoPreview: $("videoPreview").checked,
      launchHidden: $("launchHidden").checked,
      autoScrollSpeed: clamp($("autoScrollSpeed").value, 1, 10, 3),
      downloadFolder: $("downloadFolder").value.trim(),
      lightboxAutoDelay: nearestSpeed(current.lightboxAutoDelay)
    };
  }

  function status(text) {
    const node = $("status");
    node.textContent = text;
    clearTimeout(Number(node.dataset.timer || 0));
    node.dataset.timer = String(setTimeout(() => { node.textContent = ""; }, 2200));
  }

  read(fill);
  $("lightboxSpeedSlower")?.addEventListener("click", () => changeSpeed(1));
  $("lightboxSpeedFaster")?.addEventListener("click", () => changeSpeed(-1));
  $("save").addEventListener("click", () => write(collect(), () => status("设置已保存，刷新网页后完全生效。")));
  $("reset").addEventListener("click", () => {
    fill(DEFAULTS);
    write(DEFAULTS, () => status("已恢复默认设置。"));
  });
})();
