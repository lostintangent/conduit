# Conduit Installation Script for Windows
# Downloads and installs the latest release from GitHub

$ErrorActionPreference = "Stop"

$repo = "lostintangent/conduit"
$appName = "Conduit"

Write-Host "🚀 Starting Conduit installation..." -ForegroundColor Green
Write-Host ""

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "⚠️  Note: Not running as administrator. Installation may require elevation." -ForegroundColor Yellow
    Write-Host ""
}

# Detect architecture
$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
Write-Host "📋 Detected architecture: $arch" -ForegroundColor Cyan
Write-Host ""

# Get latest release information
Write-Host "🔍 Fetching latest release information..." -ForegroundColor Cyan
try {
    $releaseInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest"
    $releaseTag = $releaseInfo.tag_name
    Write-Host "✅ Found latest release: $releaseTag" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "❌ Error: Could not fetch latest release information" -ForegroundColor Red
    Write-Host "Please check your internet connection and try again." -ForegroundColor Red
    exit 1
}

# Find the Windows installer (Setup.exe)
$asset = $releaseInfo.assets | Where-Object { $_.name -like "*Setup.exe" } | Select-Object -First 1

if (-not $asset) {
    Write-Host "❌ Error: Could not find Windows installer in the latest release" -ForegroundColor Red
    Write-Host "Please check the releases page manually: https://github.com/$repo/releases" -ForegroundColor Red
    exit 1
}

$downloadUrl = $asset.browser_download_url
Write-Host "📥 Downloading from: $downloadUrl" -ForegroundColor Cyan
Write-Host ""

# Create temporary directory
$tempDir = Join-Path $env:TEMP "conduit-install-$(Get-Random)"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
    # Download the installer
    $installerPath = Join-Path $tempDir "ConduitSetup.exe"
    
    Write-Host "⏬ Downloading installer..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing
    
    Write-Host "✅ Download complete" -ForegroundColor Green
    Write-Host ""
    
    # Run the installer
    Write-Host "📦 Running installer..." -ForegroundColor Cyan
    Write-Host "Please follow the installation wizard prompts." -ForegroundColor Yellow
    Write-Host ""
    
    Start-Process -FilePath $installerPath -Wait
    
    Write-Host ""
    Write-Host "✅ Installation complete!" -ForegroundColor Green
    Write-Host "🎉 Conduit has been installed" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now launch Conduit from your Start Menu." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📚 For more information, visit: https://github.com/$repo" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ Error: Installation failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    # Clean up temporary directory
    if (Test-Path $tempDir) {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
