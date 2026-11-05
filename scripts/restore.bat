@echo off
setlocal enabledelayedexpansion
title StudioFlow V2 - Database Restore

echo ========================================================
echo   StudioFlow V2 - Emergency Database Restore (T053)
echo ========================================================
echo.

set ROOT=%~dp0..
cd /d "%ROOT%"

:: Check if pocketbase is currently running
powershell -NoProfile -Command "if (Get-Process pocketbase -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
if %ERRORLEVEL% neq 0 (
    echo [WARNING] PocketBase server is currently RUNNING!
    echo Please stop pocketbase before restoring the database to prevent corruption.
    echo.
    echo Press any key to abort...
    pause >nul
    exit /b 1
)

if not exist "backups" (
    echo [ERROR] No "backups" directory found!
    pause
    exit /b 1
)

echo Available Backup Snapshots:
echo --------------------------------------------------------
set count=0
for /d %%D in (backups\backup_*) do (
    set /a count+=1
    echo   [!count!] %%~nxD
    set "B_!count!=%%D"
)

if %count% equ 0 (
    echo No backups found in backups\ folder!
    pause
    exit /b 1
)

echo.
set /p CHOICE="Enter snapshot number to restore (1-%count%, or 'q' to quit): "
if /i "%CHOICE%"=="q" exit /b 0

set SELECTED_BACKUP=!B_%CHOICE%!
if "%SELECTED_BACKUP%"=="" (
    echo [ERROR] Invalid selection!
    pause
    exit /b 1
)

echo.
echo You selected: %SELECTED_BACKUP%
echo [CAUTION] This will replace current pb_data with the snapshot!
set /p CONFIRM="Type 'RESTORE' to confirm: "
if not "%CONFIRM%"=="RESTORE" (
    echo Restore cancelled.
    pause
    exit /b 0
)

:: Safety archive of existing data
if exist "pb_data" (
    echo Archiving pre-restore state to backups\pre_restore_safety...
    powershell -NoProfile -Command "Copy-Item -Path 'pb_data' -Destination 'backups\pre_restore_safety' -Recurse -Force"
    rmdir /s /q "pb_data"
)

echo Restoring snapshot...
powershell -NoProfile -Command "Copy-Item -Path '%SELECTED_BACKUP%\pb_data' -Destination 'pb_data' -Recurse -Force"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo   [SUCCESS] Restore completed successfully!
    echo   Database restored from: %SELECTED_BACKUP%
    echo   You may now restart the server via run.bat.
    echo ========================================================
) else (
    echo.
    echo [ERROR] Restore operation failed.
)

echo.
pause
