# Stops the StudioFlow Photo Sender and stops it starting at sign-in.
# Shots still waiting in the EOS folder stay there.
$link = Join-Path ([Environment]::GetFolderPath('Startup')) 'StudioFlow Photo Sender.lnk'
if (Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link }
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -like '*photo-sender.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host ' The Photo Sender is stopped and removed from sign-in.'
