@echo off
rem Double-click to stop and remove the StudioFlow Photo Sender.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-photo-sender.ps1"
pause
