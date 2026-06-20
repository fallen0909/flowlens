(() => {
  if (window.__flowLensVideoPreviewCardPatch) return;
  window.__flowLensVideoPreviewCardPatch = true;

  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
  let timer = 0;

  function injectStyle() {
    if (document.getElementById("fl-video-preview-card-style")) return;
    const style = document.createElement("style");
    style.id = "fl-video-preview-card-style";
    style.textContent = `
      #xiv-root .xiv-tile { position: relative !important; }
      #xiv-root .fl-video-preview-card {
        position: absolute !important;
        inset: 0 !important;
        z-index: 3 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 8px !important;
        border-radius: inherit !important;
        background: radial-gradient(circle at 50% 38%, rgba(70,78,96,.42), transparent 34%), linear-gradient(135deg, rgba(18,18,22,.98), rgba(37,39,46,.96)) !important;
        color: rgba(255,255,255,.94) !important;
        font: 900 13px/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        text-align: center !important;
        pointer-events: none !important;
        box-sizing: border-box !important;
      }
      #xiv-root .fl-video-preview-card::before {
        content: "";
        width: 50px !important;
        height: 50px !important;
        border-radius: 999px !important;
        background: rgba(255,255,255,.13) !important;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.18), 0 12px 32px rgba(0,0,0,.22) !important;
      }
      #xiv-root .fl-video-preview-card::after {
        content: "";
        position: absolute !important;
        left: calc(50% - 5px) !important;
        top: calc(50% - 25px) !important;
        width: 0 !important;
        height: 0 !important;
        border-top: 10px solid transparent !important;
        border-bottom: 10px solid transparent !important;
        border-left: 15px solid currentColor !important;
      }
      #xiv-root .fl-video-preview-card strong { margin-top: 2px !important; font-size: 14px !important; }
      #xiv-root .fl-video-preview-card span { opacity: .66 !important; font-size: 11px !important; font-weight: 750 !important; }
      #xiv-root[data-theme="light"] .fl-video-preview-card {
        background: radial-gradient(circle at 50% 38%, rgba(165,174,190,.5), transparent 34%), linear-gradient(135deg, rgba(232,235,241,.98), rgba(208,215,226,.96)) !important;
        color: rgba(24,27,34,.9) !important;
      }
      #xiv-root .xiv-tile[data-fl-has-real-cover="true"] .fl-video-preview-card { display: none !important; }
    `;
    document.documentElement.appendChild(style);
  }

  function isVideoTile(tile) {
    return VIDEO_RE.test(tile?.dataset?.url || "") || !!tile?.querySelector?.("video, .xiv-video-placeholder, .fl-video-cover-fallback");
  }

  function hasRealCover(tile) {
    const image = tile?.querySelector?.("img.fl-video-cover-img, img:not(.fl-video-preview-card img)");
    const fallback = tile?.querySelector?.(".fl-video-cover-fallback");
    return !!image || !!fallback;
  }

  function ensureCard(tile) {
    if (!tile || !isVideoTile(tile)) return;
    if (hasRealCover(tile)) {
      tile.dataset.flHasRealCover = "true";
      tile.querySelector?.(".fl-video-preview-card")?.remove();
      return;
    }
    tile.dataset.flHasRealCover = "false";
    if (tile.querySelector(".fl-video-preview-card")) return;
    const card = document.createElement("div");
    card.className = "fl-video-preview-card";
    card.innerHTML = `<strong>视频</strong><span>封面生成中，点击播放</span>`;
    tile.appendChild(card);
    tile.dataset.flVideoCoverStage = tile.dataset.flVideoCoverStage || "card";
  }

  function apply() {
    injectStyle();
    document.querySelectorAll("#xiv-root .xiv-tile").forEach(ensureCard);
  }

  function schedule() {
    clearTimeout(timer);
    timer = window.setTimeout(apply, 80);
  }

  injectStyle();
  schedule();
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "poster", "data-active", "data-url", "data-fl-video-cover-stage"]
  });
})();
