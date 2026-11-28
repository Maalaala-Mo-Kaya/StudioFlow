# StudioFlow Photo Sender
#
# Runs on the photographer's laptop. EOS Utility saves each shot into a local
# folder (for example C:\EOS_Out). This script moves every finished shot from
# there to the StudioFlow server, which puts it in the linked client's folder.
#
# Two ways to send (photo-sender.config.json decides):
# - Network upload (the default for a download from StudioFlow): "server",
#   "camera" and "key" are set. Each shot is uploaded to StudioFlow over the
#   network. No Windows file sharing is needed.
# - Shared folder (older setup): "target" is the server's shared camera folder,
#   for example \\STUDIO-SERVER\Camera1.
#
# Safety:
# - A shot is only sent once its size has stayed the same for a few seconds,
#   so a file EOS is still writing is never sent half done.
# - Upload: the server checks the size and replies; a retry of a shot that
#   already arrived is not saved twice. Shared folder: copied under a temporary
#   name (*.sf-partial, which StudioFlow ignores), checked, then renamed.
# - The laptop copy is deleted only after the server has the whole file.
# - An existing file on the server is never overwritten (a _2, _3... is added).
# - If the server or Wi-Fi is down, shots stay on the laptop and are sent later.
#
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
$config = Get-Content -Raw -Encoding UTF8 -Path $configPath | ConvertFrom-Json
$source = [string]$config.source
$target = [string]$config.target
$server = ([string]$config.server).TrimEnd('/')
$camera = [string]$config.camera
$key = [string]$config.key
$uploadMode = [bool]($server -and $camera -and $key)
$settleSeconds = 3
if ($config.settleSeconds) { $settleSeconds = [int]$config.settleSeconds }
$extensions = @('.jpg', '.jpeg', '.png', '.cr3', '.cr2', '.crw', '.dng')
if ($config.extensions) { $extensions = @($config.extensions | ForEach-Object { ([string]$_).ToLower() }) }

if ($uploadMode) {
  Write-SenderLog "Started. From $source to StudioFlow at $server (camera $($config.cameraName))."
} else {
  Write-SenderLog "Started. From $source to $target."
}

# Last size seen per file, to tell when EOS has finished writing it.
$seen = @{}
$targetWasDown = $false
$lastWaiting = 0

# Status for StudioFlow's Photo Floor ("Photo Sender online / not heard from").
# Shared folder: a small file in the server folder (dot names are never imported).
# Upload: posted to StudioFlow, which saves the same file. Either way StudioFlow
# times it on the server, not by this laptop's clock.
$statusName = '.studioflow-sender.json'
$lastStatus = [DateTime]::MinValue
$lastSentAt = $null
$lastSentName = ''
$lastError = ''

# --- Network upload -------------------------------------------------------------

function Get-WebErrorMessage($err) {
  $ex = $err.Exception
  while ($ex -and -not ($ex -is [Net.WebException]) -and $ex.InnerException) { $ex = $ex.InnerException }
  if ($ex -is [Net.WebException] -and $ex.Response) {
    $code = [int]$ex.Response.StatusCode
    $message = ''
    try {
      $reader = New-Object IO.StreamReader($ex.Response.GetResponseStream())
      $body = $reader.ReadToEnd()
      $reader.Close()
      $message = [string]($body | ConvertFrom-Json).message
    } catch { }
    if (-not $message) { $message = $ex.Message }
    return @{ code = $code; message = "$message (HTTP $code)" }
  }
  return @{ code = 0; message = $err.Exception.Message }
}

function New-SenderRequest([string]$path, [string]$method, [int]$timeoutMs) {
  $request = [Net.HttpWebRequest]::Create($server + $path)
  $request.Method = $method
  $request.Proxy = $null
  $request.KeepAlive = $true
  $request.Timeout = $timeoutMs
  $request.ReadWriteTimeout = $timeoutMs
  $request.Headers.Add('X-Camera-Key', $key)
  return $request
}

