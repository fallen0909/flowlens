(() => {
  if (window.__flowLensLightboxEventGuard) return;
  window.__flowLensLightboxEventGuard = true;

  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  const wrappedListeners = new WeakMap();

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
    return !!target?.closest?.(".xiv-lightbox-slideshow");
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

  function shouldBlockCoreLightboxClick(event) {
    if (!isLightboxEvent(event)) return false;
    const direction = arrowDirection(event.target);
    if (direction && typeof window.__flowLensVisibleSequenceJump === "function") {
      window.__flowLensVisibleSequenceJump(direction);
      return true;
    }
    if (isSlideshowButton(event.target)) return true;
    return Date.now() < Number(window.__flowLensBlockNextLightboxClickUntil || 0);
  }

  function shouldBlockCoreLightboxPointer(event) {
    return isLightboxEvent(event) && isSlideshowButton(event.target);
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

    if (!listener || (!shouldWrapClick && !shouldWrapPointer)) {
      return nativeAddEventListener.call(this, type, listener, options);
    }

    let wrapped = wrappedListeners.get(listener);
    if (!wrapped) {
      wrapped = function flowLensGuardedLightboxListener(event) {
        if (type === "click" && shouldBlockCoreLightboxClick(event)) {
          claim(event);
          return;
        }
        if (type !== "click" && shouldBlockCoreLightboxPointer(event)) {
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
