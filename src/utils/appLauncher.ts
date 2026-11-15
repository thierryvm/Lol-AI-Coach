const WINDOWS_LAUNCHER_BAT = `@echo off
cd /d "%~dp0"
title LoL AI Coach - Assistant d'installation et lancement

echo ============================================================
echo   LoL AI Coach - Assistant automatique Famille et Amis
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 goto NO_NODE

if exist "node_modules" goto CHECK_ENV
echo [1/3] Installation des composants necessaires en cours...
call npm install
if errorlevel 1 goto INSTALL_ERR
echo.

:CHECK_ENV
if not exist ".env" goto CREATE_ENV

echo Un fichier .env existe deja sur cet ordinateur.
set "UPDATE_KEY="
set /p UPDATE_KEY=Voulez-vous mettre a jour votre cle Riot API maintenant [O/N] ? 
if /I "%UPDATE_KEY%"=="O" goto CREATE_ENV
if /I "%UPDATE_KEY%"=="Y" goto CREATE_ENV
goto START_APP

:CREATE_ENV
echo.
echo [2/3] Configuration automatique de vos cles API...
echo Ouverture de Riot Developer Portal dans votre navigateur.
echo Connectez-vous avec votre compte Riot et cliquez sur Copy.
start "" "https://developer.riotgames.com/"
echo.

set "RIOT_KEY="
set /p RIOT_KEY=Collez votre cle Riot RGAPI-... ici puis appuyez sur Entree : 

if "%RIOT_KEY%"=="" goto SKIP_EMPTY_KEY

set "GEMINI_KEY="
echo.
echo Optionnel : cle Gemini AI Studio pour les analyses IA
echo Laissez vide et appuyez sur Entree si vous n'en avez pas.
set /p GEMINI_KEY=Collez votre cle Gemini ou appuyez sur Entree : 

(
  echo RIOT_API_KEY="%RIOT_KEY%"
  echo GEMINI_API_KEY="%GEMINI_KEY%"
  echo PORT=3000
) > .env
echo Fichier .env enregistre automatiquement avec succes !
echo.
goto START_APP

:SKIP_EMPTY_KEY
if exist ".env" (
  echo Aucune nouvelle cle saisie : conservation du fichier .env actuel.
  echo.
  goto START_APP
)
copy /Y ".env.example" ".env" >nul 2>&1
echo Aucune cle saisie : mode apercu active avec .env par defaut.
echo.

:START_APP
echo [3/3] Demarrage de LoL AI Coach sur http://localhost:3000 ...
echo Laissez cette fenetre ouverte pendant votre session de jeu.
echo.
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"
call npm run dev
echo.
echo Le serveur s'est arrete.
pause
exit /b 0

:NO_NODE
echo [ERREUR] Node.js n'est pas encore installe sur cet ordinateur.
echo Ouverture de la page de telechargement Node.js LTS...
start "" "https://nodejs.org/"
echo Installez Node.js puis relancez ce fichier en double-cliquant dessus.
pause
exit /b 1

:INSTALL_ERR
echo.
echo [ERREUR] L'installation npm install a rencontre un probleme.
echo Verifiez votre connexion Internet puis reessayez.
pause
exit /b 1
`;

const MAC_LAUNCHER_COMMAND = `#!/bin/bash
cd "$(dirname "$0")" || exit 1

echo "============================================================"
echo "  LoL AI Coach - Assistant automatique Famille & Amis"
echo "============================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[ERREUR] Node.js n'est pas encore installé sur ce Mac/PC."
  echo "Téléchargez-le sur https://nodejs.org/ puis relancez ce script."
  if command -v open >/dev/null 2>&1; then open "https://nodejs.org/"; fi
  read -r -p "Appuyez sur Entrée pour fermer..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[1/3] Installation des composants nécessaires..."
  npm install || {
    echo "[ERREUR] npm install a échoué."
    read -r -p "Appuyez sur Entrée pour fermer..."
    exit 1
  }
fi

UPDATE_ENV="N"
if [ ! -f ".env" ]; then
  UPDATE_ENV="O"
else
  read -r -p "Un fichier .env existe déjà. Mettre à jour votre clé Riot API ? [o/N] : " UPDATE_ENV
fi

if [ "$UPDATE_ENV" = "O" ] || [ "$UPDATE_ENV" = "o" ] || [ "$UPDATE_ENV" = "Y" ] || [ "$UPDATE_ENV" = "y" ]; then
  echo ""
  echo "[2/3] Ouverture de Riot Developer Portal..."
  echo "Connectez-vous puis cliquez sur Copy pour copier votre clé RGAPI-..."
  if command -v open >/dev/null 2>&1; then
    open "https://developer.riotgames.com/"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "https://developer.riotgames.com/"
  fi
  echo ""
  read -r -p "Collez votre clé Riot (RGAPI-...) puis Entrée : " RIOT_KEY
  if [ -n "$RIOT_KEY" ]; then
    read -r -p "Optionnel - Clé Gemini AI Studio (ou Entrée pour passer) : " GEMINI_KEY
    cat > .env <<EOF
RIOT_API_KEY="$RIOT_KEY"
GEMINI_API_KEY="$GEMINI_KEY"
PORT=3000
EOF
    echo "Fichier .env créé et enregistré avec succès !"
  elif [ ! -f ".env" ] && [ -f ".env.example" ]; then
    cp .env.example .env
  fi
fi

echo ""
echo "[3/3] Démarrage de LoL AI Coach sur http://localhost:3000 ..."
(
  sleep 3
  if command -v open >/dev/null 2>&1; then
    open "http://localhost:3000"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:3000"
  fi
) &

npm run dev
read -r -p "Serveur arrêté. Appuyez sur Entrée pour fermer..."
`;

function triggerTextDownload(filename: string, content: string, lineEnding: 'crlf' | 'lf') {
  const normalized =
    lineEnding === 'crlf' ? content.replace(/\r?\n/g, '\r\n') : content.replace(/\r\n/g, '\n');
  const blob = new Blob([normalized], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadWindowsAppLauncher() {
  triggerTextDownload('lancer-lol-coach.bat', WINDOWS_LAUNCHER_BAT, 'crlf');
}

export function downloadMacAppLauncher() {
  triggerTextDownload('lancer-lol-coach.command', MAC_LAUNCHER_COMMAND, 'lf');
}
