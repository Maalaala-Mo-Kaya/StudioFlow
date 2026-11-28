<#
  StudioFlow port separation, on the server PC (second layer behind the router).

    8090  client port (scripts\client-gateway.cjs): open to everyone, guest Wi-Fi included.
    8091  staff port (PocketBase): BLOCKED from the guest subnet.

  The block rule wins over any allow rule, including the "pocketbase.exe" rule Windows may have
  created when PocketBase was first allowed through the firewall.

  Run in an elevated PowerShell (Run as administrator):
    powershell -ExecutionPolicy Bypass -File scripts\setup_port_firewall.ps1 -GuestSubnet 192.168.20.0/24
  Remove the rules:
    powershell -ExecutionPolicy Bypass -File scripts\setup_port_firewall.ps1 -Remove

  Only useful when guest devices reach this PC with their own addresses (a routed guest VLAN).
  If the router NATs the guest network onto the LAN, they look like LAN devices here: the router
  rule (guest -> server:8090 only) is then the only separation.
#>
[CmdletBinding()]
param(
  # The guest Wi-Fi's subnet, as the server sees it (e.g. 192.168.20.0/24). Several are allowed.
  [string[]]$GuestSubnet,
  [int]$ClientPort = 8090,
  [int]$StaffPort = 8091,
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$group = 'StudioFlow port separation'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this from an elevated PowerShell (Run as administrator).'
}

Get-NetFirewallRule -Group $group -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if ($Remove) {
  Write-Host "Removed the '$group' firewall rules."
  return
}
if (-not $GuestSubnet) { throw 'Pass -GuestSubnet <guest Wi-Fi subnet>, e.g. -GuestSubnet 192.168.20.0/24' }

New-NetFirewallRule -Group $group -DisplayName "StudioFlow client port $ClientPort (kiosk, everyone)" `
  -Direction Inbound -Protocol TCP -LocalPort $ClientPort -Action Allow -Profile Any | Out-Null
New-NetFirewallRule -Group $group -DisplayName "StudioFlow staff port $StaffPort (staff network)" `
  -Direction Inbound -Protocol TCP -LocalPort $StaffPort -Action Allow -Profile Any | Out-Null
New-NetFirewallRule -Group $group -DisplayName "StudioFlow staff port $StaffPort - block guest Wi-Fi" `
  -Direction Inbound -Protocol TCP -LocalPort $StaffPort -RemoteAddress $GuestSubnet -Action Block -Profile Any | Out-Null

Write-Host "Firewall rules set:"
Write-Host "  TCP $ClientPort open (client port)"
Write-Host "  TCP $StaffPort open, except from $($GuestSubnet -join ', ') (blocked)"