function Read-SenderResponse($request) {
  $response = $request.GetResponse()
  try {
    $reader = New-Object IO.StreamReader($response.GetResponseStream())
    $body = $reader.ReadToEnd()
    $reader.Close()
  } finally { $response.Close() }
  if ($body) { return $body | ConvertFrom-Json }
  return $null
}

# Same id for the same shot on every retry, so a shot that arrived (but whose reply
# was lost) is not saved twice.
function Get-UploadId([IO.FileInfo]$file) {
  $text = ($env:COMPUTERNAME + '|' + $file.FullName.ToLower() + '|' + $file.Length + '|' + $file.LastWriteTimeUtc.Ticks)
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $hash = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text))
  } finally { $sha.Dispose() }
  return (-join ($hash | ForEach-Object { $_.ToString('x2') })).Substring(0, 40)
}

function Send-ShotUpload([IO.FileInfo]$file) {
  $request = New-SenderRequest ('/api/studioflow/camera-sender/' + $camera + '/upload?name=' + [Uri]::EscapeDataString($file.Name)) 'POST' 600000
  $request.ContentType = 'application/octet-stream'
  $request.Headers.Add('X-Upload-Id', (Get-UploadId $file))
  $request.AllowWriteStreamBuffering = $false
  $request.SendChunked = $false
  # Opening the shot for reading fails while EOS still holds it for writing.
  $shot = [IO.File]::Open($file.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    $request.ContentLength = $shot.Length
    $stream = $request.GetRequestStream()
    try { $shot.CopyTo($stream, 1MB) } finally { $stream.Close() }
  } finally { $shot.Close() }
  $reply = Read-SenderResponse $request
  if (-not $reply -or ($reply.status -ne 'saved' -and $reply.status -ne 'already')) { throw 'StudioFlow did not confirm the upload.' }
  return ('StudioFlow (' + $reply.name + ', ' + $reply.status + ')')
}

# --- Shared folder --------------------------------------------------------------

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

function Send-ShotShare([IO.FileInfo]$file) {
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
  return $final
}

# --- After a send ---------------------------------------------------------------

# Shots the server already has whose laptop copy could not be deleted yet (EOS Utility or a
# preview still has it open). They are never sent again, only deleted later, and they don't
# hold up the shots behind them. Keyed by path, holding the shot's id (path, size, time).
$delivered = @{}

# Returns $true once the laptop copy is gone.
function Remove-SentShot([IO.FileInfo]$file) {
  try {
    Remove-Item -LiteralPath $file.FullName -Force
    return $true
  } catch {
    return (-not (Test-Path -LiteralPath $file.FullName))
  }
}

# --- Status ---------------------------------------------------------------------

# Returns $false when the server can't be reached.
function Write-SenderStatus([int]$waiting, [bool]$force) {
  if (-not $force -and ((Get-Date) - $script:lastStatus).TotalSeconds -lt 5) { return $true }
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
  $json = $status | ConvertTo-Json -Compress
  try {
    if ($uploadMode) {
      $request = New-SenderRequest ('/api/studioflow/camera-sender/' + $camera + '/status') 'POST' 8000
      $request.ContentType = 'application/json'
      $bytes = [Text.Encoding]::UTF8.GetBytes($json)
      $request.ContentLength = $bytes.Length
      $stream = $request.GetRequestStream()
      try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Close() }
      $reply = Read-SenderResponse $request
      $offMessage = 'This camera is turned off in StudioFlow. Shots wait on this laptop.'
      if ($reply -and -not $reply.enabled) { $script:lastError = $offMessage }
      elseif ($script:lastError -eq $offMessage) { $script:lastError = '' }
    } else {
      [IO.File]::WriteAllText((Join-Path $target $statusName), $json)
    }
    $script:lastStatus = Get-Date
    return $true
  } catch {
    if ($uploadMode) {
      $problem = Get-WebErrorMessage $_
      if ($problem.code -eq 401) {
        $script:lastError = $problem.message
        Write-SenderLog $problem.message
        $script:lastStatus = Get-Date
      }
      return ($problem.code -ne 0)
    }
    return $false
  }
}

