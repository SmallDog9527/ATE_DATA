@echo off
setlocal

echo ===================================================
echo   Chip ATE Analysis System - Restart Script
echo ===================================================

:: 0. Stop services first
echo [0/2] Stopping existing services...
call stop_ate.bat
echo.
echo ===================================================
echo   Chip ATE Analysis System - Starting Up...
echo ===================================================

:: 1. Check for Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed or not in PATH.
    echo Please install Docker Desktop to run this system.
    pause
    exit /b 1
)

:: 2. Check if Docker is running
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker Desktop is not running.
    echo Please start Docker Desktop and then run this script again.
    pause
    exit /b 1
)

:: 3. Try to start everything
echo [1/2] Starting all services (DB, Redis, Backend, Frontend)...
echo This may take a moment...
docker-compose up -d
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to start services with Docker Compose. 
    echo Please check if ports 8000 (Backend) or 5174 (Frontend) are used by other apps.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/2] Checking service status:
docker-compose ps

echo.
echo ===================================================
echo   System is up and running!
echo.
echo   Frontend: http://localhost:5174
echo   Backend:  http://localhost:8000
echo.
echo   Default Login: admin / admin123
echo.
echo   [Optional] To enable local email (MailHog):
echo     docker-compose --profile mail up -d
echo     Email UI: http://localhost:8025
echo ===================================================
echo.
echo Keep this window open while using the system.
echo Press any key to STOP the services and exit...
pause

echo Stopping services...
docker-compose stop
echo Done.
pause
