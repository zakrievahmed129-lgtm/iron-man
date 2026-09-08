@echo off
title 🛡️ A.E.G.I.S — SPATIAL HAND & MOUSE CONTROLLER
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================================
echo   LANCEMENT DU SYSTEME A.E.G.I.S (IRON MAN CONTROLLER)
echo ========================================================
echo.

if exist "Aegis.exe" (
    start "" "Aegis.exe"
    exit /b
)

:: Recompilation automatique si Aegis.exe manquant
if exist "src\AegisLauncher.cs" (
    echo [*] Compilation de l'executable Aegis.exe...
    "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /optimize+ /target:exe /out:"Aegis.exe" "src\AegisLauncher.cs"
    if exist "Aegis.exe" (
        start "" "Aegis.exe"
        exit /b
    )
)

:: Fallback direct avec Node
echo [*] Demarrage direct via Node.js...
start "" cmd /c "timeout /t 2 >nul & start https://localhost:8443/pc.html"
node server.js
pause
