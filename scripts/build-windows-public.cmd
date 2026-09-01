@echo off
setlocal

call npm ci
if errorlevel 1 exit /b %errorlevel%

call npm run build
if errorlevel 1 exit /b %errorlevel%

call npm run tauri:build
exit /b %errorlevel%
