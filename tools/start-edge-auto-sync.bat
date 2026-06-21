@echo off
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -File "tools\auto-sync-edge.ps1"
pause
