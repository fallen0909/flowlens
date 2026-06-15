# AGENTS.md

## 项目说明

这个仓库是本地 Edge/Chrome 浏览器扩展和 Android Edge/Tampermonkey 脚本的源码仓库，用于把多图网页整理成全屏图片流查看。

GitHub 上保留最新、主要、可维护的文件：

- `README.md`：项目主页说明。
- `flowlens-extension/`：电脑端 Edge/Chrome 未打包扩展源码。
- `mobile-userscript/`：手机端 Android Edge/Tampermonkey 脚本。
- `docs/assets/`：README 使用的项目图片、图标和效果展示素材。

本地开发加载目录：

- `outputs/flowlens-extension/`

`outputs/` 只用于本机 Edge 加载和自动重载，不提交到 GitHub。除非用户明确要求，不要生成 zip 包；用户一直是用文件夹安装和更新插件。

## 修改流程

修改插件时按这个顺序做：

1. 只编辑 `flowlens-extension/` 里的电脑端源码。
2. 如需更新手机脚本，运行：
   - `node mobile-userscript/build-userscript.js`
3. 运行语法检查：
   - `node --check flowlens-extension/content.js`
   - `node --check flowlens-extension/background.js`
   - 解析检查 `flowlens-extension/manifest.json`
   - 如改了手机脚本构建结果，也检查 `mobile-userscript/flowlens.user.js`
4. 把整个 `flowlens-extension/` 同步复制到 `outputs/flowlens-extension/`。
5. 更新 `flowlens-extension/reload-token.txt`，并确保输出目录里的 `reload-token.txt` 也同步更新，让 Edge 自动重载未打包插件。

文件操作使用 PowerShell 原生命令。不要使用破坏性的 git 命令。

## 自动重载

插件有开发用自动重载机制：

- `background.js` 通过 `chrome.alarms` 每分钟检查一次 `reload-token.txt`。
- 如果 token 变化，会调用 `chrome.runtime.reload()`。
- 每次改完代码后，把 `reload-token.txt` 更新为新的时间戳。

首次安装或权限变化仍可能需要用户在 Edge 扩展页手动点一次重新加载。之后普通代码更新应通过 token 自动重载。

## 行为约束

- `manifest.json` 当前会在 `<all_urls>` 注入 `content.js`。
- 通用网站只扫描当前页面已经存在的大图、媒体，以及后续动态新增的媒体。
- 只有明确适配过的套图详情页才能触发多页抓取。
- 不要对任意网站盲目扫描或爬取分页，这会让普通页面卡死。
- 部分已适配站点有专门工作流：优先使用站点/API 数据；必要时才触发展开全部后从 DOM 收集媒体。
- 插件支持图片和类 GIF 视频：`mp4`、`webm`、`mov`、`m4v`。
- 所有网站上明确是广告、推广、被屏蔽提示、扫码下载 App、模糊敏感提示的图片，都不要加入图片流。

## UI 要求

- 可见 UI 保持中文。
- 右下角悬浮入口要避开常见聊天窗口。
- 图片流里的视频卡片需要有半透明播放标识。
- 网格里的视频只显示封面或第一帧，不自动播放。
- 点开视频大图后自动播放。
- 关闭大图或切换到下一张时，旧视频自动暂停。
- 大图模式行为：
  - `Esc` 关闭大图。
  - `ArrowLeft` / `ArrowRight` 切换上一张/下一张。
  - 鼠标滚轮向上/向下切换上一张/下一张。
  - 侧边箭头切换上一张/下一张。
  - 点击空白处退出大图模式。
  - 点击图片/视频在“适应屏幕”和“1:1 原尺寸”之间切换。
  - 在 1:1 原尺寸模式下，按住左键可拖动图片/视频前后左右移动。

## 验证命令

完成源码修改后，至少运行：

```powershell
node --check flowlens-extension/content.js
node --check flowlens-extension/background.js
node -e "JSON.parse(require('fs').readFileSync('flowlens-extension/manifest.json','utf8')); console.log('manifest ok')"
```

同步到输出目录后，再验证 Edge 实际加载的输出目录：

```powershell
node --check outputs/flowlens-extension/content.js
node --check outputs/flowlens-extension/background.js
node -e "const m=require('./outputs/flowlens-extension/manifest.json'); console.log(m.version)"
```
