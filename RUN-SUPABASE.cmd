@echo off
title InvoicePilot - Supabase Runner
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing_node
if not exist ".env.local" copy ".env.example" ".env.local" >nul
node --env-file=.env.local scripts/check-env.mjs
if errorlevel 1 goto failed
node scripts/build-vercel.mjs
if errorlevel 1 goto failed
node --env-file=.env.local scripts/dev-vercel.mjs --open
if errorlevel 1 goto failed
goto :eof
:missing_node
echo Install Node.js 24 or later from https://nodejs.org.
:failed
pause
