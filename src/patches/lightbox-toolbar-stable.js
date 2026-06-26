(() => {
  if (window.__flowLensLightboxStableToolbar) return;
  window.__flowLensLightboxStableToolbar = true;

  const STYLE_ID = "flowlens-lightbox-stable-toolbar-style";
  const TOOLBAR_ID = "fl-lightbox-stable-toolbar";
  const SIZE = 46;
  const GAP = 8;
  const RIGHT = 14;
  const HEART_RED = "#e11d48";
  let timer = 0;

  function lb() {
    const node = document.getElementById("xiv-lightbox");
    return node?.dataset.active === "true" ? node : null;
  }

  function claim(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #xiv-lightbox > .xiv-lightbox-slideshow,
      #xiv-lightbox > .xiv-lightbox-fav,
      #xiv-lightbox > .xiv-lightbox-close {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
        transform: none !important;
        transition: none !important;
      }
      #${TOOLBAR_ID} {
        position: fixed;
        top: max(10px, env(safe-area-inset-top, 0px) + 10px);
        right: ${RIGHT}px;
        z-index: 2147483647;
        display: none;
        gap: ${GAP}px;
        align-items: center;
        pointer-events: auto;
      }
      #${TOOLBAR_ID}[data-active="true"] { display: flex; }
      #${TOOLBAR_ID} button {
        width: ${SIZE}px;
        height: ${SIZE}px;
        min-width: ${SIZE}px;
        min-height: ${SIZE}px;
        border-radius: 999px;
        border: 1px solid rgba(0,0,0,.14);
        background: rgba(255,255,255,.96);
        color: #111;
        box-shadow: 0 1px 4px rgba(0,0,0,.10);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0;
        opacity: 1;
        visibility: visible;
        cursor: pointer;
        transform: translateZ(0);
        transition: none;
        -webkit-tap-highlight-color: transparent;
      }
      #${TOOLBAR_ID} button[data-role="fav"][data-favorited="true"] {
        color: ${HEART_RED};
        border-color: rgba(225,29,72,.28);
      }
      #${TOOLBAR_ID} svg {
        display: block;
        width: 24px;
        height: 24px;
        color: currentColor;
        stroke: currentColor;
      }
      #${TOOLBAR_ID} svg path,
      #${TOOLBAR_ID} svg rect {
        fill: currentColor;
      }
      #${TOOLBAR_ID} button[data-role="fav"] svg path {
        fill: none;
        stroke: currentColor;
        stroke-width: 2.6;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      #${TOOLBAR_ID} button[data-role="fav"][data-favorited="true"] svg path {
        fill: ${HEART_RED};
        stroke: ${HEART_RED};
      }
      #${TOOLBAR_ID} button[data-role="close"] svg path {
        fill: none;
        stroke: currentColor;
        stroke-width: 2.6;
        stroke-linecap: round;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function svg(name) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    node.setAttribute("viewBox", "0 0 24 24");
    node.setAttribute("aria-hidden", "true");
    if (name === "play") {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.4 0-1.8L9.6 4.9C8.9 4.5 8 5 8 5.8Z");
      node.appendChild(path);
    } else if (name === "pause") {
      [[7, 5], [13.2, 5]].forEach(([x, y]) => {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", "3.8");
        rect.setAttribute("height", "14");
        rect.setAttribute("rx", "1.2");
        node.appendChild(rect);
      });
    } else if (name === "heart") {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M20.8 5.8c-1.9-2-5-1.8-6.8.4L12 8.5l-2-2.3C8.1 4 5 3.8 3.2 5.8c-2 2.1-1.8 5.5.3 7.4l8.5 7.1 8.5-7.1c2.1-1.9 2.3-5.3.3-7.4Z");
      node.appendChild(path);
    } else {
      const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path1.setAttribute("d", "M6 6l12 12");
      path2.setAttribute("d", "M18 6L6 18");
      node.append(path1, path2);
    }
    return node;
  }

  function ensureToolbar() {
    let bar = document.getElementById(TOOLBAR_ID);
    if (bar) return bar;
    bar = document.createElement("div");
    bar.id = TOOLBAR_ID;
    const play = button("play", "自动切换", "play");
    const fav = button("heart", "收藏", "fav");
    const close = button("close", "关闭", "close");
    bar.append(play, fav, close);
    document.documentElement.appendChild(bar);
    return bar;
  }

  function button(icon, title, role) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.role = role;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.appendChild(svg(icon));
    btn.addEventListener("pointerdown", claim, true);
    btn.addEventListener("click", onToolbarClick, true);
    return btn;
  }

  function internalButton(role) {
    const box = lb();
    if (!box) return null;
    if (role === "play") return box.querySelector(".xiv-lightbox-slideshow");
    if (role === "fav") return box.querySelector(".xiv-lightbox-fav");
    return box.querySelector(".xiv-lightbox-close");
  }

  function clickInternal(role) {
    const target = internalButton(role);
    if (!target) return;
    if (role === "play") {
      target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, button: 0 }));
    } else {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }
  }

  function onToolbarClick(event) {
    claim(event);
    const role = event.currentTarget?.dataset?.role || "";
    if (!lb() || !role) return;
    clickInternal(role);
    schedule(30);
  }

  function setIcon(btn, name) {
    if (!btn || btn.dataset.icon === name) return;
    btn.dataset.icon = name;
    btn.textContent = "";
    btn.appendChild(svg(name));
  }

  function sync() {
    installStyle();
    const box = lb();
    const bar = ensureToolbar();
    bar.dataset.active = box ? "true" : "false";
    if (!box) return;
    const playInternal = internalButton("play");
    const favInternal = internalButton("fav");
    const play = bar.querySelector('[data-role="play"]');
    const fav = bar.querySelector('[data-role="fav"]');
    const close = bar.querySelector('[data-role="close"]');
    const playing = playInternal?.dataset.active === "true";
    setIcon(play, playing ? "pause" : "play");
    play.title = playing ? "暂停自动切换" : "开始自动切换";
    play.setAttribute("aria-label", play.title);
    fav.dataset.favorited = favInternal?.dataset.favorited === "true" ? "true" : "false";
    close.title = "关闭";
  }

  function schedule(delay = 40) {
    clearTimeout(timer);
    timer = window.setTimeout(sync, delay);
  }

  installStyle();
  ensureToolbar();
  window.addEventListener("flowlens:slideshow-state", () => schedule(0));
  document.addEventListener("click", () => schedule(20), true);
  document.addEventListener("pointerup", () => schedule(20), true);
  document.addEventListener("keydown", () => schedule(20), true);
  const observer = new MutationObserver(() => schedule(60));
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "data-favorited", "data-role"] });
  schedule(0);
})();
