# LoL AI Coach — Assistant Tactique League of Legends

Application web full-stack (**React 19 + TypeScript + Tailwind CSS v4 + Express**) connectée aux données officielles **Riot Data Dragon**, aux API **Riot (Account-V1, Summoner-V4, League-V4, Champion-Mastery-V4, Match-V5, Spectator-V5)**, au pont client local **LCU (`lol-coach-bridge`)** et à plusieurs moteurs d'intelligence artificielle configurables.

---

## Fonctionnalités principales

### 1. Tableau de bord & Coaching Proactif Carrière
- **Agrégation multi-parties** : synchronise vos parties classées, normales et ARAM via Riot Match-V5 (ainsi que vos parties locales ou personnalisées via le pont LCU).
- **Top Champions (Recharts)** : graphique combiné interactif comparant le **taux de victoire** et le **KDA** de vos champions les plus joués, avec tri dynamique et accès direct à l'optimiseur.
- **Analyse de synergie Duo** : croise vos champions favoris avec les champions alliés offrant le meilleur win rate en duo et détecte automatiquement vos partenaires récurrents.
- **Recommandations selon votre ADN de gameplay** : identifie des champions complémentaires à votre style de jeu à partir de votre historique réel et génère une synthèse de progression.

### 2. Optimiseur de Build, Runes & Bac à sable Temps Réel
- **Moteur d'équipement contextuel** : adapte les objets, bottes et runes au patch actif Data Dragon et à la composition ennemie (dégâts physiques/magiques, soins, mobilité, contrôles).
- **Bac à sable interactif** : modifiez objets, runes et fragments à la volée avec comparaison chiffrée de vos statistiques du **niveau 1 à 18** face au build Méta.
- **Recherche de builds Web en direct (OP.GG / U.GG + Data Dragon)** : récupère des builds actuels par rôle ou en ARAM avec résolution automatique vers les objets officiels français.
- **Conseiller de Draft & Carnet de Match-ups** : suggestions de contres en phase de sélection et prise de notes personnalisées par match-up.

### 3. Analyse Post-Game & Carte Tactique 2026
- **Panneau de filtres & tri multicritères** : filtrez l'historique archivé par **résultat** (Victoires/Défaites), **rôle** (`TOP`, `JUNGLE`, `MID`, `ADC`, `SUPPORT`), **champion**, ou triez par KDA, CS/min et durée.
- **Carte interactive de la Faille (`map11.png`)** :
  - **34 buissons calibrés** selon la géométrie Saison 2026 de la Faille de l'Invocateur ;
  - **Portraits réels des champions** sur chaque action clé (éliminations, morts, soutiens) ;
  - Affichage des tours, portées, heatmap des combats et diagnostic contextuel de positionnement.
- **Courbes par palier & Recherche par ID** : évolution Or / CS / XP minute par minute et import direct via identifiant de partie Riot.

### 4. Coach Temps Réel, Encyclopédie & Multi-Profils
- **Coach Temps Réel (`127.0.0.1:2999`)** : lecture du flux Live Client Data API pendant la partie, suivi des timers d'objectifs et fenêtres de rappel optimales.
- **Encyclopédie des Champions** : fiches complètes Data Dragon (passifs, sorts, délais de récupération, coûts et ratios).
- **Multi-Profils Famille & Amis** : enregistrez plusieurs comptes Riot dans les paramètres et basculez de l'un à l'autre en un clic.
- **Multi-Fournisseurs IA** : choix libre entre **Google Gemini**, **Anthropic Claude** (API ou Claude Code CLI en local), **OpenAI**, **OpenRouter**, **Mistral**, **Groq**, **DeepSeek**, ou un serveur local compatible OpenAI (**Ollama**, **LM Studio**, **vLLM**).

---

## Installation ultra-simple (Windows & macOS)

