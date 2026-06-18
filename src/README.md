# src 目录说明

这里放 FlowLens 的正式源码。

## core

两端共同依赖的核心脚本：

- `global-settings.js`：全局设置同步。
- `flowlens-core.js`：主瀑布流、采集、大图、下载等核心逻辑。
- `optimizer.js`：界面和移动触控优化。

## patches

电脑端和手机端共同使用的功能补丁：

- `fixes.js`：稳定性、筛选和性能修复。
- `product.js`：历史、选择、预加载等增强功能。
- `ui-cleanup.js`：界面清理。
- `lightbox-stable.js`：大图稳定性修复。
- `settings-compact.js`：设置面板紧凑化。
- `zhihu.js`：知乎图片预采集。
- `topfix.js`：顶部边界修复。
- `media-sync.js`：全部/图片/视频切换按钮和大图视频自动播放。

## mobile

手机端专属适配：

- `mobile-center.js`：手机端 1:1 原尺寸大图居中和触控优化。

正式安装入口仍然只放在仓库根目录：

- 电脑端：`flowlens-desktop.user.js`
- 手机端：`flowlens-mobile-all.user.js`
