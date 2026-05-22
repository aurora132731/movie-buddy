@echo off
cd /d "%~dp0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4173" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
if not exist api-keys.env (
  echo.
  echo  No api-keys.env found.
  echo  Optional: setup-api-keys.cmd for FREE OMDb extras ^(cast, RT scores^). Decks come from IMDb.
  echo  The app still runs without keys using built-in movie data.
  echo.
  timeout /t 4 >nul
)
echo.
echo  Movie Buddy: http://127.0.0.1:4173/
echo  Opening in your browser in 2 seconds...
echo.
start "" cmd /c "timeout /t 2 >nul && start http://127.0.0.1:4173/"
node movie-matcher-server.js
pause
