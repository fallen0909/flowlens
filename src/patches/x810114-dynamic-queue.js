// ==UserScript==
// @name         FlowLens x.810114 dynamic queue patch
// @namespace    local.flowlens.patch.x810114.dynamicQueue
// @version      1.9.6
// @description  Route x.810114 next/previous group navigation through the currently visible right-side username rail.
// @match        *://x.810114.xyz/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensX810114DynamicQueuePatch) return;
  window.__flowLensX810114DynamicQueuePatch = true;

  const HOST = "x.810114.xyz";
  const VERSION = "1.9.6";
  const AUTO_OPEN_KEY = "flowlens-gallery-queue-auto-open";
  const PROFILE_RE = /^[A-Za-z0-9_]{2,64}$/;
  const BANNED_RE = /^(static|manifest|favicon|photo|api|tag|tags|search|assets|asset|img|images|css|js|login|register|about|privacy|terms)$/i;

  function isTargetHost(url = location.href) {
    try {
      return new URL(url, location.href).hostname === HOST;
    } catch {
      return false;
    }
  }

  function normalizePageUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      if (parsed.hostname !== HOST) return "";
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length !== 1 || !PROFILE_RE.test(parts[0]) || BANNED_RE.test(parts[0])) return "";
      parsed.pathname = `/${parts[0]}`;
      parsed.search = "";
      return parsed.href.replace(/\/$/, "");
    } catch {
      return "";
    }
  }

  function currentProfileUrl() {
    return normalizePageUrl(location.href);
  }

  function queueStorageKey() {
    return `flowlens-gallery-queue:${location.origin}`;
  }

  function namesFromText(text) {
    const result = [];
    const seen = new Set();
    for (const match of String(text || "").matchAll(/@\s*([A-Za-z0-9_]{2,64})/g)) {
      const name = match[1];
      const key = name.toLowerCase();
      if (BANNED_RE.test(name) || seen.has(key)) continue;
      seen.add(key);
      result.push(name);
    }
    return result;
  }

  function createCollector() {
    const urls = [];
    const seen = new Set();

    function addName(name) {
      if (!name || !PROFILE_RE.test(name) || BANNED_RE.test(name)) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      urls.push(`https://${HOST}/${name}`);
    }

    function addUrl(raw, base = location.href) {
      const url = normalizePageUrl(new URL(raw, base).href);
      if (!url) return;
      const name = new URL(url).pathname.split("/").filter(Boolean)[0];
      addName(name);
    }

    function addText(text) {
      namesFromText(text).forEach(addName);
    }

    function scanElement(root) {
      if (!root) return;
      root.querySelectorAll?.("a[href]").forEach((link) => {
        const href = link.getAttribute("href") || "";
        try { addUrl(href, link.ownerDocument?.location?.href || location.href); } catch {}
        addText(link.textContent || "");
        addText(link.getAttribute("title") || "");
        addText(link.getAttribute("aria-label") || "");
        addText(link.getAttribute("data-username") || "");
        addText(link.getAttribute("data-user") || "");
        addText(link.getAttribute("data-name") || "");
      });
      root.querySelectorAll?.("[title], [aria-label], [data-username], [data-user], [data-name]").forEach((node) => {
        addText(node.getAttribute("title") || "");
        addText(node.getAttribute("aria-label") || "");
        addText(node.getAttribute("data-username") || "");
        addText(node.getAttribute("data-user") || "");
        addText(node.getAttribute("data-name") || "");
      });
      addText(root.innerText || root.textContent || "");
    }

    return { urls, addName, addUrl, addText, scanElement };
  }

  function queueFromElement(element) {
    const collector = createCollector();
    collector.scanElement(element);
    return collector.urls;
  }

  function scoreQueueContainer(element, queue) {
    if (!element || queue.length < 2) return -Infinity;
    const cls = String(element.className || "");
    let rect = { x: 0, width: 0, height: 0 };
    try { rect = element.getBoundingClientRect?.() || rect; } catch {}
    const viewportWidth = Number(window.innerWidth || document.documentElement.clientWidth || 0);
    const rightRail = viewportWidth ? rect.x > viewportWidth * 0.48 && rect.width > 100 : false;
    const railClass = /(?:\bw-1\/4\b|\bw-\[|border-l|right-0|max-w|overflow-auto|sticky|fixed|sidebar|aside|recommend|user|profile|bg-white|bg-gray)/i.test(cls);
    const compactCardCount = Array.from(element.querySelectorAll?.("a[href], button, [role='button'], div, li") || [])
      .filter((node) => {
        const text = node.innerText || node.textContent || "";
        const hasOneName = namesFromText(text).length === 1 || !!normalizePageUrl(node.getAttribute?.("href") || "");
        return hasOneName && /(?:cursor|hover|rounded|shadow|items-center|flex|gap|avatar|profile|user|bg-gray|border)/i.test(String(node.className || ""));
      })
      .length;
    const tooLargePenalty = Math.max(0, (element.querySelectorAll?.("*")?.length || 0) - 120);
    return queue.length * 30 + compactCardCount * 45 + (rightRail ? 1600 : 0) + (railClass ? 420 : 0) + Math.min(rect.height || 0, 900) / 10 - tooLargePenalty;
  }

  function collectRightRailQueue() {
    if (!isTargetHost()) return [];
    const candidates = Array.from(document.querySelectorAll("aside, nav, section, main, div, ul, ol"))
      .map((element) => ({ element, queue: queueFromElement(element) }))
      .filter((item) => item.queue.length >= 2)
      .map((item) => ({ ...item, score: scoreQueueContainer(item.element, item.queue) }))
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (best?.queue?.length >= 2) return best.queue;

    const fallback = createCollector();
    fallback.scanElement(document.body || document.documentElement);
    return fallback.urls;
  }

  async function readCurrentRightQueue() {
    let queue = collectRightRailQueue();
    if (queue.length >= 2) return queue;
    await new Promise((resolve) => setTimeout(resolve, 650));
    queue = collectRightRailQueue();
    return queue;
  }

  function writeQueue(queue, target) {
    try {
      sessionStorage.setItem(queueStorageKey(), JSON.stringify(queue.slice(0, 300)));
      sessionStorage.setItem(AUTO_OPEN_KEY, target);
      sessionStorage.setItem("flowlens-x810114-dynamic-queue", JSON.stringify({
        version: VERSION,
        from: location.href,
        target,
        queue,
        time: Date.now()
      }));
    } catch {
      // Storage is best-effort.
    }
  }

  function setStatus(text) {
    const status = document.querySelector("#xiv-status");
    if (status) status.textContent = text;
  }

  function pickTarget(queue, delta) {
    const current = currentProfileUrl();
    const cleanQueue = queue.map(normalizePageUrl).filter(Boolean);
    const unique = [];
    const seen = new Set();
    for (const url of cleanQueue) {
      const key = url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(url);
    }
    if (!unique.length) return "";
    let index = current ? unique.findIndex((url) => url.toLowerCase() === current.toLowerCase()) : -1;
    if (index < 0) return delta > 0 ? unique[0] : unique[unique.length - 1];
    for (let step = 1; step <= unique.length; step += 1) {
      const candidate = unique[(index + delta * step + unique.length) % unique.length];
      if (candidate && candidate.toLowerCase() !== current.toLowerCase()) return candidate;
    }
    return "";
  }

  async function handleSwitch(delta, event) {
    if (!isTargetHost()) return false;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();

    const queue = await readCurrentRightQueue();
    const target = pickTarget(queue, delta);
    if (!target) {
      setStatus("右侧用户名名单不足，无法切换");
      return true;
    }
    writeQueue(queue, target);
    setStatus(delta > 0 ? "按右侧名单打开下一组" : "按右侧名单打开上一组");
    if (normalizePageUrl(location.href).toLowerCase() === target.toLowerCase()) {
      location.reload();
    } else {
      location.href = target;
    }
    return true;
  }

  function rootIsActive() {
    const root = document.querySelector("#xiv-root");
    return root?.dataset?.active === "true" || document.documentElement.classList.contains("xiv-active");
  }

  document.addEventListener("click", (event) => {
    if (!isTargetHost()) return;
    const button = event.target?.closest?.('[data-xiv="next-set"], [data-xiv="prev-set"]');
    if (!button) return;
    const delta = button.dataset.xiv === "prev-set" ? -1 : 1;
    void handleSwitch(delta, event);
  }, true);

  window.addEventListener("keydown", (event) => {
    if (!isTargetHost() || !rootIsActive()) return;
    const tag = event.target?.tagName;
    if (/^(INPUT|TEXTAREA|SELECT)$/i.test(tag || "") || event.target?.isContentEditable) return;
    if (event.key === "." || event.key === "ArrowRight" && event.altKey) {
      void handleSwitch(1, event);
    } else if (event.key === "," || event.key === "ArrowLeft" && event.altKey) {
      void handleSwitch(-1, event);
    }
  }, true);

  window.addEventListener("flowlens:page-url-changed", () => {
    if (!isTargetHost()) return;
    window.setTimeout(() => {
      const queue = collectRightRailQueue();
      const current = currentProfileUrl();
      if (queue.length >= 2 && current) writeQueue(queue, current);
    }, 800);
  });
})();
