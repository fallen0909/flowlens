# 瀑光 FlowLens

瀑光 FlowLens 是一个把网页看图、看视频体验做顺手的浏览器小工具。它会把网页里零散、分页、尺寸不一的图片和视频收拢起来，整理成全屏瀑布流，让你像刷本地相册一样连续浏览、放大查看、切换上一张下一张，必要时还可以打包下载。

它主要解决的是这类问题：网页图片分散在正文、评论、分页和懒加载区域里，缩略图太小，点开大图容易丢位置，视频和图片混在一起不方便筛选。瀑光会把这些内容统一整理成一个干净的沉浸式图片流。

## 正式安装入口

当前统一版本：`v1.4.14`。

普通使用只需要认准两个入口：

- 电脑端：`flowlens-desktop.user.js`
- 手机端：`flowlens-mobile-all.user.js`

安装页：`https://fallen0909.github.io/flowlens/`

电脑端和手机端共用 `src/core`、`src/patches` 下的同一批核心功能；手机端只额外加载 `src/mobile/mobile-center.js` 做布局和触控适配。

## 功能亮点

- 全屏瀑布流浏览网页图片和视频。
- 自动收集当前页面和动态加载出来的有效媒体。
- 支持图片和类 GIF 视频：`jpg`、`png`、`webp`、`avif`、`gif`、`mp4`、`webm`、`mov`、`m4v`。
- 顶部按钮可在“全部 / 图片 / 视频”之间快速切换。
- 点击卡片进入大图模式，支持滚轮、方向键、侧边箭头切换。
- 大图模式新增幻灯片按钮，可自动切换下一张大图。
- 设置面板可调整大图切换速度。
- 大图视频自动播放，浏览器拦截有声自动播放时会降级为静音播放。
- 支持列数调整、自动滚动、主题切换、全屏打开、入口按钮隐藏。
- 支持打包下载和链接导出。
- 手机端支持触控浏览、折叠屏和窄屏布局优化。

## 使用方式

### 电脑端

1. 安装 Tampermonkey。
2. 打开 `flowlens-desktop.user.js`。
3. Tampermonkey 弹出安装页后点击安装或更新。
4. 打开普通网页，点击右下角“瀑光”入口。

### 手机端

1. 使用 Android Edge、Kiwi、Firefox 等支持脚本管理器的浏览器。
2. 安装 Tampermonkey。
3. 打开 `flowlens-mobile-all.user.js`。
4. 安装后打开网页，点击“瀑光”入口。

## 目录说明

```text
flowlens-desktop.user.js      电脑端正式油猴入口
flowlens-mobile-all.user.js   手机端正式油猴入口
src/                          电脑和手机共用源码
  core/                       核心逻辑
  patches/                    共用功能补丁
  mobile/                     手机端专属适配
flowlens-extension/           Chrome / Edge 扩展版备用源码
docs/                         说明图片和展示资源
scripts/                      本地开发辅助脚本
```

## 版本策略

- 电脑端和手机端版本号保持一致。
- 两端共用功能放到 `src/core` 或 `src/patches`。
- 手机端专属交互放到 `src/mobile`。
- 正式入口只保留 `flowlens-desktop.user.js` 和 `flowlens-mobile-all.user.js`。
- 不再新增 `flowlens-mobile-v*`、`stable`、`latest` 之类的临时安装入口，避免误装旧版本。

## 近期更新

### v1.4.14

- 修复大图幻灯片按钮点击后不自动切换的问题。
- 幻灯片切换改为触发下一张卡片的原生打开逻辑，不再依赖右箭头或模拟键盘。
- 恢复完整 README 项目介绍。

### v1.4.13

- 优化性能，取消常驻扫描。
- 设置面板做手机端紧凑化。
- 图/视频切换改回调用插件原生筛选逻辑。

### v1.4.12

- 设置面板新增大图切换速度。
- 修复幻灯片按钮被大图层点击拦截的问题。
