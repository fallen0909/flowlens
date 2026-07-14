$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$src = Join-Path $root "apps\extension"
$outRoot = Join-Path $root "outputs\edge-addons"
$packageDir = Join-Path $outRoot "package"

if (Test-Path $packageDir) {
  Remove-Item -LiteralPath $packageDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $packageDir | Out-Null

robocopy $src $packageDir /MIR /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "robocopy failed with exit code $LASTEXITCODE"
}

$manifestPath = Join-Path $packageDir "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$manifest.PSObject.Properties.Remove("key")
$manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$reloadToken = Join-Path $packageDir "reload-token.txt"
if (Test-Path $reloadToken) {
  Remove-Item -LiteralPath $reloadToken -Force
}

$version = (Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json).version
$zipPath = Join-Path $outRoot "flowlens-edge-addons-$version.zip"
if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Push-Location $packageDir
try {
  Compress-Archive -Path * -DestinationPath $zipPath -Force
} finally {
  Pop-Location
}

Write-Host "Built: $zipPath"
