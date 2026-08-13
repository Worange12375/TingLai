@echo off
chcp 65001 >nul
set "PATH=E:\nodejs;%PATH%"

cd /d "G:\CodeDevel\project\MicroPotent\work_zone\SoundVerse" || (
  echo ERROR: project dir not found!
  pause
  exit /b 1
)

echo Releasing port 5173 ...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r ":5173 " ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)
timeout /t 2 >nul

echo.
echo ============================================================
echo   SoundVerse Dev Server
echo   Open: http://localhost:5173/#/dev
echo   Close this window to stop the server
echo ============================================================
echo.

call npm run dev

echo.
echo [Server stopped] Press any key to exit...
pause >nul
