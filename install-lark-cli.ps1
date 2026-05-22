param(
    [string]$InstallRoot = (Join-Path $PSScriptRoot "lark-cli")
)

$ErrorActionPreference = "Stop"

$installRoot = $InstallRoot
$binDir = Join-Path $installRoot "bin"
$downloadDir = Join-Path $PSScriptRoot "lark-cli-download"

New-Item -ItemType Directory -Force -Path $binDir, $downloadDir | Out-Null

function Find-LarkCliExe {
    param([string]$Path)

    Get-ChildItem -Path $Path -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -in @("lark-cli.exe", "lark.exe", "feishu-cli.exe") } |
        Select-Object -First 1
}

$existingZip = Get-ChildItem -Path $downloadDir -Filter "*windows*amd64*.zip" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if ($existingZip) {
    $zipPath = $existingZip.FullName
    Write-Host "Using existing archive: $zipPath"
} else {
    Write-Host "Fetching latest release metadata..."
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/larksuite/cli/releases/latest" -Headers @{ "User-Agent" = "codex" }
    $asset = $release.assets |
        Where-Object { $_.name -match "windows" -and $_.name -match "amd64" -and $_.name -match "\.zip$" } |
        Select-Object -First 1

    if (-not $asset) {
        throw "Could not find a Windows amd64 zip asset in the latest larksuite/cli release."
    }

    $zipPath = Join-Path $downloadDir $asset.name
    Write-Host "Downloading $($asset.name)..."
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath
}

$extractDir = Join-Path $downloadDir "extracted"
if (Test-Path $extractDir) {
    Remove-Item -Recurse -Force -Path $extractDir
}
New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
$exe = Find-LarkCliExe -Path $extractDir

if (-not $exe) {
    throw "Archive extracted, but no lark-cli.exe/lark.exe/feishu-cli.exe was found."
}

Copy-Item -Force -Path $exe.FullName -Destination (Join-Path $binDir $exe.Name)

$pathUpdated = $false
try {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $pathParts = @($userPath -split ";") | Where-Object { $_ }
    if ($pathParts -notcontains $binDir) {
        $newPath = (($pathParts + $binDir) -join ";")
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        $env:Path = "$env:Path;$binDir"
        $pathUpdated = $true
        Write-Host "Added to user PATH: $binDir"
    }
} catch {
    Write-Warning "Installed CLI, but could not update user PATH automatically: $($_.Exception.Message)"
}

$installedExe = Join-Path $binDir $exe.Name
Write-Host "Installed: $installedExe"
if (-not $pathUpdated) {
    Write-Host "Use this path directly or add it to PATH: $binDir"
}
& $installedExe --version
