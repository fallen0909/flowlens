# FlowLens 电脑端 Edge 自动同步说明

这个方案解决的是：ChatGPT 或你自己把代码改到 GitHub 后，本地电脑自动拉取最新代码，并自动同步到 Edge 扩展加载目录。

## 第一次使用

1. 把仓库 clone 到本地：

```powershell
git clone https://github.com/fallen0909/flowlens.git
cd flowlens
```

2. 运行自动同步脚本：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\auto-sync-edge.ps1
```

3. 打开 Edge 扩展页：

```text
edge://extensions/
```

4. 打开“开发人员模式”。

5. 点击“加载解压缩的扩展”，选择：

```text
flowlens\outputs\flowlens-extension
```

以后只要这个 PowerShell 窗口开着，本地会自动检查 GitHub 更新。

## 日常使用

当 GitHub 上有新提交后，脚本会自动执行：

```text
git pull
↓
同步 flowlens-extension 到 outputs/flowlens-extension
↓
更新 reload-token.txt
↓
Edge 扩展自动重载
```

如果修改的是 content.js、content-*.js，扩展重载后，当前网页通常还需要手动刷新一次，页面里注入的脚本才会变成最新版。

## 停止同步

直接关闭 PowerShell 窗口即可。

## 常见问题

### pull 失败怎么办？

一般是你本地也改过文件，和 GitHub 最新代码冲突了。处理方法：

- 本地修改不要了：先备份，然后执行 `git reset --hard origin/master`；
- 本地修改还要保留：先提交本地修改，再 pull。

### Edge 没变化怎么办？

确认 Edge 加载的是：

```text
outputs\flowlens-extension
```

不要加载源码目录：

```text
flowlens-extension
```
