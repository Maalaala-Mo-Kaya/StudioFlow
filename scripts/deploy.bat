@echo off
set "SRC=%~dp0..\dist"
set "DST=%~dp0..\pb_public"

echo Deploying from %SRC% to %DST%

:: Clear destination
if exist "%DST%" (
    del /s /q /f "%DST%\*"
    for /d %%i in ("%DST%\*") do rd /s /q "%%i"
) else (
    mkdir "%DST%"
)

:: Copy
robocopy "%SRC%" "%DST%" /E /NFL /NDL /NJH /NJS

if %errorlevel% leq 7 (
    echo Deploy complete.
    exit /b 0
) else (
    echo Deploy failed.
    pause
    exit /b 1
)