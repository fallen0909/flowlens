(() => {
  if (window.__flowLensLightboxEventGuard) return;
  window.__flowLensLightboxEventGuard = true;

  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  const wrappedListeners = new WeakMap();
  const SLIDESHOW_CONTROL_SELECTOR = [
    ".xiv-lightbox-slideshow",
    "[data-fl-lightbox-control='slideshow']",
    "[aria-label*='自动切换']",
    "[title*='自动切换']"
  ].join(",");

  window.__flowLensBlockNextLightboxClickUntil = 0;

  function activeLightbox() {
    const node = document.getElementById("xiv-lightbox");
    return node?.dataset.active === "true" ? node : null;
  }

  function isLightboxEvent(event) {
    const lb = activeLightbox();
    return !!lb && !!event?.target && lb.contains(event.target);
  }

  function isSlideshowButton(target) {
    return !!target?.closest?.(SLIDESHOW_CONTROL_SELECTOR);
  }

  function arrowDirection(target) {
    const arrow = target?.closest?.(".xiv-lightbox-arrow");
    if (!arrow) return 0;
    return arrow.dataset.side === "right" ? 1 : -1;
  }

  function claim(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }

  function protectNextLightboxClick(ms = 700) {
    window.__flowLensBlockNextLightboxClickUntil = Math.max(
      Number(window.__flowLensBlockNextLightboxClickUntil || 0),
      Date.now() + ms
    );
  }

  function shouldBlockCoreLightboxClick(event) {
    if (!isLightboxEvent(event)) return false;
    const direction = arrowDirection(event.target);
    if (direction && typeof window.__flowLensVisibleSequenceJump === "function") {
      window.__flowLensVisibleSequenceJump(direction);
      return true;
    }
    if (isSlideshowButton(event.target)) {
      protectNextLightboxClick();
      return true;
    }
    return Date.now() < Number(window.__flowLensBlockNextLightboxClickUntil || 0);
  }

  function shouldBlockCoreLightboxPointer(event) {
    if (!isLightboxEvent(event) || !isSlideshowButton(event.target)) return false;
    protectNextLightboxClick();
    return true;
  }

  function shouldBlockCoreLightboxWheel(event) {
    if (!isLightboxEvent(event)) return false;
    if (typeof window.__flowLensHandleLightboxZoomWheel !== "function") return false;
    try {
      return window.__flowLensHandleLightboxZoomWheel(event) === true;
    } catch {
      return false;
    }
  }

  function shouldBlockCoreKeydown(event) {
    if (typeof window.__flowLensHandleGalleryQueueKeydown !== "function") return false;
    try {
      return window.__flowLensHandleGalleryQueueKeydown(event) === true;
    } catch {
      return false;
    }
  }

  function listenerName(listener) {
    if (typeof listener === "function") return listener.name || "";
    if (listener && typeof listener.handleEvent === "function") return listener.handleEvent.name || "";
    return "";
  }

  function callListener(listener, context, event) {
    if (typeof listener === "function") return listener.call(context, event);
    return listener?.handleEvent?.call(listener, event);
  }

  EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
    const name = listenerName(listener);
    const shouldWrapClick = type === "click" && name === "onLightboxClick";
    const shouldWrapPointer = /^pointer(?:down|up|cancel)$/i.test(type) && (name === "onLightboxPointerDown" || name === "endLightboxDrag");
    const shouldWrapWheel = type === "wheel" && name === "onLightboxWheel";
    const shouldWrapKeydown = type === "keydown" && name === "onKeydown";

    if (!listener || (!shouldWrapClick && !shouldWrapPointer && !shouldWrapWheel && !shouldWrapKeydown)) {
      return nativeAddEventListener.call(this, type, listener, options);
    }

    let wrapped = wrappedListeners.get(listener);
    if (!wrapped) {
      wrapped = function flowLensGuardedListener(event) {
        if (type === "click" && shouldBlockCoreLightboxClick(event)) {
          claim(event);
          return;
        }
        if (shouldWrapPointer && shouldBlockCoreLightboxPointer(event)) {
          claim(event);
          return;
        }
        if (type === "wheel" && shouldBlockCoreLightboxWheel(event)) {
          claim(event);
          return;
        }
        if (type === "keydown" && shouldBlockCoreKeydown(event)) {
          claim(event);
          return;
        }
        return callListener(listener, this, event);
      };
      wrappedListeners.set(listener, wrapped);
    }

    return nativeAddEventListener.call(this, type, wrapped, options);
  };
})();
