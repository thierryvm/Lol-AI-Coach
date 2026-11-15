#!/bin/bash
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
