@echo off
chcp 65001 >nul
cd /d "%~dp0"

where pwsh.exe >nul 2>&1
if not errorlevel 1 (
    pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\blog-manager-windows.ps1"
) else (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\blog-manager-windows.ps1"
)

if errorlevel 1 (
    echo.
    echo Blog manager exited with an error.
    pause
)
