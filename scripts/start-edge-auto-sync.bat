@echo off
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -File "scripts\auto-sync-edge.ps1"
pause
