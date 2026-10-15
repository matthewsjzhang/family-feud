@echo off
rem Starts the Family Feud game and opens the host console in your browser.
rem Close this window to stop the game.

title Family Feud
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First run: installing the game's files. This takes a minute...
  call npm install
  if errorlevel 1 (
    echo Install failed. See the messages above.
    pause
    exit /b 1
  )
)

echo.
echo Starting Family Feud...
echo  - The host console opens in your browser.
echo  - Click "Open game board" there and drag that window to the TV.
echo  - On the board, click "Click to enable sound".
echo  - Close this window to stop the game.
echo.

call npx vite --open
pause
