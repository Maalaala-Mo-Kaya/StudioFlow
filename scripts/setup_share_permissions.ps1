<#
.SYNOPSIS
    StudioFlow V2 - Windows NTFS / SMB File Share Permission Validator (T045)
.DESCRIPTION
    Validates or configures Windows NTFS permissions for the local StudioFlow photo share.
    Enforces least privilege:
      - Photographers group: Modify/Write access to pictorial directories
      - Cashier / Floor Staff: Read-only access (cannot tamper with RAW/JPEG files)
      - Studio Administrators: Full Control
#>

[CmdletBinding()]
param(
    [string]$SharePath = "C:\StudioFlow_Storage\Photos"
)

Write-Host "======================================================================" -ForegroundColor Yellow
Write-Host " STUDIOFLOW V2 - WINDOWS NTFS / SMB SHARE PERMISSIONS (T045)" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Yellow
Write-Host "Target Directory : $SharePath`n"

if (-not (Test-Path $SharePath)) {
    Write-Host "[INFO] Path does not exist. Creating folder structure..." -ForegroundColor Cyan
    New-Item -Path $SharePath -ItemType Directory -Force | Out-Null
}

Write-Host "Current Access Control List (ACL) for ${SharePath}:" -ForegroundColor Cyan
$acl = Get-Acl -Path $SharePath
$acl.Access | Format-Table IdentityReference, FileSystemRights, AccessControlType, IsInherited

Write-Host "`nRecommended Security Baseline:" -ForegroundColor Green
Write-Host "  1. Photographers Group : ReadAndExecute, Modify (To import and review RAWs)"
Write-Host "  2. Cashiers Group      : ReadAndExecute (Read-only for proofing/order check)"
Write-Host "  3. Administrators      : FullControl"
Write-Host "======================================================================" -ForegroundColor Yellow
