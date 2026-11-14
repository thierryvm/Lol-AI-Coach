# LoL AI Coach — Cahier des charges fonctionnel et technique

**Version :** 1.0 — 12 novembre 2026  
**Statut :** cadrage initial — à valider après l'étude Codex  
**Périmètre de cette étape :** conception et faisabilité uniquement, pas de développement.

## 1. Vision

Créer une application desktop multiplateforme qui aide les joueurs de League of Legends à comprendre le jeu, préparer leurs parties, analyser leurs performances et progresser.

L'application ne doit pas être un simple chatbot. Elle doit combiner :
- un moteur métier déterministe et explicable ;
- des données de jeu versionnées et sourcées ;
- des analyses statistiques ;
- des simulations clairement identifiées comme théoriques ;
- des fonctions d'IA facultatives pour l'interprétation, l'explication et l'assistance.

Elle doit être conçue pour couvrir tous les champions, rôles, lanes, match-ups et patches, et non être limitée aux champions joués actuellement par le premier utilisateur.

## 2. Objectifs fonctionnels

### 2.1 Connaissances et préparation
- Fiches de champions, compétences, statistiques et mécaniques.
- Analyse de match-ups et des conditions de victoire.
- Suggestions de runes et d'objets selon le match-up, la composition et le patch.
- Analyse de compositions alliées et adverses.
- Conseils de compétences, de plans de lane et de stratégies de partie.
- Explication des recommandations, avec sources, hypothèses et niveau de confiance.

### 2.2 Aide pendant la partie
Étudier ce qui est techniquement possible et autorisé pour :
- lire les seules données accessibles par les interfaces autorisées ;
- contextualiser les événements et l'état de partie ;
- proposer des conseils non intrusifs ;
- afficher les limites de visibilité et les informations inconnues.

Aucune commande de jeu, automatisation du joueur, bot, scripting de combat, lecture mémoire non autorisée ou manipulation du client ne doit être développée. La conformité Riot doit primer sur les fonctionnalités envisagées.

### 2.3 Analyse après partie
- Historique et récupération des parties via les moyens autorisés.
- Analyse des performances individuelles et collectives.
- Identification de tendances et d'erreurs récurrentes.
- Comparaison entre parties, champions, rôles et match-ups.
- Analyse de replays uniquement si le format, les outils et les conditions d'utilisation le permettent.
- Suivi de progression et objectifs d'entraînement.

### 2.4 Comparaison et simulation
Étudier les moyens de comparer :
- builds et ordres d'achat ;
- runes ;
- compétences et niveaux ;
- dégâts, résistances et statistiques ;
- match-ups et compositions ;
- scénarios théoriques de combat.

Chaque résultat doit être qualifié : calcul exact selon un modèle documenté, simulation, statistique empirique ou hypothèse générée par IA. Ne jamais présenter une simulation comme un résultat de partie réelle.

## 3. Périmètre universel et données évolutives

Le système doit prendre en charge l'ensemble du jeu et suivre les changements de patch. Les données doivent être :
- versionnées par patch et région lorsque pertinent ;
- synchronisées sans écraser l'historique ;
- mises en cache localement ;
- accompagnées de leur provenance et date de récupération ;
- validées avant utilisation ;
- extensibles sans refonte du moteur.

Les recommandations doivent tenir compte du patch et signaler lorsque les données sont anciennes ou incomplètes.

## 4. Architecture et technologies candidates

Orientations initiales, non imposées :
- Rust pour le cœur métier et les calculs ;
- Tauri 2 pour le desktop ;
- Svelte + TypeScript pour l'interface ;
- Tokio pour l'asynchronisme ;
- Serde pour la sérialisation ;
- SQLite pour les données locales ;
- SQLx pour l'accès aux données ;
- Axum uniquement si un service réseau s'avère utile ;
- GitHub Actions pour les builds et tests.

Codex doit comparer ces choix à des alternatives et recommander une architecture réellement adaptée. Le cœur métier doit rester indépendant de Tauri et de l'interface, testable et réutilisable dans un autre produit.

Cibles : Windows, macOS et Linux. Les différences de packaging, signature, notarisation, dépendances système et mises à jour doivent être traitées explicitement.

## 5. Modules métier envisagés

