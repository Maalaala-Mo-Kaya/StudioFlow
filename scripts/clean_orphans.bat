@echo off
setlocal
echo ====================================================================
echo  StudioFlow V2 - Orphan Folder Scanner (T044 / R04)
echo ====================================================================

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required to run this script.
    pause
    exit /b 1
)

echo.
echo Select Operation Mode:
echo   [1] Dry Run (Scan and display empty folders without deleting)
echo   [2] Prune Mode (Safely remove empty orphan folders)
echo   [3] Cancel
echo.
set /p MODE="Enter selection (1, 2, or 3): "

if "%MODE%"=="1" (
    node "%~dp0clean_orphan_folders.cjs" --scan
) else if "%MODE%"=="2" (
    echo Stop PocketBase and pause writes to the photo share first.
    choice /c YN /n /m "Remove empty, unbound folders? [Y/N] "
    if errorlevel 2 exit /b 1
    if not errorlevel 1 exit /b 1
    node "%~dp0clean_orphan_folders.cjs" --prune
) else (
    echo Operation cancelled.
)

set "RESULT=%ERRORLEVEL%"
pause
exit /b %RESULT%
