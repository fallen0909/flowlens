(() => {
  if (window.__flowLensIosSmoothPatch) return;
  window.__flowLensIosSmoothPatch = true;

  // The core owns image sources and the bounded neighbour preload queue.
  // An async src setter can commit an old image after navigation; a second
  // Image cache also retains the entire gallery. Keep this patch visual only.
  const style = document.createElement("style");
  style.id = "flowlens-lightbox-ios-smooth-style";
  style.textContent = `
    #xiv-lightbox[data-active="true"] { contain: none !important; }
    #xiv-lightbox img, #xiv-lightbox video {
      opacity: 1 !important;
      transition: none !important;
      backface-visibility: visible !important;
    }
  `;
  document.documentElement.appendChild(style);
})();
