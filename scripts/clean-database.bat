@echo off
setlocal
title StudioFlow - Clean Database

echo ========================================================
echo   StudioFlow - Clean Database
echo ========================================================
echo.
echo IMPORTANT:
echo   - Stop PocketBase first (close the window started by run.bat).
echo   - A backup of pb_data will be created before anything is changed.
echo   - The reset script will ask you to type RESET before continuing.
echo.
echo Select cleanup mode:
echo   [1] Keep setup   - remove client/job data, payments, receipts,
echo                     MUA records, signatures and server logs.
echo                     Keep schools, packages, staff and cameras.
echo   [2] Factory fresh - replace the database with the built-in starter
echo                     setup. This also removes custom setup records.
echo   [3] Cancel
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js 22.13 or newer is required.
    pause
    exit /b 1
)

set "MODE="
set /p "MODE=Enter selection (1, 2, or 3): "

if "%MODE%"=="1" (
    node "%~dp0reset-for-handover.cjs" --mode keep
) else if "%MODE%"=="2" (
    node "%~dp0reset-for-handover.cjs" --mode fresh
) else (
    echo Cleanup cancelled. Nothing was changed.
)

echo.
pause
exit /b %errorlevel%
