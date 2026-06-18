(() => {
  if (window.__flowLensLightboxStable) return;
  window.__flowLensLightboxStable = true;

  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
  let lastKey = "";
  let skipLockUntil = 0;

  const css = `
    #xiv-lightbox,
    #xiv-lightbox *,
    #xiv-lightbox .xiv-fl-media-anim,
    #xiv-lightbox[data-fl-dir] .xiv-fl-media-anim {
      animation: none !important;
      transition: none !important;
    }
    #xiv-lightbox img,
    #xiv-lightbox video,
    #xiv-lightbox iframe,
    #xiv-lightbox .xiv-video-frame {
      opacity: 1 !important;
      filter: none !important;
      transform: none !important;
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-fl-lightbox-stable-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-fl-lightbox-stable-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function activeLightbox() {
    const lightbox = document.getElementById("xiv-lightbox");
    return lightbox?.dataset.active === "true" ? lightbox : null;
  }

  function mediaUrlFromLightbox() {
    const lb = activeLightbox();
    if (!lb) return "";
    const media = lb.querySelector("img, video, iframe[data-media-url], .xiv-video-frame[data-media-url]");
    return media?.dataset?.mediaUrl || media?.dataset?.sourceUrl || media?.currentSrc || media?.src || "";
  }

  function mediaKey(url) {
    const text = String(url || "");
    if (!text) return "";
    try {
      const parsed = new URL(text, location.href);
      parsed.hash = "";
      const zhihu = parsed.hostname.includes("zhimg.com") && parsed.pathname.match(/\/(?:\d+\/)?(v2-[A-Za-z0-9]+)(?:[_-][^/.]+)?\./i)?.[1];
      if (zhihu) return `zhihu:${zhihu.toLowerCase()}`;
      if (VIDEO_RE.test(parsed.pathname)) return `video:${parsed.href}`;
      parsed.search = parsed.search.replace(/([?&])(source|utm_[^=&]+|from|fd|fmt|width|height|quality|token)=[^&]*/gi, "");
      return parsed.href.replace(/_(?:\d+w|r|b|hd)(?=\.)/i, "");
    } catch {
      const zhihu = text.match(/\/(?:\d+\/)?(v2-[A-Za-z0-9]+)(?:[_-][^/.]+)?\./i)?.[1];
      return zhihu ? `zhihu:${zhihu.toLowerCase()}` : text.replace(/[?#].*$/, "");
    }
  }

  function clickArrow(direction) {
    const lb = activeLightbox();
    if (!lb) return false;
    const selector = direction > 0 ? '.xiv-lightbox-arrow[data-side="right"]' : '.xiv-lightbox-arrow[data-side="left"]';
    const arrow = lb.querySelector(selector);
    if (!arrow) return false;
    arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }

  function currentKey() {
    return mediaKey(mediaUrlFromLightbox());
  }

  function skipDuplicate(direction) {
    if (Date.now() < skipLockUntil) return;
    const key = currentKey();
    if (!key || !lastKey || key !== lastKey) {
      lastKey = key;
      return;
    }
    skipLockUntil = Date.now() + 500;
    let hops = 0;
    const hop = () => {
      if (!activeLightbox() || hops >= 4) return;
      hops += 1;
      clickArrow(direction);
      window.setTimeout(() => {
        const nextKey = currentKey();
        if (nextKey && nextKey !== lastKey) {
          lastKey = nextKey;
          return;
        }
        hop();
      }, 90);
    };
    hop();
  }

  function rememberDirection(direction) {
    window.__flowLensLastLightboxDirection = direction;
    lastKey = currentKey() || lastKey;
    window.setTimeout(() => skipDuplicate(direction), 120);
  }

  document.addEventListener("keydown", (event) => {
    if (!activeLightbox()) return;
    if (event.key === "ArrowRight") rememberDirection(1);
    else if (event.key === "ArrowLeft") rememberDirection(-1);
  }, true);

  document.addEventListener("click", (event) => {
    const arrow = event.target?.closest?.(".xiv-lightbox-arrow");
    if (!arrow || !activeLightbox()) return;
    rememberDirection(arrow.dataset.side === "left" ? -1 : 1);
  }, true);

  document.addEventListener("wheel", (event) => {
    if (!activeLightbox()) return;
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) > 4) rememberDirection(delta > 0 ? 1 : -1);
  }, true);

  new MutationObserver(() => {
    injectStyle();
    const lb = activeLightbox();
    if (!lb) {
      lastKey = "";
      return;
    }
    const key = currentKey();
    if (key && !lastKey) lastKey = key;
    lb.querySelectorAll(".xiv-fl-media-anim").forEach((node) => node.classList.remove("xiv-fl-media-anim"));
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "class", "data-active"] });

  injectStyle();
})();
