@echo off
rem DnD-Tabletop starten (Windows). Doppelklick genuegt.
chcp 65001 >nul
cd /d "%~dp0"

rem Portable Version: Node.js liegt im Ordner runtime\
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" server\index.js
  pause
  exit /b
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js fehlt. Entweder die portable Version (DnD-Tabletop-...-windows-x64.zip)
  echo aus den GitHub-Releases nehmen oder Node.js LTS von https://nodejs.org installieren.
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
