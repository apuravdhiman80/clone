@echo off
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js is required. Install Node.js 20.19+ or 22.12+ & pause & exit /b 1)
where npm >nul 2>nul || (echo npm was not found. Reinstall Node.js & pause & exit /b 1)

if not exist .env copy .env.example .env >nul
if not exist node_modules (
    call npm install
    if errorlevel 1 pause & exit /b 1
)

call npm run dev
pause