(() => {
  if (window.__flowLensVisibleSequenceSafe) return;
  window.__flowLensVisibleSequenceSafe = true;

  const nativeAdd = EventTarget.prototype.addEventListener;
  const wrapped = new WeakMap();
  let labelTimer = 0;
  let opening = false;

  function box() {
    const node = document.getElementById("xiv-lightbox");
    return node?.dataset.active === "true" ? node : null;
  }

  function filter() {
    return window.__flowLensMediaFilter || null;
  }

  function reason(url, node = null) {
    try { return filter()?.reasonFor?.(url, node) || ""; } catch { return ""; }
  }

  function tiles() {
    return [...document.querySelectorAll("#xiv-grid .xiv-tile")]
      .filter((tile) => tile.isConnected)
      .sort((a, b) => Number(a.dataset.index || 0) - Number(b.dataset.index || 0));
  }

  function isVisibleTile(tile) {
    if (!tile || tile.hidden || tile.style.display === "none") return false;
    return !reason(tile.dataset.url || "", tile);
  }

  function visibleTiles() {
    return tiles().filter(isVisibleTile);
  }

  function currentIndex() {
    return Number(window.__flowLensControl?.getLightboxIndex?.());
  }

  function relTile(delta) {
    const list = visibleTiles();
    if (!list.length) return null;
    const current = currentIndex();
    let pos = list.findIndex((tile) => Number(tile.dataset.index || -1) === current);
    if (pos < 0) pos = delta >= 0 ? 0 : list.length - 1;
    return list[(pos + (delta >= 0 ? 1 : -1) + list.length) % list.length] || null;
  }

  function openTile(tile) {
    if (!tile || opening) return false;
    opening = true;
    try {
      tile.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX: 2, clientY: 2 }));
      tile.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, clientX: 2, clientY: 2, view: window }));
    } finally {
      setTimeout(() => { opening = false; compactLabels(); }, 80);
    }
    return true;
  }

  function jump(delta) {
    compactLabels();
    return openTile(relTile(delta));
  }

  window.__flowLensVisibleSequenceJump = jump;

  function currentUrl() {
    const lb = box();
    if (!lb) return "";
    const media = lb.querySelector(":scope > img, :scope > video, :scope > iframe, :scope > .xiv-video-frame");
    return media?.currentSrc || media?.src || media?.dataset?.mediaUrl || media?.dataset?.sourceUrl || "";
  }

  function compactLabels() {
    const list = visibleTiles();
    list.forEach((tile, i) => {
      const nextIndex = String(i);
      if (tile.dataset.flVisibleIndex !== nextIndex) tile.dataset.flVisibleIndex = nextIndex;
      const label = [...tile.children].find((node) => node.tagName === "SPAN") || tile.querySelector("span");
      const nextText = String(i + 1).padStart(2, "0");
      if (label && label.textContent !== nextText) label.textContent = nextText;
    });
  }

  function scheduleLabels(delay = 120) {
    clearTimeout(labelTimer);
    labelTimer = setTimeout(compactLabels, delay);
  }

  function claim(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }

  function listenerName(listener) {
    if (typeof listener === "function") return listener.name || "";
    if (listener && typeof listener.handleEvent === "function") return listener.handleEvent.name || "";
    return "";
  }

  function call(listener, target, event) {
    if (typeof listener === "function") return listener.call(target, event);
    return listener?.handleEvent?.call(listener, event);
  }

  EventTarget.prototype.addEventListener = function patchedAdd(type, listener, options) {
    const name = listenerName(listener);
    const shouldWrap = listener && (
      name === "onKeydown" ||
      name === "onLightboxWheel" ||
      name === "onLightboxClick" ||
      name === "endLightboxDrag"
    );
    if (!shouldWrap) return nativeAdd.call(this, type, listener, options);
    let fn = wrapped.get(listener);
    if (!fn) {
      fn = function flowLensVisibleSequenceWrapper(event) {
        if (box()) {
          if (name === "onKeydown" && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
            claim(event);
            if (!event.repeat) jump(event.key === "ArrowRight" ? 1 : -1);
            return;
          }
          if (name === "onLightboxWheel" && event.type === "wheel") {
            claim(event);
            const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
            if (Math.abs(delta) >= 4) jump(delta > 0 ? 1 : -1);
            return;
          }
          if (name === "onLightboxClick") {
            if (event.target?.closest?.(".xiv-lightbox-slideshow")) {
              claim(event);
              return;
            }
            const arrow = event.target?.closest?.(".xiv-lightbox-arrow");
            if (arrow) {
              claim(event);
              jump(arrow.dataset.side === "right" ? 1 : -1);
              return;
            }
          }
          if (name === "endLightboxDrag" && event.type.startsWith("pointer")) {
            const before = currentUrl();
            const ret = call(listener, this, event);
            setTimeout(() => {
              const after = currentUrl();
              if (after && after !== before && reason(after, box())) jump(1);
            }, 90);
            return ret;
          }
        }
        return call(listener, this, event);
      };
      wrapped.set(listener, fn);
    }
    return nativeAdd.call(this, type, fn, options);
  };

  function patchControl() {
    const control = window.__flowLensControl;
    if (!control || control.__flVisibleSequenceSafe) return;
    const original = control.showAdjacent?.bind(control);
    control.showAdjacent = (delta = 1) => jump(delta >= 0 ? 1 : -1) || original?.(delta);
    control.__flVisibleSequenceSafe = true;
  }

  const boot = new MutationObserver(() => {
    patchControl();
    scheduleLabels();
  });
  if (document.documentElement) boot.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => { patchControl(); scheduleLabels(20); }, 1200);
})();
