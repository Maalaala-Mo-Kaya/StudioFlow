@echo off
setlocal
set "MODE=%~1"
if not "%MODE%"=="" if not "%MODE%"=="--apply" if not "%MODE%"=="--resume" (
    echo Usage: migrate-photo-folders.bat [--apply ^| --resume] [database] [photo-root]
    exit /b 1
)
set "DATABASE=%~2"
if not defined DATABASE set "DATABASE=%~dp0..\pb_data\data.db"
set "PHOTO_ROOT=%~3"
if not defined PHOTO_ROOT set "PHOTO_ROOT=%STUDIOFLOW_PHOTOS_ROOT%"
if not defined PHOTO_ROOT set "PHOTO_ROOT=C:\StudioFlow_Photos"

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js 22.13 or newer is required.
    exit /b 1
)
if "%MODE%"=="" (
    node "%~dp0migrate-photo-folders.cjs" "%DATABASE%" "%PHOTO_ROOT%"
    exit /b
)
echo Stop PocketBase and pause writes to the photo share before continuing.
echo Keep a paired backup of the database and photo root.
choice /c YN /n /m "Continue with these prerequisites met? [Y/N] "
if errorlevel 2 exit /b 1
if not errorlevel 1 exit /b 1
node "%~dp0migrate-photo-folders.cjs" "%DATABASE%" "%PHOTO_ROOT%" %MODE%
exit /b
