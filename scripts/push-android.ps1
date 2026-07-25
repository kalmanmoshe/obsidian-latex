$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $PSScriptRoot "local-config.ps1"

if (-not (Test-Path $configPath)) {
    throw @"
Missing local configuration:

    $configPath

Copy scripts\local-config.example.ps1 to scripts\local-config.ps1.
"@
}

. $configPath

$mainJsPath = Join-Path $projectRoot "main.js"

if (-not (Test-Path $mainJsPath)) {
    throw "main.js does not exist. Build the plugin first."
}

if ([string]::IsNullOrWhiteSpace($AndroidVaultPath)) {
    throw "AndroidVaultPath is not configured."
}

if ([string]::IsNullOrWhiteSpace($AndroidPluginFolder)) {
    throw "AndroidPluginFolder is not configured."
}

$remotePluginPath = (
    "$AndroidVaultPath/.obsidian/plugins/$AndroidPluginFolder"
).Replace("\", "/")

Write-Host "Checking connected Android devices..."

$devices = & $AdbPath devices

if ($LASTEXITCODE -ne 0) {
    throw "Unable to run ADB. Check AdbPath or add ADB to PATH."
}

$connectedDevices = @(
    $devices |
        Select-Object -Skip 1 |
        Where-Object { $_ -match "\sdevice$" }
)

if ($connectedDevices.Count -eq 0) {
    throw "No authorized Android device is connected."
}

Write-Host "Creating remote plugin directory..."

& $AdbPath shell mkdir -p $remotePluginPath

if ($LASTEXITCODE -ne 0) {
    throw "Unable to create the Android plugin directory."
}

Write-Host "Pushing main.js..."

& $AdbPath push `
    $mainJsPath `
    "$remotePluginPath/main.js"

if ($LASTEXITCODE -ne 0) {
    throw "ADB push failed."
}

Write-Host "main.js pushed successfully."