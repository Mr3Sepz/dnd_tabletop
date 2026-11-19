@echo off
rem DnD-Tabletop starten (Windows). Doppelklick genuegt.
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js fehlt. Bitte die LTS-Version von https://nodejs.org installieren
  echo und danach diese Datei erneut starten.
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Erster Start: installiere Abhaengigkeiten ...
  call npm install --omit=dev
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node server\index.js
pause
