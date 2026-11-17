@echo off
title InvoicePilot Runner
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing_node
node scripts/run.mjs --open
if errorlevel 1 pause
goto :eof
:missing_node
echo InvoicePilot needs Node.js 24 or later.
echo Install Node.js from https://nodejs.org, then double-click RUN.cmd again.
pause
