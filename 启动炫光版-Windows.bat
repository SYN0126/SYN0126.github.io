@echo off
chcp 65001 >nul
cd /d "%~dp0"
set ASTRO_TELEMETRY_DISABLED=1

if not exist node_modules (
  echo 首次启动，正在安装依赖……
  call npm install
  if errorlevel 1 pause & exit /b 1
)

echo 炫光版将在 http://localhost:4321 打开。
call npm run dev -- --host 127.0.0.1
pause
