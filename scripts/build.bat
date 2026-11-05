@echo off

cd /d "%~dp0\.."

echo Building...

npm run build

if %errorlevel% neq 0 (
    echo Build failed.
    pause
    exit /b 1
)
echo Build complete.
