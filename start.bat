@echo off
title My Learning Dashboard
echo Starting servers...
echo   http://localhost:8765  - Dashboard
echo   http://localhost:8766  - Video proxy

:: Start proxy server (port 8766)
start "Proxy Server" /min python proxy.py

:: Wait briefly for proxy to start
timeout /t 2 /nobreak >nul

:: Start file server (port 8765)
start "File Server" /min python -m http.server 8765

:: Wait for server to start then open browser
timeout /t 2 /nobreak >nul
start http://localhost:8765

echo.
echo Servers running. Close this window to stop.
echo (Press Ctrl+C to stop servers)
pause
