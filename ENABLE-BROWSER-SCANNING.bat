@echo off
title QA Copilot - enable full page scanning
cd /d "%~dp0"

echo.
echo   This downloads Chromium (about 130 MB) so QA Copilot can scan
echo   pages that need JavaScript to render, and pages behind a login.
echo.
echo   Without it, scanning still works for normal server-rendered pages.
echo.
pause

call npm install playwright@1.49.1 --no-audit --no-fund
call npx playwright install chromium

echo.
echo   Done. Restart QA Copilot with START.bat
echo   The sidebar should now say "full browser scanner".
echo.
pause
