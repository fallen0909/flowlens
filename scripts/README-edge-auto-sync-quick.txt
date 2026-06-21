FlowLens Edge 自动同步最简说明

一、第一次：
1. 安装 Git for Windows。
2. 找一个本地目录，右键打开终端，执行：
   git clone https://github.com/fallen0909/flowlens.git
   cd flowlens
3. 双击 scripts\start-edge-auto-sync.bat
4. Edge 打开 edge://extensions/
5. 打开开发人员模式。
6. 加载解压缩的扩展，选择：outputs\flowlens-extension（由 apps\extension 自动同步生成）

二、以后：
只要 start-edge-auto-sync.bat 这个窗口开着，GitHub 有新代码，本地会自动更新，Edge 扩展会自动重载。

三、如果只想手动更新一次：
双击 scripts\update-local-after-chatgpt-change.bat

四、如果想开机自动运行：
执行：
powershell -ExecutionPolicy Bypass -File scripts\install-edge-auto-sync-startup.ps1

五、如果想取消开机自动运行：
执行：
powershell -ExecutionPolicy Bypass -File scripts\uninstall-edge-auto-sync-startup.ps1
