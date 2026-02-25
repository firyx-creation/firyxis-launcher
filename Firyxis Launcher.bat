@echo off
title Firyxis Launcher
color 0A
cd /d "%~dp0"

echo.
echo  ===============================================
echo   FIRYXIS LAUNCHER
echo  ===============================================
echo.

:: ── Verification Node.js ─────────────────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js n'est pas installe !
    echo.
    echo  Node.js est necessaire pour lancer Firyxis Launcher.
    echo.
    echo  [O] Installer Node.js automatiquement
    echo  [N] Quitter
    echo.
    set /p CHOICE="  Votre choix (O/N) : "
    if /i "%CHOICE%"=="O" (
        echo.
        echo  [INFO] Installation de Node.js...
        winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
        if %errorlevel% neq 0 (
            echo.
            echo  [ERREUR] Echec de l'installation automatique.
            echo  Telechargez Node.js sur : https://nodejs.org
            pause & exit /b 1
        )
        echo  [OK] Node.js installe ! Redemarrez votre PC puis relancez le launcher.
        pause & exit /b 0
    ) else (
        exit /b 1
    )
)

for /f "tokens=*" %%v in ('node --version') do echo  [OK] Node.js %%v
echo.

:: ── Lancement direct ──────────────────────────────────────────────────────────
echo  [INFO] Lancement...
npm start >nul 2>&1

:: ── Si echec : npm install puis on reessaye ───────────────────────────────────
if %errorlevel% neq 0 (
    echo  [INFO] Dependances manquantes, installation en cours...
    echo.
    npm install
    if %errorlevel% neq 0 (
        echo.
        echo  [ERREUR] Impossible d'installer les dependances.
        echo  Verifiez votre connexion internet et reessayez.
        pause & exit /b 1
    )
    echo.
    echo  [OK] Dependances installees, lancement...
    echo.
    npm start
    if %errorlevel% neq 0 (
        echo.
        echo  [ERREUR] Le launcher n'a pas pu demarrer. Code : %errorlevel%
        pause & exit /b 1
    )
)
