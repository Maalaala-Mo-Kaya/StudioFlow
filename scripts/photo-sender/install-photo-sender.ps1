# StudioFlow Photo Sender setup (photographer's laptop). No admin rights needed.
#
# Copies the sender to %LOCALAPPDATA%\StudioFlow\PhotoSender (so the downloaded
# folder can be deleted afterwards), asks for the EOS folder, saves the settings,
# and starts the sender now and at every sign-in.
#
# A download from StudioFlow (Camera Import > Photo Sender) already knows the
# server and the camera: only the EOS folder is asked. Without one, it asks for
# the server's shared camera folder (older setup).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = Join-Path $env:LOCALAPPDATA 'StudioFlow\PhotoSender'
$files = @('photo-sender.ps1', 'uninstall-photo-sender.ps1', 'uninstall-photo-sender.bat', 'README.txt')

function Read-SenderConfig([string]$folder) {
  $path = Join-Path $folder 'photo-sender.config.json'
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  try { return Get-Content -Raw -Encoding UTF8 -LiteralPath $path | ConvertFrom-Json } catch { return $null }
}

function Test-StudioFlow($config) {
  try {
    $request = [Net.HttpWebRequest]::Create(([string]$config.server).TrimEnd('/') + '/api/studioflow/camera-sender/' + $config.camera + '/status')
    $request.Method = 'POST'
    $request.Proxy = $null
    $request.Timeout = 8000
    $request.ContentType = 'application/json'
    $request.Headers.Add('X-Camera-Key', [string]$config.key)
    $bytes = [Text.Encoding]::UTF8.GetBytes(([ordered]@{ host = $env:COMPUTERNAME; source = [string]$config.source; waiting = 0 } | ConvertTo-Json -Compress))
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Close() }
    $response = $request.GetResponse()
    $reader = New-Object IO.StreamReader($response.GetResponseStream())
    $reply = $reader.ReadToEnd() | ConvertFrom-Json
    $reader.Close(); $response.Close()
    return @{ ok = $true; reply = $reply }
  } catch {
    $message = $_.Exception.Message
    $ex = $_.Exception
    while ($ex -and -not ($ex -is [Net.WebException]) -and $ex.InnerException) { $ex = $ex.InnerException }
    if ($ex -is [Net.WebException] -and $ex.Response) {
      try {
        $reader = New-Object IO.StreamReader($ex.Response.GetResponseStream())
        $message = [string]($reader.ReadToEnd() | ConvertFrom-Json).message
        $reader.Close()
      } catch { }
    }
    return @{ ok = $false; message = $message }
  }
}

Write-Host ''
Write-Host ' StudioFlow Photo Sender setup'
Write-Host ' -----------------------------'

# The downloaded settings win over an older install's.
$config = Read-SenderConfig $here
if (-not $config) { $config = Read-SenderConfig $installDir }
$uploadMode = $config -and $config.server -and $config.camera -and $config.key

if ($uploadMode) {
  Write-Host (' Camera:  ' + $config.cameraName)
  Write-Host (' Server:  ' + $config.server)
  Write-Host ''
}

$defaultSource = 'C:\EOS_Out'
if ($config -and $config.source) { $defaultSource = [string]$config.source }
$source = Read-Host (' 1. Folder EOS Utility saves into on THIS laptop [' + $defaultSource + ']')
if (-not $source) { $source = $defaultSource }
$source = $source.Trim().TrimEnd('\')
if (-not (Test-Path -LiteralPath $source)) { New-Item -ItemType Directory -Path $source -Force | Out-Null }

if ($uploadMode) {
  $settings = [ordered]@{
    source = $source; server = ([string]$config.server).TrimEnd('/'); camera = [string]$config.camera
    cameraName = [string]$config.cameraName; key = [string]$config.key; settleSeconds = 3
  }
  $check = Test-StudioFlow $settings
  Write-Host ''
  if ($check.ok) {
    Write-Host (' Connected to StudioFlow: camera "' + $check.reply.camera + '".') -ForegroundColor Green
    if (-not $check.reply.enabled) { Write-Host ' Note: this camera is turned off in StudioFlow. Shots wait until it is on.' -ForegroundColor Yellow }
    if (-not $check.reply.folderOk) { Write-Host " Note: the camera's folder on the server can't be opened. Check Camera Import." -ForegroundColor Yellow }
  } else {
    Write-Host (" WARNING: StudioFlow can't be reached right now: " + $check.message) -ForegroundColor Yellow
    Write-Host ' Check that this laptop is on the studio Wi-Fi and the server is running.'
    Write-Host ' Until then the sender keeps the shots on this laptop.'
  }
} else {
  $target = ''
  while (-not $target) { $target = Read-Host ' 2. Server shared camera folder (e.g. \\STUDIO-SERVER\Camera1)' }
  $target = $target.Trim().TrimEnd('\')
  if (-not (Test-Path -LiteralPath $target)) {
    Write-Host ''
    Write-Host " WARNING: $target can't be opened from this laptop right now." -ForegroundColor Yellow
    Write-Host ' Open it once in File Explorer, sign in and tick "Remember my credentials".'
    Write-Host ' Until then the sender keeps the shots on this laptop.'
  }
  $settings = [ordered]@{ source = $source; target = $target; settleSeconds = 3 }
}

# Stop a running sender before replacing its files. Match "\photo-sender.ps1" exactly: this
# installer's own name (install-photo-sender.ps1) also ends in photo-sender.ps1.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match '(^|[\\" ])photo-sender\.ps1' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
if ((Resolve-Path -LiteralPath $here).Path.TrimEnd('\') -ne (Resolve-Path -LiteralPath $installDir).Path.TrimEnd('\')) {
  foreach ($name in $files) {
    $from = Join-Path $here $name
    if (Test-Path -LiteralPath $from) { Copy-Item -LiteralPath $from -Destination (Join-Path $installDir $name) -Force }
  }
}
# Files from a download are marked as coming from another computer; the sender runs hidden, so clear that.
Get-ChildItem -LiteralPath $installDir -File | ForEach-Object { try { Unblock-File -LiteralPath $_.FullName } catch { } }
$settings | ConvertTo-Json | Set-Content -Encoding UTF8 -Path (Join-Path $installDir 'photo-sender.config.json')

# Start at sign-in through a shortcut in the user's Startup folder.
$sender = Join-Path $installDir 'photo-sender.ps1'
$powershell = (Get-Command powershell.exe).Source
$arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $sender + '"'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut(
  (Join-Path ([Environment]::GetFolderPath('Startup')) 'StudioFlow Photo Sender.lnk'))
$shortcut.TargetPath = $powershell
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $installDir
$shortcut.WindowStyle = 7
$shortcut.Save()

Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden

Write-Host ''
Write-Host ' Done. The Photo Sender is running and starts again at every sign-in.' -ForegroundColor Green
Write-Host " In EOS Utility, set the destination folder to: $source"
Write-Host (' Installed in: ' + $installDir)
Write-Host (' Log file:     ' + (Join-Path $installDir 'photo-sender.log'))
if ($uploadMode) { Write-Host ' You can delete the downloaded folder now.' }
