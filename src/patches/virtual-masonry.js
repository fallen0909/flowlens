(() => {
  if (window.__flowLensVirtualMasonry) return;
  window.__flowLensVirtualMasonry = true;

  const STORE_KEY = "flowlens-virtual-masonry-v1";
  const savedMedia = new WeakMap();
  let observer = null;
  let scanTimer = 0;

  function config() {
    try {
      return { enabled: true, ...(JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {}) };
    } catch {
      return { enabled: true };
    }
  }

  function writeConfig(next) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...config(), ...next })); } catch {}
    syncSettingsUi();
    scan();
  }

  function stage() { return document.getElementById("xiv-stage"); }
  function tiles() { return [...document.querySelectorAll("#xiv-grid .xiv-tile")]; }

  function mediaRatio(media, tile) {
    const style = media?.style?.aspectRatio || "";
    const match = style.match(/([0-9.]+)\s*\/\s*([0-9.]+)/);
    if (match) return Math.max(0.18, Math.min(5, Number(match[1]) / Math.max(1, Number(match[2]))));
    const w = media?.naturalWidth || media?.videoWidth || 0;
    const h = media?.naturalHeight || media?.videoHeight || 0;
    if (w > 0 && h > 0) return Math.max(0.18, Math.min(5, w / h));
    const rect = tile?.getBoundingClientRect?.();
    if (rect?.width > 0 && rect?.height > 0) return Math.max(0.18, Math.min(5, rect.width / rect.height));
    return 0.72;
  }

  function placeholder(ratio) {
    const node = document.createElement("div");
    node.className = "fl-virtual-placeholder";
    node.style.aspectRatio = `${ratio} / 1`;
    return node;
  }

  function park(tile) {
    if (savedMedia.has(tile)) return;
    const media = tile.querySelector("img, video, iframe, .xiv-video-placeholder");
    if (!media) return;
    const ph = placeholder(mediaRatio(media, tile));
    savedMedia.set(tile, { media, placeholder: ph });
    media.replaceWith(ph);
    tile.dataset.flVirtual = "parked";
  }

  function restore(tile) {
    const saved = savedMedia.get(tile);
    if (!saved) return;
    saved.placeholder.replaceWith(saved.media);
    savedMedia.delete(tile);
    delete tile.dataset.flVirtual;
  }

  function installStyle() {
    if (document.getElementById("fl-virtual-masonry-style")) return;
    const style = document.createElement("style");
    style.id = "fl-virtual-masonry-style";
    style.textContent = `
      #xiv-grid .xiv-tile { content-visibility: auto; contain-intrinsic-size: 260px 380px; }
      .fl-virtual-placeholder { width: 100%; min-height: 120px; background: linear-gradient(135deg, rgba(120,120,120,.12), rgba(80,80,80,.18)); border-radius: inherit; }
      .fl-vm-section { margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.14); }
      .fl-vm-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 8px 0; font-size: 13px; }
    `;
    document.documentElement.appendChild(style);
  }

  function scan() {
    clearTimeout(scanTimer);
    const root = stage();
    if (!root) return;
    const enabled = config().enabled;
    const rootRect = root.getBoundingClientRect();
    const margin = Math.max(900, root.clientHeight * 1.6);
    for (const tile of tiles()) {
      if (!enabled) {
        restore(tile);
        continue;
      }
      const rect = tile.getBoundingClientRect();
      const near = rect.bottom >= rootRect.top - margin && rect.top <= rootRect.bottom + margin;
      if (near) restore(tile);
      else park(tile);
    }
  }

  function ensureObserver() {
    const root = stage();
    if (!root || observer) return;
    observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.getElementById("xiv-grid") || root, { childList: true, subtree: true });
    root.addEventListener("scroll", scheduleScan, { passive: true });
    window.addEventListener("resize", scheduleScan, { passive: true });
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 100);
  }

  function ensureSettingsUi() {
    const panel = document.querySelector(".xiv-panel[data-panel='settings']");
    if (!panel || panel.querySelector(".fl-vm-section")) return;
    const section = document.createElement("section");
    section.className = "fl-vm-section";
    section.innerHTML = `<h4>性能优化</h4><label class="fl-vm-row"><span>虚拟瀑布流</span><input type="checkbox" data-fl-vm="enabled"></label><small>只保留屏幕附近图片节点，远处图片用占位块暂存，滚动到附近再恢复。</small>`;
    panel.appendChild(section);
    section.addEventListener("change", (event) => {
      if (event.target?.dataset?.flVm === "enabled") writeConfig({ enabled: event.target.checked });
    });
    syncSettingsUi();
  }

  function syncSettingsUi() {
    const checkbox = document.querySelector("[data-fl-vm='enabled']");
    if (checkbox) checkbox.checked = !!config().enabled;
  }

  installStyle();
  const boot = new MutationObserver(() => { ensureSettingsUi(); ensureObserver(); scheduleScan(); });
  if (document.documentElement) boot.observe(document.documentElement, { childList: true, subtree: true });
  ensureSettingsUi();
  ensureObserver();
  scheduleScan();
})();
