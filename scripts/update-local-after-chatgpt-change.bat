@echo off
cd /d "%~dp0.."
echo 正在从 GitHub 拉取最新代码...
git pull --ff-only origin master
if errorlevel 1 (
  echo.
  echo 拉取失败。可能是本地有修改或网络问题。
  pause
  exit /b 1
)
echo.
echo 正在同步到 Edge 加载目录...
powershell -ExecutionPolicy Bypass -Command "$src='apps\extension'; $dst='outputs\flowlens-extension'; if(!(Test-Path $dst)){New-Item -ItemType Directory -Force -Path $dst | Out-Null}; robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null; Set-Content -Path (Join-Path $dst 'reload-token.txt') -Value ([DateTimeOffset]::Now.ToUnixTimeMilliseconds()) -Encoding UTF8; Write-Host '同步完成。'"
echo.
echo 已完成，Edge 扩展会自动重载。content 脚本类修改请刷新网页。
pause
