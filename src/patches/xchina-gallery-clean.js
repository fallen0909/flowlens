(() => {
  if (window.__flowLensXchinaGalleryClean) return;
  window.__flowLensXchinaGalleryClean = true;

  function isXchinaPhotoPage() {
    try {
      const parsed = new URL(location.href);
      return /(^|\.)xchina\.co$/i.test(parsed.hostname) && /^\/photo\/id-/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function info(value) {
    try {
      const parsed = new URL(String(value || ""), location.href);
      return { host: parsed.hostname.toLowerCase(), path: parsed.pathname.toLowerCase(), href: parsed.href };
    } catch {
      return { host: "", path: String(value || "").toLowerCase(), href: String(value || "") };
    }
  }

  function strictReason(url, node) {
    if (!url || !isXchinaPhotoPage()) return "";
    const data = info(url);
    const file = data.path.split("/").pop() || "";
    if (file === "6a38baf0e4f9b.webp" || file === "6914a1e352a47.webp") return "xchina 已知推广图";
    if (data.host === "upload.xchina.io" && /\/media\//i.test(data.path)) return "xchina 封面/推广素材";
    const text = [node?.textContent, node?.getAttribute?.("alt"), node?.getAttribute?.("title")].join(" ");
    if (/galgameclub|姬游社|PC\+安卓|APP下载|删除被禁止|收录绝版/i.test(text)) return "xchina 推广图";
    return "";
  }

  function install() {
    const filter = window.__flowLensMediaFilter;
    if (!filter || filter.__xchinaGalleryClean) return;
    const original = filter.reasonFor?.bind(filter);
    filter.reasonFor = (url, node = null) => {
      const strict = strictReason(url, node);
      if (strict) return strict;
      const reason = original?.(url, node) || "";
      if (reason === "横幅比例" || reason === "周边文字") return "";
      return reason;
    };
    filter.__xchinaGalleryClean = true;
    setTimeout(() => {
      try { filter.applyFilters?.(); } catch {}
      try { window.__flowLensControl?.compactVisibleLabels?.(); } catch {}
    }, 180);
  }

  const timer = setInterval(() => {
    install();
    if (window.__flowLensMediaFilter?.__xchinaGalleryClean) clearInterval(timer);
  }, 120);
  install();
})();