1. Champion Knowledge Engine.
2. Match-up Analysis Engine.
3. Rune Recommendation Engine.
4. Build Optimization Engine.
5. Team Composition Engine.
6. Game State / Game Analysis Engine.
7. Replay Analysis Engine.
8. Strategy Engine.
9. Statistical Analysis Engine.
10. Simulation Engine.
11. Data Synchronization Engine.
12. AI Provider Manager.

Codex doit proposer des frontières de modules, contrats, flux et dépendances. Il peut fusionner, scinder ou renommer ces modules si cela améliore l'architecture.

## 6. AI Provider Manager

Le système IA doit être facultatif, modulaire et indépendant du moteur LoL.

Solutions à étudier :
- OpenRouter comme passerelle multi-modèles ;
- API directes OpenAI, Anthropic, Google et autres ;
- BYOK (clés API propres à l'utilisateur) ;
- modèles locaux via Ollama, llama.cpp ou alternatives ;
- intégrations par abonnement uniquement lorsqu'un fournisseur les autorise explicitement pour un logiciel tiers et, le cas échéant, pour un produit commercial.

**Règle essentielle :** un abonnement ChatGPT, Claude ou autre service grand public ne donne pas automatiquement le droit d'utiliser son quota depuis une application tierce. Ne pas supposer qu'un OAuth, SDK, CLI ou agent local est réutilisable commercialement. Vérifier les conditions contractuelles et techniques officielles.

Interdictions :
- extraction de cookies ou tokens de session ;
- collecte de mots de passe ;
- réutilisation non autorisée de sessions ;
- contournement des limites ou conditions de service ;
- présentation d'un abonnement grand public comme un accès API.

OpenRouter ne doit pas être une dépendance obligatoire. BYOK signifie l'utilisation de clés API autorisées et ne transforme pas un abonnement grand public en quota API.

L'application doit conserver ses fonctions essentielles même sans IA connectée. Les coûts et limites de chaque fournisseur doivent être visibles et contrôlables.

## 7. Gratuité et modèle économique

Objectif : pas d'abonnement IA ou de service cloud obligatoire pour les fonctions fondamentales.

Privilégier :
- composants open source ;
- stockage et calculs locaux ;
- données accessibles légalement ;
- IA locale facultative ;
- services externes facultatifs et clairement tarifés.

Étudier les coûts réels : développement, distribution, signature, notarisation, hébergement, API, modèles, support, mises à jour et conformité. Ne pas promettre une gratuité illimitée si des limites ou coûts existent.

Prévoir une éventuelle commercialisation sans l'implémenter à ce stade.

## 8. Interface envisagée

Écrans possibles :
- tableau de bord ;
- profil et progression ;
- sélection champion / rôle ;
- analyse de match-up ;
- runes et builds ;
- compositions ;
- partie en cours (si autorisé) ;
- historique et analyse post-game ;
- replays (si autorisé) ;
- gestion des fournisseurs IA et des coûts ;
- paramètres, données et mises à jour.

L'ergonomie doit rester claire, accessible et adaptée aux trois systèmes.

## 9. Sécurité, confidentialité et conformité

- Respect des politiques Riot et des conditions des sources tierces.
- Vérification des licences de chaque dépendance.
- Stockage sécurisé des clés API.
- Protection des données de compte et historiques.
- Validation des données externes.
- Protection contre les prompt injections et contenus non fiables.
- Mises à jour signées et vérifiées.
- Pas de télémétrie intrusive par défaut.
- Minimisation et contrôle des données envoyées à un fournisseur IA.

## 10. Distribution et maintenance

Étudier les installeurs, mises à jour, signatures, notarisation macOS, packaging Linux, CI/CD, tests sur systèmes réels, stratégie de versionnement et procédure de récupération en cas d'échec de mise à jour.

## 11. Critères de réussite

L'architecture proposée doit permettre :
- couverture générique de tous les champions et rôles ;
- fonctionnement essentiel sans IA externe ;
- données et recommandations sensibles au patch ;
- séparation claire entre faits, statistiques, simulations et hypothèses ;
- analyse post-game et replay dans les limites autorisées ;
- extension de nouveaux fournisseurs IA sans modifier le moteur ;
- compilation et distribution sur Windows, macOS et Linux ;
- évolution vers une distribution publique et éventuellement commerciale ;
- conformité documentée aux règles applicables.

## 12. Processus

La présente phase est une étude. Aucun code applicatif ne doit être écrit avant examen et validation des livrables de faisabilité et d'architecture.
