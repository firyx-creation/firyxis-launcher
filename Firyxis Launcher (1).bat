@echo off
title Firyxis Launcher
cd /d "%~dp0"

:: ── Vérification de Node.js ──────────────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  +======================================================+
    echo  ^|           FIRYXIS LAUNCHER - ATTENTION              ^|
    echo  +======================================================+
    echo  ^|                                                      ^|
    echo  ^|  Node.js n'est pas installe sur ce PC.              ^|
    echo  ^|  Il est necessaire pour faire fonctionner           ^|
    echo  ^|  le launcher.                                        ^|
    echo  ^|                                                      ^|
    echo  +======================================================+
    echo.
    echo  Que voulez-vous faire ?
    echo.
    echo  [1] Installer Node.js automatiquement  (recommande)
    echo  [2] Ouvrir nodejs.org pour telecharger manuellement
    echo  [3] Quitter
    echo.
    set /p choix=" Votre choix (1/2/3) : "

    if "%choix%"=="1" (
        echo.
        echo  Installation en cours via winget, veuillez patienter...
        echo.
        winget install OpenJS.NodeJS.LTS --silent
        if %errorlevel% neq 0 (
            echo.
            echo  Echec de l'installation automatique.
            echo  Allez sur https://nodejs.org et installez manuellement.
            echo.
            pause
            exit /b 1
        )
        echo.
        echo  +======================================================+
        echo  ^|  Node.js installe avec succes !                      ^|
        echo  ^|                                                      ^|
        echo  ^|  IMPORTANT : Redemarrez votre PC puis               ^|
        echo  ^|  relancez Firyxis Launcher.bat                      ^|
        echo  +======================================================+
        echo.
        pause
        exit /b 0
    )

    if "%choix%"=="2" (
        start https://nodejs.org/en/download
        echo.
        echo  Le site s'est ouvert dans votre navigateur.
        echo  Apres installation, redemarrez votre PC
        echo  puis relancez Firyxis Launcher.bat
        echo.
        pause
        exit /b 0
    )

    exit /b 0
)

:: ── Vérification npm ─────────────────────────────────────────────────────────
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  npm n'est pas reconnu. Redemarrez votre PC et relancez.
    echo.
    pause
    exit /b 1
)

:: ── Installation des dépendances au premier lancement ────────────────────────
if not exist "%~dp0node_modules" (
    echo.
    echo  Premier lancement detecte !
    echo  Installation des dependances en cours...
    echo  (cela peut prendre 1 a 2 minutes)
    echo.
    npm install
    if %errorlevel% neq 0 (
        echo.
        echo  Erreur lors de l'installation des dependances.
        echo  Essayez de relancer ce fichier en tant qu'administrateur.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo  Dependances installees ! Lancement...
    echo.
)

:: ── Lancement ─────────────────────────────────────────────────────────────────
npm start
