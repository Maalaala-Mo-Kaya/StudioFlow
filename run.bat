@echo off
title Highlight Server

if "%~1"=="--dev" goto :dev
if "%~1"=="--build" goto :build
goto :server

:dev
call "%~dp0scripts\dev.bat"
goto :server

:build
call "%~dp0scripts\build.bat"
if %errorlevel% neq 0 (
    echo aborting...
    pause
    exit /b 1
)

call "%~dp0scripts\deploy.bat"
if %errorlevel% neq 0 (
    echo aborting...
    pause
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
echo  On this server PC:
echo    - App:             http://localhost:8090
echo    - Admin Dashboard: http://localhost:8090/_/
echo.
echo  On client devices (iPads, Phones, Cashier PC):
echo    - App:             http://%IP%:8090
echo    - Admin Dashboard: http://%IP%:8090/_/
echo.
echo ========================================================
echo.
echo Launching PocketBase (Listening on 0.0.0.0:8090)...

:: Bind to 0.0.0.0 so all physical network adapters accept connections
pocketbase.exe serve --http="0.0.0.0:8090"

pause
