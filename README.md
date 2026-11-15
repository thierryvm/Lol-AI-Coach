# LoL AI Coach — Assistant Tactique League of Legends

Application web complète (React + TypeScript + Tailwind CSS + Express) connectée aux données officielles **Riot Data Dragon**, **Riot API Match-V5 / Spectator-V5**, au pont client local **LCU (`lol-coach-bridge.bat`)** et à **Gemini AI**.

## Fonctionnalités principales

- **Tableau de bord & Coaching Proactif Carrière** : agrège l'ensemble de vos parties synchronisées (et vos parties locales/personnalisées via le pont client) pour suivre votre progression, votre maîtrise par champion et adapter automatiquement vos futurs builds.
- **Optimiseur de Build & Runes + Bac à sable temps réel** : calcule les objets adaptés au patch actif (S16), permet de modifier runes et fragments à la volée, affiche l'impact chiffré sur vos stats (Niv. 1 à 18) et donne un verdict comparatif face à la page Méta.
- **Analyse Post-Game** : carte interactive des morts sur la Faille (`map11.png`), courbes or/CS par palier, audit d'équipement et recherche directe par ID de partie Riot.
- **Coach Temps Réel** : lecture directe du flux `127.0.0.1:2999`, timers objectifs, appels de rappel et grille de runes officielle.
- **Multi-Profils Famille & Amis** : enregistrez plusieurs comptes Riot (parents, enfants, amis) dans les paramètres et passez de l'un à l'autre en 1 clic.

## Installation ultra-simple (Zéro technique — Famille & Amis)

1. Installez [Node.js (version LTS)](https://nodejs.org/) une seule fois sur l’ordinateur.
2. Téléchargez le projet (bouton vert **Code → Download ZIP** sur GitHub, puis décompressez le dossier).
3. Double-cliquez sur **`lancer-lol-coach.bat`** (Windows) ou **`lancer-lol-coach.command`** (Mac) :
   - L’assistant installe tout automatiquement au premier lancement ;
   - Il ouvre la page Riot pour copier votre clé `RGAPI-...` et crée le fichier `.env` tout seul (aucun fichier texte à modifier à la main !) ;
   - Il ouvre directement **http://localhost:3000** dans votre navigateur !
   - Les fois suivantes, un simple double-clic relance l’application (et vous propose de renouveler la clé en 10 secondes si votre clé 24h a expiré).

---

## Installation manuelle (pour développeurs)

1. **Cloner et installer** :
   ```bash
   git clone <URL_DU_DEPOT_GITHUB>
   cd <NOM_DU_DOSSIER>
   npm install
   ```
2. **Configurer vos clés API dans `.env`** :
   ```bash
   cp .env.example .env
   ```
   Renseignez :
   - `RIOT_API_KEY` : récupérée en 1 clic sur [developer.riotgames.com](https://developer.riotgames.com/) (commence par `RGAPI-`). *Note : une clé "Development" expire toutes les 24h ; demandez une "Personal API Key" gratuite sur le portail Riot pour un usage familial permanent.*
   - `GEMINI_API_KEY` *(optionnel, pour les plans tactiques IA)* : créée gratuitement sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
3. **Lancer l'application** :
   ```bash
   npm run dev
   ```
   Ouvrez ensuite **http://localhost:3000** dans votre navigateur.

> **Sécurité** : ne commitez jamais votre fichier `.env` sur GitHub (il est ignoré par `.gitignore`). Les clés restent uniquement sur votre serveur local.
