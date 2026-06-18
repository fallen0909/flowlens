(() => {
  if (window.__flowLensMediaSyncPatch) return;
  window.__flowLensMediaSyncPatch = true;

  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
  let observer = null;
  let refreshTimer = 0;

  function isVideoUrl(url) {
    return VIDEO_RE.test(String(url || ""));
  }

  function ensureStyle() {
    if (document.getElementById("xiv-media-sync-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-media-sync-style";
    style.textContent = `
      #xiv-root[data-fl-media-buttons="true"] #xiv-topbar .xiv-select[data-xiv="filter"] {
        display: none !important;
      }
      #xiv-root .xiv-media-switch {
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        min-height: 38px;
        padding: 3px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.16);
        background: rgba(18,18,20,.74);
        backdrop-filter: blur(12px);
      }
      #xiv-root[data-theme="light"] .xiv-media-switch {
        background: rgba(255,255,255,.78);
        border-color: rgba(0,0,0,.12);
      }
      #xiv-root .xiv-media-switch button {
        height: 30px;
        min-width: 48px;
        padding: 0 10px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: rgba(255,255,255,.76);
        font: 850 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
        white-space: nowrap;
      }
      #xiv-root[data-theme="light"] .xiv-media-switch button {
        color: rgba(20,20,20,.72);
      }
      #xiv-root .xiv-media-switch button[data-active="true"] {
        background: rgba(255,255,255,.94);
        color: #111;
        box-shadow: 0 6px 18px rgba(0,0,0,.22);
      }
      #xiv-root[data-theme="light"] .xiv-media-switch button[data-active="true"] {
        background: #111;
        color: #fff;
      }
      @media (max-width: 820px) {
        #xiv-root .xiv-media-switch {
          gap: 3px;
          min-height: 34px;
          padding: 2px;
        }
        #xiv-root .xiv-media-switch button {
          height: 30px;
          min-width: 40px;
          padding: 0 8px;
          font-size: 12px;
        }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function root() {
    return document.getElementById("xiv-root");
  }

  function filterSelect() {
    return root()?.querySelector('#xiv-topbar .xiv-select[data-xiv="filter"]');
  }

  function mediaCounts() {
    const tiles = [...(root()?.querySelectorAll(".xiv-tile") || [])];
    let image = 0;
    let video = 0;
    for (const tile of tiles) {
      const url = tile.dataset.url || "";
      const hasVideo = isVideoUrl(url) || !!tile.querySelector("video");
      if (hasVideo) video += 1;
      else image += 1;
    }
    return { all: image + video, image, video };
  }

  function buttonLabel(value, count) {
    if (value === "image") return `图片 ${count}`;
    if (value === "video") return `视频 ${count}`;
    return `全部 ${count}`;
  }

  function setFilter(value) {
    const select = filterSelect();
    if (!select) return;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    refreshControls();
  }

  function ensureControls() {
    const app = root();
    const select = filterSelect();
    if (!app || !select) return;
    ensureStyle();
    app.dataset.flMediaButtons = "true";
    if (!app.querySelector(".xiv-media-switch")) {
      const group = document.createElement("div");
      group.className = "xiv-media-switch";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "媒体类型切换");
      group.innerHTML = `
        <button type="button" data-fl-filter="all">全部</button>
        <button type="button" data-fl-filter="image">图片</button>
        <button type="button" data-fl-filter="video">视频</button>
      `;
      group.addEventListener("click", (event) => {
        const button = event.target?.closest?.("button[data-fl-filter]");
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        setFilter(button.dataset.flFilter || "all");
      });
      select.parentElement?.insertBefore(group, select);
      select.addEventListener("change", refreshControls);
    }
    refreshControls();
  }

  function refreshControls() {
    const app = root();
    const select = filterSelect();
    const group = app?.querySelector(".xiv-media-switch");
    if (!app || !select || !group) return;
    const value = select.value || "all";
    const counts = mediaCounts();
    group.querySelectorAll("button[data-fl-filter]").forEach((button) => {
      const mode = button.dataset.flFilter || "all";
      button.dataset.active = mode === value ? "true" : "false";
      button.textContent = buttonLabel(mode, counts[mode] || 0);
      button.title = mode === "all" ? "显示全部媒体" : mode === "image" ? "只显示图片" : "只显示视频";
    });
  }

  function playVideoElement(video) {
    if (!video) return;
    try {
      video.autoplay = true;
      video.controls = true;
      video.preload = "auto";
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      const run = () => {
        const p = video.play?.();
        if (p?.catch) {
          p.catch(() => {
            try {
              video.muted = true;
              video.setAttribute("muted", "");
              video.play?.().catch?.(() => {});
            } catch {
              // Ignore autoplay failures caused by browser policy.
            }
          });
        }
      };
      if (video.readyState >= 2) run();
      else {
        video.addEventListener("loadedmetadata", run, { once: true });
        video.addEventListener("canplay", run, { once: true });
      }
      setTimeout(run, 80);
      setTimeout(run, 360);
    } catch {
      // Ignore restricted media elements.
    }
  }

  function playIframeVideo(iframe) {
    if (!iframe) return;
    try {
      iframe.allow = `${iframe.allow || ""}; autoplay; fullscreen; picture-in-picture`;
      const run = () => {
        try {
          iframe.contentDocument?.querySelectorAll("video").forEach(playVideoElement);
        } catch {
          // Some iframes are not script-accessible.
        }
      };
      iframe.addEventListener("load", run, { once: true });
      setTimeout(run, 120);
      setTimeout(run, 520);
    } catch {
      // Ignore inaccessible iframe media.
    }
  }

  function ensureLightboxAutoplay() {
    const lightbox = root()?.querySelector("#xiv-lightbox");
    if (!lightbox || lightbox.dataset.active !== "true") return;
    lightbox.querySelectorAll("video").forEach(playVideoElement);
    lightbox.querySelectorAll("iframe").forEach(playIframeVideo);
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      ensureControls();
      refreshControls();
      ensureLightboxAutoplay();
    }, 80);
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-active", "hidden", "src", "data-url"]
    });
  }

  document.addEventListener("click", () => setTimeout(ensureLightboxAutoplay, 120), true);
  document.addEventListener("keydown", () => setTimeout(ensureLightboxAutoplay, 120), true);
  startObserver();
  scheduleRefresh();
})();