1. Installez **[Node.js (version LTS)](https://nodejs.org/)** une seule fois sur l'ordinateur.
2. Téléchargez le dépôt (**Code → Download ZIP** sur GitHub, puis décompressez le dossier).
3. Double-cliquez sur **`lancer-lol-coach.bat`** (Windows) ou **`lancer-lol-coach.command`** (macOS) :
   - Les dépendances s'installent automatiquement au premier lancement ;
   - L'assistant vous aide à configurer votre clé `RIOT_API_KEY` (`RGAPI-...`) dans `.env` ;
   - Le serveur démarre et ouvre directement **`http://localhost:3000`** dans votre navigateur.

---

## Installation manuelle (Développeurs)

### 1. Cloner et installer les dépendances
```bash
git clone <URL_DU_DEPOT_GITHUB>
cd lol-ai-coach
npm install
```

### 2. Configurer les variables d'environnement
```bash
cp .env.example .env
```

Variables principales dans `.env` (voir `.env.example` pour la liste complète) :

| Variable | Rôle | Obligatoire |
| :--- | :--- | :--- |
| `RIOT_API_KEY` | Clé Riot Games (`RGAPI-...`) depuis [developer.riotgames.com](https://developer.riotgames.com/) | Recommandée |
| `GEMINI_API_KEY` | Clé Google Gemini ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)) | Optionnelle |
| `ANTHROPIC_API_KEY` | Clé API Anthropic Claude (`sk-ant-...`) | Optionnelle |
| `OPENAI_API_KEY` | Clé API OpenAI (`sk-...`) | Optionnelle |
| `CUSTOM_AI_BASE_URL` | Endpoint compatible OpenAI local (ex. Ollama `http://127.0.0.1:11434/v1`) | Optionnelle |
| `PORT` | Port du serveur Express (défaut : `3000`) | Optionnelle |

### 3. Scripts disponibles

| Commande | Description |
| :--- | :--- |
| `npm run dev` | Lance le serveur Express + Vite en mode développement sur le port `3000` |
| `npm run build` | Compile le bundle frontend de production dans `dist/` |
| `npm run start` | Démarre l'application en production via `node server.ts` |
| `npm run lint` | Vérifie le typage TypeScript strict (`tsc --noEmit`) |

---

## Architecture du projet

```text
├── server.ts                  # Point d'entrée Express + proxy API Riot / IA + Vite middleware
├── server/
│   ├── aiCoachService.ts      # Génération de plans tactiques, synthèse carrière & recherche web
│   ├── aiProviders.ts         # Routeur multi-fournisseurs IA (Gemini, Claude, OpenAI, Ollama…)
│   ├── opggBuildService.ts    # Extraction temps réel des builds OP.GG + mapping Data Dragon
│   ├── referenceData.ts       # Données tactiques de référence & calibrations carte 2026
│   └── riotService.ts         # Client Riot API (Account, Match, Mastery, Spectator, Data Dragon)
├── src/
│   ├── App.tsx                # Navigation principale, multi-profils, animations & état global
│   ├── components/            # Vues (Dashboard, BuildOptimizer, PostGame, LiveCoach, Guide…)
│   ├── engines/               # Moteur d'optimisation d'objets, runes et calculs par niveau
│   └── utils/                 # Lanceurs, persistance locale et utilitaires typés
├── .env.example               # Modèle de configuration sans secret
├── LICENSE                    # Licence MIT
└── package.json               # Dépendances et scripts npm
```

---

## Sécurité & Confidentialité

- Toutes les clés API (`RIOT_API_KEY`, clés IA) restent strictement **côté serveur** (`server.ts` / `server/*`) et ne sont jamais exposées dans le bundle navigateur.
- Le fichier `.env` est exclu du suivi Git par `.gitignore`. **Ne partagez et ne commitez jamais vos clés API.**

---

## Licence & Mention légale Riot Games

Ce projet est distribué sous licence **[MIT](./LICENSE)**.

> *LoL AI Coach isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.*
