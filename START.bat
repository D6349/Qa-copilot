@echo off
title QA Copilot
cd /d "%~dp0"

echo.
echo   ================================
echo     QA Copilot
echo   ================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   Node.js is not installed.
  echo.
  echo   Download the LTS version from https://nodejs.org
  echo   Install it, then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo   Dependencies are missing - installing them now...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

if not exist "data\projects.json" (
  echo   First run - creating the demo project...
  call node seed.js
)

echo   Starting. Your browser will open in a moment.
echo   Leave this window open while you use QA Copilot.
echo   Close it, or press Ctrl+C, to stop.
echo.

start "" http://localhost:4100
node server.js

echo.
echo   QA Copilot has stopped.
pause
