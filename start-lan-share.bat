@echo off
title C-Scan and Pipe Tally Suite - LAN Share
cd /d "%~dp0"
set PORT=4173

echo ============================================
echo  C-Scan ^& Pipe Tally Suite — LAN Share
echo ============================================
echo.

:: Check prerequisites
where npx >nul 2>&1
if errorlevel 1 (
    echo [!] Node.js not found — install from https://nodejs.org
    pause
    exit /b 1
)

:: Install deps if needed
if not exist "node_modules" (
    echo [*] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [!] npm install failed.
        pause
        exit /b 1
    )
)

:: Kill any leftover Vite on port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%"') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Collect and show LAN IPs
echo  Share link ^(same Wi-Fi^):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    for %%b in (%%a) do (
        if not "%%b"=="" echo    http://%%b:%PORT%/
    )
)
echo.
echo  Local: http://127.0.0.1:%PORT%/
echo.
echo ============================================
echo.

:: Open browser
start http://127.0.0.1:%PORT%/

:: Start Vite — wait so window stays open
echo [*] Starting Vite (close this window or press Ctrl+C to stop^)
echo.

npx vite --port %PORT%
echo.
echo [!] Server stopped (exit code = %ERRORLEVEL%^)
pause