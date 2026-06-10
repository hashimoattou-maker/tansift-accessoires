@echo off
title Accessoires Tansift
cd /d "%~dp0"
echo ========================================
echo    Accessoires Tansift - ERP Automotive
echo ========================================
echo.

:check_node
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe ou introuvable.
    echo.
    echo Telechargez-le depuis : https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js trouve

:install_deps
if not exist "node_modules" (
    echo [INFO] Installation des dependances...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERREUR] Echec de l'installation.
        pause
        exit /b 1
    )
    echo [OK] Dependances installees
)

:start_app
echo.
echo [INFO] Demarrage du serveur...
echo [INFO] Acces : http://localhost:3000
echo [INFO] Login : admin@tansift.ma / admin123
echo [INFO] Fermez cette fenetre pour arreter
echo.
start http://localhost:3000
node backend\server.js

pause
