# StudioFlow Photo Sender setup (photographer's laptop). No admin rights needed.
# Asks for the two folders, saves them, and starts the sender now and at every sign-in.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$sender = Join-Path $here 'photo-sender.ps1'

Write-Host ''
Write-Host ' StudioFlow Photo Sender setup'
Write-Host ' -----------------------------'
$source = Read-Host ' 1. Folder EOS Utility saves into on THIS laptop [C:\EOS_Out]'
if (-not $source) { $source = 'C:\EOS_Out' }
$target = ''
while (-not $target) { $target = Read-Host ' 2. Server shared camera folder (e.g. \\STUDIO-SERVER\Camera1)' }
$source = $source.Trim().TrimEnd('\')
$target = $target.Trim().TrimEnd('\')

if (-not (Test-Path -LiteralPath $source)) { New-Item -ItemType Directory -Path $source -Force | Out-Null }
if (-not (Test-Path -LiteralPath $target)) {
  Write-Host ''
  Write-Host " WARNING: $target can't be opened from this laptop right now." -ForegroundColor Yellow
  Write-Host ' Open it once in File Explorer, sign in and tick "Remember my credentials".'
  Write-Host ' Until then the sender keeps the shots on this laptop.'
}

[ordered]@{ source = $source; target = $target; settleSeconds = 3 } | ConvertTo-Json |
  Set-Content -Encoding UTF8 -Path (Join-Path $here 'photo-sender.config.json')

# Start at sign-in through a shortcut in the user's Startup folder.
$powershell = (Get-Command powershell.exe).Source
$arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $sender + '"'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut(
  (Join-Path ([Environment]::GetFolderPath('Startup')) 'StudioFlow Photo Sender.lnk'))
$shortcut.TargetPath = $powershell
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $here
$shortcut.WindowStyle = 7
$shortcut.Save()

# Restart it now with the new settings.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -like '*photo-sender.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden

Write-Host ''
Write-Host ' Done. The Photo Sender is running and starts again at every sign-in.' -ForegroundColor Green
Write-Host " In EOS Utility, set the destination folder to: $source"
Write-Host (' Log file: ' + (Join-Path $here 'photo-sender.log'))
