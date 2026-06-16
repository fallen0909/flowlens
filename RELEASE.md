# FlowLens 发布版说明

本项目现在分为两个发布通道：

## 一、电脑端扩展发布包

发布工作流：`.github/workflows/release-build.yml`

在 GitHub 仓库页面进入：

`Actions` → `Build release packages` → `Run workflow`

运行完成后，在 workflow 详情页的 `Artifacts` 下载：

- `flowlens-extension-v版本号.zip`：电脑端浏览器扩展包
- `flowlens-userscripts-v版本号.zip`：手机端油猴脚本包

电脑端安装方式：

1. 解压 `flowlens-extension-v版本号.zip`。
2. 打开 Edge/Chrome 扩展管理页。
3. 开启开发人员模式。
4. 选择“加载解压缩的扩展”。
5. 选择解压后的 `flowlens-extension` 文件夹。

注意：开发人员模式加载的“解压缩扩展”不能像商店扩展一样自动更新。后续如果要做完全自动更新，建议走 Chrome Web Store / Edge Add-ons 商店发布；或者走自托管 CRX，但需要固定私钥、HTTPS 更新清单、浏览器允许安装外部扩展。

## 二、手机端油猴脚本发布页

发布工作流：`.github/workflows/publish-userscripts-pages.yml`

在 GitHub 仓库页面进入：

`Actions` → `Publish mobile userscripts` → `Run workflow`

运行完成后，会发布到 GitHub Pages。通常访问地址为：

`https://fallen0909.github.io/flowlens/`

手机端安装方式：

1. 手机 Edge 安装 Tampermonkey。
2. 打开 GitHub Pages 发布页。
3. 依次安装：
   - 主脚本
   - 优化补丁
   - 全局设置同步
   - 知乎适配（需要知乎增强时安装）

手机端脚本只要从这个 Pages 地址安装，后续 Tampermonkey 可以按脚本源地址检查更新。

## 三、当前版本

电脑端扩展版本号读取自：

`flowlens-extension/manifest.json`

每次正式发布前，先修改这里的 `version`，再运行发布工作流。
