# 瀑光 FlowLens

瀑光 FlowLens 是一个把网页看图体验变顺手的小工具。它会把网页里零散、分页、尺寸不一的图片和视频收拢起来，整理成全屏瀑布流，让你像刷本地相册一样连续浏览、放大查看、切换上一张下一张，必要时还可以打包下载。

## 正式安装入口

当前统一版本：`v1.4.8`。

普通使用只需要认准两个入口：

- 电脑端：`flowlens-desktop.user.js`
- 手机端：`flowlens-mobile-all.user.js`

安装页：`https://fallen0909.github.io/flowlens/`

电脑端和手机端共用 `src/core`、`src/patches` 下的同一批核心功能；手机端只额外加载 `src/mobile/mobile-center.js` 做布局和触控适配。

## 功能

- 全屏瀑布流浏览网页图片和视频。
- 顶部按钮可在“全部 / 图片 / 视频”之间快速切换。
- 大图模式支持滚轮、方向键、侧边箭头切换。
- 大图视频自动播放，浏览器拦截有声自动播放时降级为静音播放。
- 支持图片和类 GIF 视频：`mp4`、`webm`、`mov`、`m4v`。
- 支持打包下载和链接导出。

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

## 后续维护规则

- 发布新版本时，只改两个正式入口的 `@version` 和 `@require ?v=` 参数。
- 两端共用功能放到 `src/core` 或 `src/patches`。
- 手机端专属交互放到 `src/mobile`。
- 不再新增 `flowlens-mobile-v*`、`stable`、`latest` 之类的临时安装入口，避免误装旧版本。
