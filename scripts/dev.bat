@echo off
setlocal
pushd "%~dp0.." || exit /b 1

:: Development: the same two ports as production, each in its own window.
::   8091  PocketBase (staff port)            ./pb_data, ./pb_hooks, ./pb_migrations
::   8090  client gateway (client port)       forwards only the kiosk's calls to 8091
::   5173  Vite, staff UI  (npm run dev)       talks to :8091
::   5174  Vite, kiosk UI  (npm run dev:kiosk) talks to :8090, like a guest device

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is missing. Install a supported Node.js version and reopen your terminal.
    popd
    exit /b 1
)

echo Starting StudioFlow development servers...
start "StudioFlow PocketBase 8091 (staff)" pocketbase.exe serve --http=0.0.0.0:8091
start "StudioFlow Client Port 8090" node scripts\client-gateway.cjs --http=0.0.0.0:8090 --upstream=http://127.0.0.1:8091
start "StudioFlow Vite staff 5173" cmd /k npm.cmd run dev
start "StudioFlow Vite kiosk 5174" cmd /k npm.cmd run dev:kiosk

echo.
echo   Staff UI (dev):  http://localhost:5173   (API on :8091)
echo   Kiosk UI (dev):  http://localhost:5174   (API through the client port :8090)
echo   PocketBase:      http://localhost:8091/_/
echo.
echo Close the four windows to stop.
popd
exit /b 0
