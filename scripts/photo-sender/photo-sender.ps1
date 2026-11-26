# StudioFlow Photo Sender
#
# Runs on the photographer's laptop. EOS Utility saves each shot into a local
# folder (for example C:\EOS_Out). This script moves every finished shot from
# there into the server's camera folder (the shared folder StudioFlow watches,
# for example \\STUDIO-SERVER\Camera1). StudioFlow then puts it in the linked
# client's folder.
#
# Safety:
# - A shot is only sent once its size has stayed the same for a few seconds,
#   so a file EOS is still writing is never sent half done.
# - It is copied under a temporary name (*.sf-partial, which StudioFlow ignores),
#   checked for size, then renamed. The laptop copy is deleted only after that.
# - An existing file on the server is never overwritten (a _2, _3... is added).
# - If the server or Wi-Fi is down, shots stay on the laptop and are sent later.
#
# Settings are read from photo-sender.config.json next to this script.
# Windows PowerShell 5.1, no extra software needed.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $here 'photo-sender.config.json'
$logPath = Join-Path $here 'photo-sender.log'

function Write-SenderLog([string]$message) {
  try {
    if ((Test-Path $logPath) -and (Get-Item $logPath).Length -gt 5MB) {
      Move-Item -Force $logPath ($logPath + '.old')
    }
    Add-Content -Path $logPath -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $message) -Encoding UTF8
  } catch { }
}

# Only one sender at a time on this laptop.
$mutex = New-Object System.Threading.Mutex($false, 'Local\StudioFlowPhotoSender')
if (-not $mutex.WaitOne(0)) { exit 0 }

if (-not (Test-Path $configPath)) {
  Write-SenderLog "No settings file ($configPath). Run install-photo-sender.bat first."
  exit 1
}
$config = Get-Content -Raw -Path $configPath | ConvertFrom-Json
$source = [string]$config.source
$target = [string]$config.target
$settleSeconds = 3
if ($config.settleSeconds) { $settleSeconds = [int]$config.settleSeconds }
$extensions = @('.jpg', '.jpeg', '.png', '.cr3', '.cr2', '.crw', '.dng')
if ($config.extensions) { $extensions = @($config.extensions | ForEach-Object { ([string]$_).ToLower() }) }

Write-SenderLog "Started. From $source to $target."

# Last size seen per file, to tell when EOS has finished writing it.
$seen = @{}
$targetWasDown = $false

# Status for StudioFlow's Photo Floor: a small file in the server folder, rewritten every
# few seconds. StudioFlow shows it as "Photo Sender online / not heard from" (dot names are
# never imported). StudioFlow times it by the file's age on the server, not this laptop's clock.
$statusName = '.studioflow-sender.json'
$lastStatus = [DateTime]::MinValue
$lastSentAt = $null
$lastSentName = ''
$lastError = ''

function Write-SenderStatus([int]$waiting, [bool]$force) {
  if (-not $force -and ((Get-Date) - $script:lastStatus).TotalSeconds -lt 5) { return }
  $sentAgo = $null
  if ($script:lastSentAt) { $sentAgo = [int][Math]::Max(0, ((Get-Date) - $script:lastSentAt).TotalSeconds) }
  $status = [ordered]@{
    host = $env:COMPUTERNAME
    source = $source
    waiting = $waiting
    lastSentName = $script:lastSentName
    lastSentSecondsAgo = $sentAgo
    error = $script:lastError
  }
  try {
    [IO.File]::WriteAllText((Join-Path $target $statusName), ($status | ConvertTo-Json -Compress))
    $script:lastStatus = Get-Date
  } catch { }
}

function Get-FreeTargetPath([string]$folder, [string]$name) {
  $stem = [IO.Path]::GetFileNameWithoutExtension($name)
  $ext = [IO.Path]::GetExtension($name)
  $candidate = Join-Path $folder $name
  $n = 2
  while ((Test-Path -LiteralPath $candidate) -or (Test-Path -LiteralPath ($candidate + '.sf-partial'))) {
    $candidate = Join-Path $folder ($stem + '_' + $n + $ext)
    $n++
  }
  return $candidate
}

function Send-Shot([IO.FileInfo]$file) {
  # Keep EOS's subfolders (if any) under the target.
  $root = (Get-Item -LiteralPath $source).FullName.TrimEnd('\')
  $relative = ''
  if ($file.DirectoryName.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
    $relative = $file.DirectoryName.Substring($root.Length).TrimStart('\')
  }
  $folder = if ($relative) { Join-Path $target $relative } else { $target }
  if (-not (Test-Path -LiteralPath $folder)) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
  $final = Get-FreeTargetPath $folder $file.Name
  $partial = $final + '.sf-partial'
  try {
    # Opening the source for reading fails while EOS still holds it for writing.
    [IO.File]::Copy($file.FullName, $partial, $false)
    if ((Get-Item -LiteralPath $partial).Length -ne $file.Length) { throw 'The copy on the server is incomplete.' }
    [IO.File]::Move($partial, $final)
  } catch {
    if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue }
    throw
  }
  Remove-Item -LiteralPath $file.FullName -Force
  Write-SenderLog ('Sent ' + $file.Name + ' -> ' + $final)
}

while ($true) {
  try {
    if (-not (Test-Path -LiteralPath $target)) {
      if (-not $targetWasDown) { Write-SenderLog "The server folder $target can't be reached. Shots wait on this laptop." }
      $targetWasDown = $true
      Start-Sleep -Seconds 5
      continue
    }
    if ($targetWasDown) { Write-SenderLog 'The server folder is back. Sending waiting shots.' }
    $targetWasDown = $false

    if (-not (Test-Path -LiteralPath $source)) {
      New-Item -ItemType Directory -Path $source -Force | Out-Null
    }
    $now = Get-Date
    $files = Get-ChildItem -LiteralPath $source -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $extensions -contains $_.Extension.ToLower() -and $_.Name -notmatch '^[.~$]' } |
      Sort-Object LastWriteTime
    $present = @{}
    $waiting = 0
    $sent = $false
    foreach ($file in $files) {
      $key = $file.FullName.ToLower()
      $present[$key] = $true
      $stable = $seen.ContainsKey($key) -and $seen[$key] -eq $file.Length -and $file.Length -gt 0 `
        -and ($now - $file.LastWriteTime).TotalSeconds -ge $settleSeconds
      $seen[$key] = $file.Length
      if (-not $stable) { $waiting++; continue }
      try {
        Send-Shot $file
        $seen.Remove($key)
        $lastSentAt = Get-Date
        $lastSentName = $file.Name
        $lastError = ''
        $sent = $true
      } catch {
        $waiting++
        $lastError = 'Waiting to send ' + $file.Name + ': ' + $_.Exception.Message
        Write-SenderLog $lastError
      }
    }
    foreach ($key in @($seen.Keys)) { if (-not $present.ContainsKey($key)) { $seen.Remove($key) } }
    Write-SenderStatus $waiting $sent
  } catch {
    $lastError = 'Error: ' + $_.Exception.Message
    Write-SenderLog $lastError
  }
  Start-Sleep -Seconds 1
}
