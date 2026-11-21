@echo off
setlocal

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is missing. Install a supported Node.js version and reopen your terminal.
    exit /b 1
)

pushd "%~dp0.." || exit /b 1

if not exist "node_modules\.bin\vite.cmd" (
    echo [ERROR] Build dependencies are missing. Run npm ci in the StudioFlow project directory.
    popd
    exit /b 1
)

echo Building StudioFlow...
call npm.cmd run build
set "BUILD_RESULT=%ERRORLEVEL%"
popd

if not "%BUILD_RESULT%"=="0" (
    echo [ERROR] Build failed with exit code %BUILD_RESULT%.
    exit /b %BUILD_RESULT%
)

echo [OK] Build output: "%~dp0..\dist"
exit /b 0
