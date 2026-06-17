# 取消 FlowLens Edge 自动同步脚本开机启动。
# 用法：powershell -ExecutionPolicy Bypass -File scripts\uninstall-edge-auto-sync-startup.ps1

$shortcutPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\FlowLens Edge Auto Sync.lnk"

if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force
    Write-Host "已取消开机启动：$shortcutPath"
} else {
    Write-Host "未找到开机启动项，无需处理。"
}
