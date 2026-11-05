@echo off
setlocal enabledelayedexpansion
title StudioFlow V2 - Database Backup

echo ========================================================
echo   StudioFlow V2 - Automated Database Backup (T053)
echo ========================================================
echo.

set ROOT=%~dp0..
cd /d "%ROOT%"

if not exist "pb_data\data.db" (
    echo [ERROR] PocketBase database "pb_data\data.db" not found!
    echo Aborting backup.
    pause
    exit /b 1
)

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set TIMESTAMP=%dt:~0,8%_%dt:~8,6%
if "%TIMESTAMP%"=="" (
    for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd_HHmmss'"`) do set TIMESTAMP=%%a
)

set BACKUP_DIR=backups\backup_%TIMESTAMP%
if not exist "backups" mkdir "backups"
mkdir "%BACKUP_DIR%"

echo Creating snapshot in %BACKUP_DIR%...
powershell -NoProfile -Command "Copy-Item -Path 'pb_data' -Destination '%BACKUP_DIR%\pb_data' -Recurse -Force"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo   [SUCCESS] Backup completed successfully!
    echo   Snapshot location: %BACKUP_DIR%
    echo ========================================================
) else (
    echo.
    echo [ERROR] Backup failed with exit code %ERRORLEVEL%.
)

echo.
pause
