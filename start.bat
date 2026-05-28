@echo off
setlocal
cd /d "%~dp0"

if not exist frontend\dist\index.html (
  echo.
  echo The app has not been built yet. Run setup.bat first.
  echo.
  pause
  exit /b 1
)

echo Starting ShotHub on http://localhost:4000   (close this window to stop)
call npm start
pause
