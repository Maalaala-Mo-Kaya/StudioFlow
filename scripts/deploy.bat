@echo off
setlocal
node "%~dp0publish-build.cjs"
exit /b %ERRORLEVEL%