function Test-ServerReady {
  if (-not $uploadMode) { return (Test-Path -LiteralPath $target) }
  if ($script:targetWasDown -or ((Get-Date) - $script:lastStatus).TotalSeconds -ge 5) {
    return (Write-SenderStatus $script:lastWaiting $true)
  }
  return $true
}

$where = if ($uploadMode) { "StudioFlow at $server" } else { "The server folder $target" }

while ($true) {
  try {
    if (-not (Test-ServerReady)) {
      if (-not $targetWasDown) { Write-SenderLog "$where can't be reached. Shots wait on this laptop." }
      $targetWasDown = $true
      Start-Sleep -Seconds 5
      continue
    }
    if ($targetWasDown) { Write-SenderLog 'The server is back. Sending waiting shots.' }
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
    $offline = $false
    foreach ($file in $files) {
      $key2 = $file.FullName.ToLower()
      $present[$key2] = $true
      if ($offline) { $waiting++; continue }
      $shotId = $null
      if ($delivered.ContainsKey($key2)) {
        $shotId = Get-UploadId $file
        if ($delivered[$key2] -eq $shotId) {
          if (Remove-SentShot $file) {
            $delivered.Remove($key2)
            Write-SenderLog ('Deleted the laptop copy of ' + $file.Name + ' (already sent).')
          }
          continue
        }
        # A new shot under the same name: send it like any other.
        $delivered.Remove($key2)
        $shotId = $null
      }
      $stable = $seen.ContainsKey($key2) -and $seen[$key2] -eq $file.Length -and $file.Length -gt 0 `
        -and ($now - $file.LastWriteTime).TotalSeconds -ge $settleSeconds
      $seen[$key2] = $file.Length
      if (-not $stable) { $waiting++; continue }
      try {
        $shotId = Get-UploadId $file
        if ($uploadMode) { $sentTo = Send-ShotUpload $file } else { $sentTo = Send-ShotShare $file }
        if (Remove-SentShot $file) {
          Write-SenderLog ('Sent ' + $file.Name + ' -> ' + $sentTo)
        } else {
          $delivered[$key2] = $shotId
          Write-SenderLog ('Sent ' + $file.Name + ' -> ' + $sentTo + '. The laptop copy is still open in another program; it is deleted later.')
        }
        $seen.Remove($key2)
        $lastSentAt = Get-Date
        $lastSentName = $file.Name
        $lastError = ''
        $sent = $true
      } catch {
        $waiting++
        $previousError = $lastError
        if ($uploadMode) {
          $problem = Get-WebErrorMessage $_
          # No answer, wrong key, camera off or server folder missing: stop this round.
          if ($problem.code -eq 0 -or $problem.code -eq 401 -or $problem.code -eq 409 -or $problem.code -eq 503) { $offline = $true }
          # No HTTP answer: the server may be down, or it refused the shot and closed the
          # connection before the whole file was written. The small status call next round
          # tells the two apart (and reports a wrong key or a camera turned off).
          if ($problem.code -eq 0) { $lastStatus = [DateTime]::MinValue }
          $lastError = 'Waiting to send ' + $file.Name + ': ' + $problem.message
        } else {
          $lastError = 'Waiting to send ' + $file.Name + ': ' + $_.Exception.Message
        }
        # The same problem every second would fill the log.
        if ($lastError -ne $previousError) { Write-SenderLog $lastError }
      }
    }
    foreach ($k in @($seen.Keys)) { if (-not $present.ContainsKey($k)) { $seen.Remove($k) } }
    foreach ($k in @($delivered.Keys)) { if (-not $present.ContainsKey($k)) { $delivered.Remove($k) } }
    $lastWaiting = $waiting
    if ($targetWasDown) {
      Write-SenderLog "$where can't be reached. Shots wait on this laptop."
      Start-Sleep -Seconds 5
      continue
    }
    [void](Write-SenderStatus $waiting $sent)
    # Refused (wrong key, camera off): try again in a few seconds, not every second.
    if ($offline) { Start-Sleep -Seconds 4 }
  } catch {
    $lastError = 'Error: ' + $_.Exception.Message
    Write-SenderLog $lastError
  }
  Start-Sleep -Seconds 1
}
