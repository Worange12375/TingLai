@echo off
chcp 65001 >nul

REM 确保 node/npm 可用：双击启动时系统 PATH 可能不含 node，这里显式补上
set "PATH=E:\nodejs;%PATH%"

cd /d "G:\CodeDevel\project\MicroPotent\work_zone\SoundVerse" || (
  echo 项目目录不存在或无法访问！
  pause
  exit /b 1
)

echo 正在释放 5173 端口（如有旧实例）...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r ":5173 " ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)
timeout /t 2 >nul

echo.
echo ============================================================
echo   听籁 SoundVerse - AdminTool 开发服务器
echo   浏览器打开: http://localhost:5173/#/dev
echo   关闭此窗口即停止服务器
echo ============================================================
echo.

call npm run dev

echo.
echo [服务器已停止] 按任意键关闭窗口...
pause >nul
