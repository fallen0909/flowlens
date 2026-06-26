# 瀑光 FlowLens

![瀑光 FlowLens 项目封面](docs/assets/flowlens-hero.png)

> 把网页中的图片和视频，一键整理成沉浸式全屏瀑布流。当前版本：**v1.7.19**。

FlowLens 是一个浏览器工具：它会收集网页上零散、分页、尺寸不一的图片与视频，整理成可连续浏览、筛选、放大、收藏和下载的图片流。电脑端和手机端共享核心代码，手机端额外加载触控、窄屏和折叠屏适配。

![FlowLens 功能图标](docs/assets/flowlens-feature-strip.svg)

## 快速安装

普通用户只需要安装下面两个正式入口之一：

| 版本 | 安装链接 | 适用场景 |
|---|---|---|
| 电脑端 | [安装/更新 FlowLens desktop](https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-desktop.user.js) | Edge、Chrome、Firefox + Tampermonkey |
| 手机端 | [安装/更新 FlowLens mobile](https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-all.user.js) | Android Edge、Kiwi、Firefox 等支持脚本管理器的移动浏览器 |
| 安装页 | [打开安装页](https://fallen0909.github.io/flowlens/) | 图形化安装入口 |

当前版本信息见 [version.json](version.json)。

## 1.7.19 更新重点

- 大图打开和切换更顺滑：高清图先在后台预解码，再平滑替换，减少缩略图切高清图时的闪烁和跳动。
- 恢复 iOS 风格轻量过渡：大图层使用淡入、轻微缩放和 GPU 合成优化。
- 点击图片前预热当前图及相邻图片，连续切换更跟手。
- Actions 改为手动运行，避免普通提交自动触发失败邮件。

## 功能

- 将页面图片和视频整理成全屏瀑布流。
- 支持图片/视频筛选、大图浏览、原始尺寸拖动、幻灯片、下载与链接导出。
- 支持页面收藏、低频跨设备同步和诊断日志导出。
- 支持手机触控浏览、窄屏与折叠屏布局。
- 支持 Meitulu `item/编号.html`、`item/编号_2.html` 等多页套图补齐采集。
- 支持知乎页面同源重复媒体合并，避免重复卡片。

## 使用

### 电脑端

1. 安装 Tampermonkey。
2. 打开 [flowlens-desktop.user.js](flowlens-desktop.user.js) 并安装。
3. 打开任意网页，点击右下角“瀑光”入口。

### 手机端

1. 使用 Android Edge、Kiwi 或 Firefox 等支持脚本管理器的浏览器。
2. 安装 Tampermonkey。
3. 打开 [flowlens-mobile-all.user.js](flowlens-mobile-all.user.js) 并安装。

## 建议继续优化的方向

| 优先级 | 方向 | 目标 |
|---|---|---|
| 高 | 虚拟瀑布流 | 大量图片时只渲染视口附近内容，降低手机端滚动掉帧 |
| 高 | 大图手势跟手动画 | 左右滑动时让图片跟随手指移动，松手后回弹或切换，进一步接近 iOS 相册 |
| 中 | 智能高清解析缓存 | 对已解析过的高清地址做持久缓存，二次打开秒切高清 |
| 中 | 站点适配中心 | 将 xchina、Meitulu、知乎等站点规则拆成独立适配器，降低主文件复杂度 |
| 中 | 设置导入导出 | 方便手机和电脑同步列数、主题、自动滚动、收藏等设置 |
| 低 | 发布页美化 | 安装页展示版本、更新说明、电脑/手机步骤和常见问题 |

## 项目结构

```text
flowlens-desktop.user.js      电脑端正式安装入口
flowlens-mobile-all.user.js   手机端正式安装入口
apps/extension/               Chrome / Edge 扩展源码
src/                          两端共享源码
  core/                       核心逻辑
  patches/                    功能补丁
  mobile/                     手机端适配
docs/                         安装页、素材和历史资料
tools/                        构建、校验和本地开发工具
```

`src/` 是电脑端、手机端和扩展端共享逻辑的唯一来源。入口脚本采用多文件 `@require` 加载，方便快速更新和缓存失效。

## 开发与发布

```bash
node tools/validate-release.mjs
node tools/build-userscripts.mjs
node --check flowlens-desktop.user.js
node --check flowlens-mobile-all.user.js
```

GitHub Actions 已改为手动运行，避免普通提交触发不必要的失败邮件。需要打包时，可在 Actions 页面手动运行 `Verify and package FlowLens`。

完整历史记录请查看 [变更日志](docs/CHANGELOG.md)。
