(() => {
  const KEY = "flowlens-settings-v2";
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
    downloadFolder: ""
  };

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
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

  function fill(settings) {
    $("columns").value = clamp(settings.columns, 2, 8, 3);
    $("theme").value = ["system", "dark", "light"].includes(settings.theme) ? settings.theme : "system";
    $("autoFullscreen").checked = settings.autoFullscreen !== false;
    $("videoPreview").checked = settings.videoPreview !== false;
    $("launchHidden").checked = settings.launchHidden === true;
    $("autoScrollSpeed").value = clamp(settings.autoScrollSpeed, 1, 10, 3);
    $("downloadFolder").value = settings.downloadFolder || "";
  }

  function collect() {
    return {
      ...DEFAULTS,
      columns: clamp($("columns").value, 2, 8, 3),
      theme: $("theme").value,
      autoFullscreen: $("autoFullscreen").checked,
      videoPreview: $("videoPreview").checked,
      launchHidden: $("launchHidden").checked,
      autoScrollSpeed: clamp($("autoScrollSpeed").value, 1, 10, 3),
      downloadFolder: $("downloadFolder").value.trim()
    };
  }

  function status(text) {
    const node = $("status");
    node.textContent = text;
    clearTimeout(Number(node.dataset.timer || 0));
    node.dataset.timer = String(setTimeout(() => { node.textContent = ""; }, 2200));
  }

  read(fill);
  $("save").addEventListener("click", () => write(collect(), () => status("设置已保存，刷新网页后完全生效。")));
  $("reset").addEventListener("click", () => {
    fill(DEFAULTS);
    write(DEFAULTS, () => status("已恢复默认设置。"));
  });
})();
