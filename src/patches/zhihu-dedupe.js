(() => {
  if (window.__flowLensZhihuDedupe) return;
  window.__flowLensZhihuDedupe = true;

  const isZhihuPage = () => /(^|\.)zhihu\.com$/i.test(location.hostname);
  if (!isZhihuPage()) return;

  let timer = 0;
  let observedRoot = null;
  let rootObserver = null;
  let bootstrapObserver = null;

  function mediaKey(raw) {
    if (!raw) return "";
    try {
      const url = new URL(String(raw).replace(/&amp;/g, "&"), location.href);
      const host = url.hostname.replace(/^i\d+\./i, "").toLowerCase();
      const path = decodeURIComponent(url.pathname || "").toLowerCase();
      const zhihu = path.match(/(?:^|\/)(v2-[a-f0-9]{16,})(?:_[^/.]+)?\.(?:jpe?g|png|webp|gif)/i);
      if (zhihu) return `zhimg:${zhihu[1].toLowerCase()}`;
      return `${host}${path.replace(/([_-])(?:small|middle|large|hd|origin|thumb|thumbnail|720w|1080w|1200w)(?=\.)/gi, "")}`;
    } catch {
      return String(raw).split(/[?#]/)[0].toLowerCase();
    }
  }

  function sourceOf(tile) {
    const media = tile.querySelector("img, video");
    if (!media) return "";
    if (media.tagName === "VIDEO") return media.currentSrc || media.src || media.poster || media.querySelector("source[src]")?.src || "";
    return media.currentSrc || media.src || media.getAttribute("data-original") || media.getAttribute("data-src") || "";
  }

  function dedupe() {
    const root = document.getElementById("xiv-root");
    if (!root) return;
    if (!document.getElementById("flowlens-zhihu-dedupe-style")) {
      const style = document.createElement("style");
      style.id = "flowlens-zhihu-dedupe-style";
      style.textContent = "#xiv-root .fl-dup-hidden{display:none!important}";
      document.documentElement.appendChild(style);
    }

    const seen = new Set();
    let hidden = 0;
    for (const tile of root.querySelectorAll(".xiv-tile,.xiv-card,[data-xiv-media]")) {
      const key = mediaKey(sourceOf(tile));
      if (!key) continue;
      const duplicate = seen.has(key);
      tile.classList.toggle("fl-dup-hidden", duplicate);
      if (duplicate) hidden += 1;
      else seen.add(key);
    }
    root.dataset.zhihuDedupeHidden = String(hidden);
  }

  function schedule() {
    clearTimeout(timer);
    timer = window.setTimeout(dedupe, 180);
  }

  function observeRoot() {
    const root = document.getElementById("xiv-root");
    if (!root || root === observedRoot) return;
    rootObserver?.disconnect();
    observedRoot = root;
    rootObserver = new MutationObserver(schedule);
    rootObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "poster"] });
    schedule();
  }

  bootstrapObserver = new MutationObserver(observeRoot);
  bootstrapObserver.observe(document.documentElement, { childList: true, subtree: true });
  observeRoot();
})();
