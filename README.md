# 瀑光 FlowLens

![瀑光 FlowLens 项目封面](docs/assets/flowlens-hero.png)

瀑光 FlowLens 是一个把网页看图体验变顺手的小工具。它会把网页里零散、分页、尺寸不一的图片和视频收拢起来，整理成全屏瀑布流，让你像刷本地相册一样连续浏览、放大查看、切换上一张下一张，必要时还可以打包下载。

很多多图网页的问题都很具体：广告和正文混在一起，缩略图太小，下一页要反复点，点开大图会丢失浏览位置，视频和类 GIF 又要在不同播放器之间切换。瀑光做的就是把这些干扰拿掉，把注意力还给图片本身。

## 版本入口

### 电脑端：Edge / Chrome 扩展

目录：`xchina-immersive-viewer/`

适合桌面 Edge、Chrome 使用。打开浏览器扩展管理页，开启开发者模式，然后选择这个目录“加载解压缩的扩展”。

主要文件：

- `manifest.json`：浏览器扩展配置
- `content.js`：图片流主逻辑和界面
- `background.js`：下载、跨源抓取和自动重载
- `icons/`：扩展图标

### 手机端：Android Edge / Tampermonkey

目录：`mobile-userscript/`

适合 Android Edge 安装 Tampermonkey 后使用。手机端不加载未打包扩展，而是安装 `flowlens.user.js`。

主要文件：

- `flowlens.user.js`：手机端油猴脚本
- `install-userscript.html`：本地安装/更新入口
- `build-userscript.js`：从桌面端共享逻辑重新生成手机脚本

重新生成手机脚本：

```powershell
node mobile-userscript/build-userscript.js
```

## 有意思的地方

![瀑光 FlowLens 图标](docs/assets/flowlens-icon-source.png)

- 一键进入全屏图片流，不用在原网页里和广告、分页、布局较劲。
- 支持图片和类 GIF 视频：`mp4`、`webm`、`mov`、`m4v`。
- 瀑布流密集排布，一屏看到更多内容，适合快速筛选和沉浸浏览。
- 大图模式支持键盘、滚轮、侧边箭头切换，点空白处退出。
- 点击图片/视频可在“适应屏幕”和“1:1 原尺寸”之间切换。
- 原尺寸模式下可拖动查看细节。
- 本地运行，不上传图片；只处理当前页面和明确适配过的套图页面。

## 当前重点适配

- `xchina.co/photo/*`
- `x.810114.xyz/photo/*`

通用网页只收集当前页面已有和动态新增的有效大图/媒体。只有明确适配过的套图详情页才会触发多页抓取，避免对任意网站盲目扫分页。

## 本地开发

修改桌面扩展源码后运行：

```powershell
node --check xchina-immersive-viewer/content.js
node --check xchina-immersive-viewer/background.js
node -e "JSON.parse(require('fs').readFileSync('xchina-immersive-viewer/manifest.json','utf8')); console.log('manifest ok')"
```

同步到本地 Edge 加载目录：

```powershell
Copy-Item -Path xchina-immersive-viewer\* -Destination outputs\xchina-immersive-viewer -Recurse -Force
```

`outputs/` 是本机开发加载目录，不作为 GitHub 主要源码提交。
