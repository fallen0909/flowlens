# AGENTS.md

## 项目说明

这个仓库是一个本地 Edge/Chrome 浏览器插件。插件以“未打包扩展”的方式安装，用于把多图网页整理成全屏图片流查看。

主要源码目录：

- `xchina-immersive-viewer/`

用户在 Edge 里加载的插件目录：

- `outputs/xchina-immersive-viewer/`

除非用户明确要求，不要生成 zip 包。用户一直是用文件夹安装和更新插件。

## 修改流程

修改插件时按这个顺序做：

1. 只编辑 `xchina-immersive-viewer/` 里的源码。
2. 运行语法检查：
   - `node --check xchina-immersive-viewer/content.js`
   - `node --check xchina-immersive-viewer/background.js`
   - 解析检查 `xchina-immersive-viewer/manifest.json`
3. 把整个 `xchina-immersive-viewer/` 同步复制到 `outputs/xchina-immersive-viewer/`。
4. 更新 `xchina-immersive-viewer/reload-token.txt`，并确保输出目录里的 `reload-token.txt` 也同步更新，让 Edge 自动重载未打包插件。

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
- 不要对任意网站盲目扫描或爬取分页，这会让 `https://xchina.co/` 这类页面卡死。
- `x.810114.xyz` 有专门工作流：优先使用站点/API 数据；必要时才触发展开全部后从 DOM 收集媒体。
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
node --check xchina-immersive-viewer/content.js
node --check xchina-immersive-viewer/background.js
node -e "JSON.parse(require('fs').readFileSync('xchina-immersive-viewer/manifest.json','utf8')); console.log('manifest ok')"
```

同步到输出目录后，再验证 Edge 实际加载的输出目录：

```powershell
node --check outputs/xchina-immersive-viewer/content.js
node --check outputs/xchina-immersive-viewer/background.js
node -e "const m=require('./outputs/xchina-immersive-viewer/manifest.json'); console.log(m.version)"
```
