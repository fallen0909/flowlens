# 手机端：瀑光 FlowLens 油猴脚本

这是给 Android Edge + Tampermonkey 使用的版本。手机端不能像桌面浏览器那样直接加载本地未打包扩展，所以这里提供独立的油猴脚本。

## 安装

1. 在 Android Edge 里安装 `Tampermonkey`。
2. 打开 `install-userscript.html`，点击“安装/更新脚本”。
3. 或者直接把 `flowlens.user.js` 导入 Tampermonkey。
4. 打开目标套图页，点击右下角“瀑光”悬浮入口。

## 重新生成

手机脚本由桌面端共享逻辑生成：

```powershell
node mobile-userscript/build-userscript.js
```

生成脚本会读取 `flowlens-extension/content.js` 和 `flowlens-extension/manifest.json`，输出到 `mobile-userscript/flowlens.user.js`。
