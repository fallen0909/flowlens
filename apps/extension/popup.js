(() => {
  async function activeTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  function status(text = "") {
    document.getElementById("status").textContent = text;
  }

  async function activate(tab) {
    if (!tab?.id) throw new Error("找不到当前标签页");
    const response = await chrome.runtime.sendMessage({ type: "FLOWLENS_ACTIVATE", tabId: tab.id });
    if (!response?.ok) throw new Error(response?.error || "瀑光启动失败");
  }

  document.getElementById("open").addEventListener("click", async () => {
    const tab = await activeTab();
    const button = document.getElementById("open");
    button.disabled = true;
    status("正在加载图片流…");
    try {
      await activate(tab);
      window.close();
    } catch (error) {
      status(String(error?.message || error));
      button.disabled = false;
    }
  });

  document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
  document.getElementById("help").addEventListener("click", async () => {
    const tab = await activeTab();
    if (!tab?.id) return;
    try {
      await activate(tab);
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true, cancelable: true }))
      });
    } catch (error) {
      status(String(error?.message || error));
      return;
    }
    window.close();
  });
})();
