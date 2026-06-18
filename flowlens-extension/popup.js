(() => {
  async function activeTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  document.getElementById("open").addEventListener("click", async () => {
    const tab = await activeTab();
    if (!tab?.id) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "XIV_TOGGLE" });
    } catch {
      // 当前页面可能还没有注入内容脚本，刷新页面后再试即可。
    }
    window.close();
  });

  document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
  document.getElementById("help").addEventListener("click", async () => {
    const tab = await activeTab();
    if (!tab?.id) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true, cancelable: true }))
      });
    } catch {
      // Ignore restricted pages.
    }
    window.close();
  });
})();
