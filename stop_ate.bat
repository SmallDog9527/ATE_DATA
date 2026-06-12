@echo off
echo ===================================================
echo   Stopping Chip ATE Analysis System...
echo ===================================================

:: 1. Stop all Docker containers
echo [1/2] Stopping Docker containers...
docker-compose stop
if %errorlevel% neq 0 (
    echo [WARNING] Could not stop containers via docker-compose.
)

:: 2. Kill local processes if any exist (legacy)
echo [2/2] Cleaning up any local processes...
taskkill /F /FI "WINDOWTITLE eq ATE-Backend*" /T 2>nul
taskkill /F /FI "WINDOWTITLE eq ATE-Frontend*" /T 2>nul

echo.
echo System stopped successfully.

