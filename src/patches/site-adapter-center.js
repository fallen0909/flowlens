(() => {
  if (window.__flowLensSiteAdapterCenter) return;
  window.__flowLensSiteAdapterCenter = true;

  let timer = 0;

  function root() { return document.getElementById("xiv-root"); }
  function panel() { return root()?.querySelector(".xiv-panel[data-panel='settings']"); }
  function status() {
    try { return window.__flowLensControl?.getAdapterStatus?.() || null; } catch { return null; }
  }
  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function installStyle() {
    if (document.getElementById("fl-site-adapter-style")) return;
    const style = document.createElement("style");
    style.id = "fl-site-adapter-style";
    style.textContent = `
      #xiv-root .fl-site-adapter-section {
        margin-top: 12px !important;
        padding-top: 12px !important;
        border-top: 1px solid rgba(255,255,255,.14) !important;
      }
      #xiv-root[data-theme="light"] .fl-site-adapter-section {
        border-top-color: rgba(0,0,0,.1) !important;
      }
      #xiv-root .fl-site-adapter-section h4 {
        margin: 0 0 9px !important;
        font-size: 14px !important;
      }
      #xiv-root .fl-site-adapter-grid {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 7px !important;
      }
      #xiv-root .fl-site-adapter-card {
        min-width: 0 !important;
        padding: 9px !important;
        border-radius: 10px !important;
        background: rgba(255,255,255,.08) !important;
      }
      #xiv-root[data-theme="light"] .fl-site-adapter-card {
        background: rgba(0,0,0,.045) !important;
      }
      #xiv-root .fl-site-adapter-card b,
      #xiv-root .fl-site-adapter-card span {
        display: block !important;
        min-width: 0 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }
      #xiv-root .fl-site-adapter-card b {
        font-size: 11px !important;
        opacity: .62 !important;
        margin-bottom: 4px !important;
      }
      #xiv-root .fl-site-adapter-card span {
        font-size: 13px !important;
        font-weight: 850 !important;
      }
      #xiv-root .fl-site-adapter-tags {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 6px !important;
        margin: 8px 0 !important;
      }
      #xiv-root .fl-site-adapter-tags span {
        max-width: 100% !important;
        padding: 5px 8px !important;
        border-radius: 999px !important;
        background: rgba(79,140,255,.18) !important;
        color: inherit !important;
        font-size: 12px !important;
        font-weight: 850 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }
      @media (max-width: 560px) {
        #xiv-root .fl-site-adapter-grid { grid-template-columns: 1fr !important; }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function render() {
    const target = panel();
    if (!target) return;
    installStyle();
    let section = target.querySelector(".fl-site-adapter-section");
    if (!section) {
      section = document.createElement("section");
      section.className = "fl-site-adapter-section";
      target.appendChild(section);
    }
    const data = status();
    if (!data) {
      section.innerHTML = "<h4>站点适配中心</h4><small>等待 FlowLens 初始化。</small>";
      return;
    }
    const media = data.media || {};
    const pages = data.pages || {};
    const queue = data.queue || {};
    section.innerHTML = `
      <h4>站点适配中心</h4>
      <div class="fl-site-adapter-tags">${(data.adapters || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      <div class="fl-site-adapter-grid">
        <div class="fl-site-adapter-card"><b>当前站点</b><span title="${escapeHtml(data.url)}">${escapeHtml(data.site)}</span></div>
        <div class="fl-site-adapter-card"><b>采集策略</b><span>${escapeHtml(data.strategy)}</span></div>
        <div class="fl-site-adapter-card"><b>媒体</b><span>${media.visible ?? 0}/${media.total ?? 0}${media.expected ? ` / 预估 ${media.expected}` : ""}</span></div>
        <div class="fl-site-adapter-card"><b>分页</b><span>${pages.fetched ?? 0}/${pages.known ?? 0}${pages.fetching ? " 采集中" : ""}${pages.failures ? `，失败 ${pages.failures}` : ""}</span></div>
        <div class="fl-site-adapter-card"><b>渲染</b><span>${media.rendered ?? 0}${media.queuedRender ? `，待渲染 ${media.queuedRender}` : ""}</span></div>
        <div class="fl-site-adapter-card"><b>组图队列</b><span>${queue.total ? `${Math.max(0, queue.index + 1)}/${queue.total}` : "未识别"}</span></div>
      </div>
    `;
  }

  function scheduleRender() {
    clearTimeout(timer);
    timer = window.setTimeout(render, 120);
  }

  const observer = new MutationObserver(scheduleRender);
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "data-open"] });
  window.addEventListener("flowlens:gallery-items-rendered", scheduleRender);
  window.addEventListener("flowlens:media-filter-applied", scheduleRender);
  document.addEventListener("click", scheduleRender, true);
  scheduleRender();
})();
