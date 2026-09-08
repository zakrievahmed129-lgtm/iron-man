@echo off
title 🛡️ A.E.G.I.S — SPATIAL HUD SERVER
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================================
echo   DEMARRAGE DU SERVEUR A.E.G.I.S SPATIAL HUD...
echo ========================================================
echo.

:: Lancement automatique du navigateur PC après 2 secondes
start "" cmd /c "timeout /t 2 >nul & start https://localhost:8443/pc.html"

:: Lancement du serveur Node.js (qui affichera le QR code pour le Redmi A3)
node server.js

pause
