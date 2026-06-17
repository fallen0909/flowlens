# 将 FlowLens Edge 自动同步脚本加入当前用户开机启动。
# 用法：powershell -ExecutionPolicy Bypass -File scripts\install-edge-auto-sync-startup.ps1

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$targetScript = Join-Path $scriptDir "auto-sync-edge.ps1"
$shortcutPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\FlowLens Edge Auto Sync.lnk"

if (!(Test-Path $targetScript)) {
    throw "找不到自动同步脚本：$targetScript"
}

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-ExecutionPolicy Bypass -WindowStyle Minimized -File `"$targetScript`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "powershell.exe,0"
$shortcut.Save()

Write-Host "已加入开机启动：$shortcutPath"
Write-Host "下次开机后会自动运行 FlowLens Edge 自动同步。"
