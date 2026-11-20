@echo off
setlocal
title StudioFlow - Restore Database

echo ========================================================
echo   StudioFlow - Restore Database
echo ========================================================
echo.
echo This will replace the current pb_data database with a backup.
echo PocketBase must be stopped before continuing.
echo The existing database will be archived before restoration.
echo.

call "%~dp0restore.bat"
set "RESULT=%ERRORLEVEL%"

if not "%RESULT%"=="0" (
    echo.
    echo Restore did not complete. Review the message above.
)

exit /b %RESULT%
