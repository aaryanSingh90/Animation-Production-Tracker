@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   ShotHub v3 - Local Setup (Windows)
echo ============================================

if not exist backend\.env (
  echo.
  echo ERROR: backend\.env not found.
  echo Copy backend\.env.example to backend\.env and fill in
  echo DATABASE_URL and JWT_SECRET, then run this again.
  echo.
  pause
  exit /b 1
)

echo.
echo [1/2] Removing old/partial dependency folders for a clean install...
if exist backend\node_modules  rmdir /s /q backend\node_modules
if exist frontend\node_modules rmdir /s /q frontend\node_modules

echo.
echo [2/2] Installing, migrating, seeding and building (this can take a few minutes)...
call npm run setup
if errorlevel 1 (
  echo.
  echo Setup FAILED - read the messages above.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Setup complete.
echo   Now double-click start.bat, then open
echo   http://localhost:4000
echo ============================================
pause
