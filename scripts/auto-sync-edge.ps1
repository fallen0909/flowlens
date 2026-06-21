# FlowLens Edge 自动同步脚本
# 用法：在项目根目录运行：powershell -ExecutionPolicy Bypass -File scripts\auto-sync-edge.ps1
# 效果：自动 git pull → 同步 apps/extension 到 outputs/flowlens-extension → 更新 reload-token.txt 触发 Edge 扩展重载。

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$src = Join-Path $projectRoot "apps\extension"
$dst = Join-Path $projectRoot "outputs\flowlens-extension"
$tokenFile = Join-Path $dst "reload-token.txt"
$branch = "master"
$intervalSeconds = 20

function Write-Info($message) {
    $time = Get-Date -Format "HH:mm:ss"
    Write-Host "[$time] $message"
}

function Ensure-GitRepo {
    if (!(Test-Path (Join-Path $projectRoot ".git"))) {
        throw "当前目录不是 Git 仓库。请先 git clone https://github.com/fallen0909/flowlens.git 到本地，再运行本脚本。"
    }

    $gitVersion = git --version 2>$null
    if (!$gitVersion) {
        throw "未检测到 Git。请先安装 Git for Windows。"
    }
}

function Sync-ExtensionToEdge {
    if (!(Test-Path $src)) {
        throw "找不到源码目录：$src"
    }

    if (!(Test-Path $dst)) {
        New-Item -ItemType Directory -Force -Path $dst | Out-Null
    }

    # /MIR 表示镜像同步，让 outputs 目录和 apps/extension 保持一致。
    robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "同步文件失败，robocopy exit code: $LASTEXITCODE"
    }

    $token = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    Set-Content -Path $tokenFile -Value $token -Encoding UTF8
    Write-Info "已同步到 Edge 加载目录，并刷新 reload-token：$token"
}

function Get-CurrentHead {
    return (git -C $projectRoot rev-parse HEAD).Trim()
}

function Pull-LatestFromGithub {
    $before = Get-CurrentHead

    Write-Info "检查 GitHub 最新代码..."
    git -C $projectRoot fetch origin $branch | Out-Null
    git -C $projectRoot pull --ff-only origin $branch | Out-Null

    $after = Get-CurrentHead
    return $before -ne $after
}

Ensure-GitRepo
Sync-ExtensionToEdge
Write-Info "开始监听 GitHub 更新。关闭窗口即可停止。"
Write-Info "Edge 扩展请加载：$dst"

while ($true) {
    try {
        $changed = Pull-LatestFromGithub
        if ($changed) {
            Write-Info "检测到 GitHub 有新提交，开始同步扩展..."
            Sync-ExtensionToEdge
        } else {
            Write-Info "暂无新提交。"
        }
    } catch {
        Write-Host "[错误] $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "如果你本地改过文件导致 pull 失败，请先提交、丢弃或备份本地修改。" -ForegroundColor Yellow
    }

    Start-Sleep -Seconds $intervalSeconds
}
