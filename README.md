# 瀑光 FlowLens

![瀑光 FlowLens 项目封面](docs/assets/flowlens-hero.png)

> 把网页中的图片和视频，一键整理成沉浸式全屏瀑布流。

FlowLens 是一个浏览器工具：它会收集网页上零散、分页、尺寸不一的图片与视频，整理成可连续浏览、筛选、放大和下载的图片流。

![FlowLens 功能图标](docs/assets/flowlens-feature-strip.svg)

## 安装

当前版本见 [version.json](version.json)。普通用户只需要以下两个正式入口：

- [电脑端油猴脚本](flowlens-desktop.user.js)
- [手机端油猴脚本](flowlens-mobile-all.user.js)
- [安装页](https://fallen0909.github.io/flowlens/)

电脑端与手机端共享核心代码；手机端仅额外加载触控和窄屏适配。

## 功能

- 将页面图片和视频整理成全屏瀑布流。
- 支持图片/视频筛选、大图浏览、原始尺寸拖动、幻灯片、下载与链接导出。
- 支持页面收藏、低频跨设备同步和诊断日志导出。
- 支持手机触控浏览、窄屏与折叠屏布局。
- 知乎页面会在图片流内合并同源重复媒体，避免重复卡片。

## 使用

### 电脑端

1. 安装 Tampermonkey。
2. 打开 [flowlens-desktop.user.js](flowlens-desktop.user.js) 并安装。
3. 打开任意网页，点击右下角“瀑光”入口。

### 手机端

1. 使用 Android Edge、Kiwi 或 Firefox 等支持脚本管理器的浏览器。
2. 安装 Tampermonkey。
3. 打开 [flowlens-mobile-all.user.js](flowlens-mobile-all.user.js) 并安装。

## 项目结构

```text
flowlens-desktop.user.js      电脑端正式单文件安装入口
flowlens-mobile-all.user.js   手机端正式单文件安装入口
apps/extension/               Chrome / Edge 扩展源码
src/                          两端共享源码
  core/                       核心逻辑
  patches/                    功能补丁
  mobile/                     手机端适配
docs/                         安装页、素材和历史资料
scripts/                      构建与本地开发工具
tests/                        本地验证页
```

## 开发与发布

```bash
node scripts/build-userscripts.mjs
node --check flowlens-desktop.user.js
node --check flowlens-mobile-all.user.js
```

构建后必须提交两个正式入口。GitHub Actions 只做重建、校验和打包，不会直接修改源码或自动提交发布文件。

完整的历史记录请查看 [变更日志](docs/CHANGELOG.md)。
