@echo off
setlocal
pushd "%~dp0" || exit /b 1
title Highlight Server

if "%~1"=="--dev" goto :dev
if "%~1"=="--build" goto :build
goto :server

:dev
call "%~dp0scripts\dev.bat"
popd
exit /b %ERRORLEVEL%

:build
call "%~dp0scripts\build.bat"
if %errorlevel% neq 0 (
    echo aborting...
    pause
    popd
    exit /b 1
)

:server
call "%~dp0ascii.bat"
echo.
echo Starting Server...

set IP=
for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "[System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | Where-Object { $_.OperationalStatus -eq 'Up' -and $_.NetworkInterfaceType -ne 'Loopback' -and $_.Description -notmatch 'Virtual|VMware|Hyper-V|WSL|TAP' } | ForEach-Object { $_.GetIPProperties().UnicastAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' } | ForEach-Object { $_.Address.ToString() } } | Select-Object -First 1"`) do (
    set IP=%%a
)

if "%IP%"=="" (
    for /f "tokens=4" %%a in ('route print -4 ^| find " 0.0.0.0" ^| findstr /v "192.168.190. 192.168.187. 192.168.56. 169.254. Default"') do (
        set IP=%%a
        goto :found_ip
    )
)

:found_ip
if "%IP%"=="" set IP=127.0.0.1
set IP=%IP: =%

echo.
echo ========================================================
echo   Hi-Light StudioFlow Server
echo ========================================================
echo.
echo  CLIENT port 8090 - students / guest Wi-Fi (kiosk only):
echo    - Registration:    http://%IP%:8090
echo.
echo  STAFF port 8091 - staff network only (never the guest Wi-Fi):
echo    - Stations:        http://%IP%:8091
echo    - Admin Dashboard: http://%IP%:8091/_/
echo    - On this PC:      http://localhost:8091
echo.
echo  Router: let the guest network reach %IP%:8090 only.
echo ========================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is missing, so the client port 8090 can't start.
    echo         Install Node.js, or students will not be able to register.
    echo.
) else if not exist "%~dp0pb_public_kiosk\index.html" (
    echo [WARN] No kiosk build in pb_public_kiosk. Run "run.bat --build" so port 8090 has a page to show.
    echo.
)

:: Client port: the kiosk build plus only the calls the kiosk makes (scripts\client-gateway.cjs).
where node >nul 2>&1
if not errorlevel 1 (
    echo Launching the client gateway on 0.0.0.0:8090 ^(separate window^)...
    start "StudioFlow Client Port 8090" /min node "%~dp0scripts\client-gateway.cjs" --http=0.0.0.0:8090 --upstream=http://127.0.0.1:8091 --publicDir="%~dp0pb_public_kiosk"
)

echo Launching PocketBase on 0.0.0.0:8091 ^(staff port^)...

:: Bind to 0.0.0.0 so all physical network adapters accept connections
"%~dp0pocketbase.exe" serve --http="0.0.0.0:8091" --publicDir="%~dp0pb_public"

set "SERVER_RESULT=%ERRORLEVEL%"
:: The staff server stopped: stop the client gateway with it.
taskkill /fi "WINDOWTITLE eq StudioFlow Client Port 8090*" /t /f >nul 2>&1
pause
popd
exit /b %SERVER_RESULT%
