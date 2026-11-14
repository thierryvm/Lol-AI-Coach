# MISSION CODEX — ÉTUDE DE FAISABILITÉ ET ARCHITECTURE DE LOL AI COACH

## Rôle

Agis comme architecte logiciel senior, ingénieur Rust, spécialiste des applications desktop multiplateformes, des systèmes de données de jeux vidéo et des intégrations IA.

Ta mission est de produire une étude indépendante, documentée et critique du projet décrit dans `docs/01_CAHIER_DES_CHARGES.md`.

**Tu ne dois PAS commencer à coder.** Tu ne dois pas créer de prototype, installer de dépendances, modifier un autre projet ni générer du code applicatif. Tu peux créer uniquement les documents de l'étude demandés ci-dessous dans un dossier `study/` à la racine de ce dossier, si ton environnement de travail le permet.

Tu dois remettre en question nos hypothèses. Ne cherche pas à confirmer les choix initiaux par complaisance. Si une technologie, une fonctionnalité ou un modèle économique est irréaliste, explique pourquoi et propose une alternative.

## 1. Méthode et qualité des preuves

1. Commence par lire intégralement le cahier des charges et les sources indiquées dans `docs/03_SOURCES_OFFICIELLES.md`.
2. Recherche la documentation officielle la plus récente à la date de l'étude.
3. Pour chaque point important, indique : conclusion, preuve, URL, date de consultation et niveau de confiance.
4. Distingue clairement :
   - fait vérifié dans une source officielle ;
   - interprétation ;
   - hypothèse ;
   - information non vérifiée ;
   - décision nécessitant une confirmation de Riot ou d'un fournisseur.
5. Les snippets de moteurs de recherche, blogs et forums ne suffisent pas à établir une autorisation contractuelle. Privilégie les contrats, politiques, documentations et pages officielles.
6. Ne fabrique jamais de citations, d'API, de capacités, de tarifs ou d'autorisations.
7. Si tu n'as pas accès au Web, signale cette limite et produis une liste précise des vérifications manquantes plutôt que de prétendre les avoir effectuées.

## 2. Faisabilité Riot Games — priorité critique

Étudie les sources officielles Riot et réponds précisément aux questions suivantes :

- Quelles API officielles sont accessibles pour League of Legends ?
- Quelles données Data Dragon fournit-il et avec quelles limites ?
- Quelles possibilités réelles offre Match-V5 ?
- Quelles données peut-on lire avec Live Client Data API ?
- Quel est le statut de League Client API et des interfaces non officiellement supportées ?
- Quelles possibilités de replay existent, quels formats et outils sont exploitables, et quelles limites s'appliquent ?
- Peut-on analyser un replay après la partie sans automatiser le jeu ?
- Quelles données sont disponibles pendant la partie, à quel rythme et avec quelles restrictions ?
- Quelles fonctionnalités nécessitent une validation ou un enregistrement de produit ?
- Quelles règles s'appliquent à la monétisation, aux publicités, aux fonctionnalités premium et à un éventuel niveau gratuit ?
- Quelles restrictions concernent l'affichage en jeu, les recommandations, l'avantage compétitif, les données privées ou les actions automatisées ?
- Quelles limites de requêtes et conditions d'accès s'appliquent selon le type de clé ou d'approbation ?

Fais une matrice par fonctionnalité : faisable / faisable sous conditions / non supporté / interdit ou trop risqué / à confirmer. Cite les preuves.

Ne propose aucune lecture mémoire, injection, bot, scripting de gameplay, automatisation de combat, contrôle du personnage ou contournement du client Riot.

## 3. Faisabilité des analyses LoL

Pour chaque moteur envisagé, décris :
- données d'entrée disponibles ;
- algorithmes possibles ;
- résultats attendus ;
- niveau de précision réaliste ;
- dépendances ;
- limites ;
- tests nécessaires.

Étudie les moteurs de champions, match-ups, runes, builds, compositions, stratégies, statistiques, analyse de partie et replay.

Détermine quelles fonctionnalités reposent sur des règles et calculs déterministes, lesquelles nécessitent des statistiques empiriques, et lesquelles bénéficient réellement d'un LLM.

Ne laisse pas un LLM inventer des statistiques ou calculer des résultats numériques qui devraient être calculés par le moteur métier. Les réponses IA doivent être ancrées dans des données récupérées et identifiables.

## 4. Simulations et expérimentation

Évalue la faisabilité de calculs de dégâts, résistances, objets, runes et scénarios de combat.

Précise :
- mécaniques modélisables exactement ;
- mécaniques dépendantes de données incomplètes ou de conditions ;
- effets aléatoires et incertitude ;
- différence entre modèle théorique, simulation et résultats observés ;
- méthode de validation contre les données du jeu et les patchs.

Propose une stratégie de tests de non-régression à chaque patch. Ne prétends pas simuler fidèlement le jeu entier si les données ou mécaniques nécessaires ne sont pas disponibles.

## 5. Architecture Rust

Évalue Rust comme langage principal et propose une architecture de workspace Cargo.

Étudie les bibliothèques pertinentes pour :
- asynchronisme ;
- HTTP ;
- parsing et validation ;
- sérialisation ;
- stockage ;
- calculs ;
- statistiques ;
- simulation ;
- observabilité ;
- tests ;
- sécurité ;
- packaging multiplateforme.

Compare les options SQLite, SQLx et autres si pertinent. Justifie chaque dépendance importante, sa maturité, sa licence, son coût de maintenance et les contraintes de compilation.

Le domaine métier doit rester indépendant de Tauri, de l'interface, du stockage concret et des fournisseurs IA autant que raisonnablement possible.

## 6. Desktop et interface

Compare Tauri 2 avec Electron, les solutions natives Rust et toute alternative pertinente.

Compare Svelte, React et les alternatives justifiées.

Évalue :
- Windows, macOS, Linux ;
- consommation mémoire et performances ;
- expérience développeur ;
- accessibilité ;
- mises à jour ;
- signature et notarisation ;
- packaging ;
- dépendances système ;
- maintenance à long terme.

Propose une recommandation motivée, pas une préférence automatique pour notre stack initiale.

## 7. AI Provider Manager — priorité critique

Étudie une couche d'abstraction fournisseur permettant de changer de modèle sans modifier le moteur LoL.

### OpenRouter
Vérifie les fonctionnalités, modèles gratuits, limites, tarifs, BYOK, routage, disponibilité, confidentialité, conditions d'utilisation et conditions commerciales.

Ne présume pas que les modèles gratuits sont illimités ni stables.

### OpenAI / Codex
Vérifie séparément les possibilités et conditions de :
- API OpenAI ;
- Codex ;
- Codex CLI ;
- Codex App Server ;
- SDK ou outils officiellement documentés ;
- authentification et abonnement ChatGPT.

Ne déduis jamais qu'un abonnement ChatGPT autorise l'intégration dans une application tierce. Vérifie explicitement les usages autorisés, l'accès des utilisateurs finaux, l'usage commercial, la redistribution, l'OAuth et les limites.

### Anthropic / Claude
Vérifie séparément :
- API Anthropic ;
- Claude Code ;
- Agent SDK ;
- authentification OAuth ;
- abonnements Claude grand public ;
- conditions de redistribution et d'intégration commerciale.

Ne confonds pas accès API, abonnement consommateur, outil CLI et autorisation d'intégration tierce.

### Autres fournisseurs et modèles locaux
Évalue Gemini, Ollama, llama.cpp et d'autres solutions pertinentes.

### Règles impératives
- Aucun cookie, mot de passe, token de session ou mécanisme d'extraction de session.
- Aucun contournement des limites ou conditions.
- Ne pas traiter une connexion OAuth comme une permission commerciale implicite.
- Pour chaque mode d'accès, classer : autorisé et documenté / possible sous approbation / non documenté / interdit ou déconseillé.
- Si l'accès par abonnement ne peut pas être intégré légalement, le dire sans ambiguïté.
- Proposer API payante, BYOK ou modèle local comme alternatives, en expliquant leurs coûts et limites.
- L'application doit rester utile sans IA distante.
- OpenRouter est un adaptateur optionnel, pas une dépendance structurante.

Fournis une matrice fournisseur × mode d'accès × facturation × autorisation × usage commercial × risques.

## 8. Coûts et modèle économique

Estime séparément :
- coûts de développement ;
- coûts récurrents d'infrastructure ;
- coûts de distribution et certificats ;
- coûts API selon plusieurs profils d'utilisation ;
- coûts éventuels d'hébergement et de synchronisation ;
- support, maintenance et mises à jour.

Fais des hypothèses explicites et des scénarios bas / moyen / élevé. N'invente pas de tarifs : source officielle et date pour chaque prix. Distingue coût du fournisseur, coût utilisateur et coût éditeur.

## 9. Licences, conformité et commercialisation

Vérifie les licences de chaque composant envisagé et les obligations de redistribution.

Analyse les règles Riot pour une application publique ou commerciale, les marques, contenus, données, mentions et éventuelles approbations.

Étudie confidentialité, RGPD si applicable, stockage des données, consentement, télémétrie, sécurité des secrets et mises à jour signées.

Distingue les obligations certaines des points à faire valider juridiquement.

## 10. Architecture cible et diagrammes

Propose :
- diagramme de contexte ;
- diagramme de composants ;
- flux de données ;
- frontières de confiance ;
- architecture de stockage et synchronisation ;
- intégration des fournisseurs IA ;
- architecture de distribution et mises à jour.

Utilise Mermaid quand utile. Donne une arborescence de projet indicative, mais ne crée pas cette arborescence dans le dépôt et ne génère pas de code.

## 11. Roadmap

Propose un MVP réaliste puis les phases suivantes.

Pour chaque phase : fonctionnalités, dépendances, difficulté, risques, livrables, critères d'acceptation et estimation de l'effort en fourchette.

Identifie les fonctionnalités à reporter jusqu'à validation des données Riot et de la valeur réelle du produit.

## 12. Livrables

Crée les fichiers suivants dans `study/` :

1. `EXECUTIVE_SUMMARY.md`
2. `FEASIBILITY_STUDY.md`
3. `TECH_STACK_COMPARISON.md`
4. `ARCHITECTURE.md`
5. `RIOT_API_ANALYSIS.md`
6. `AI_PROVIDER_ANALYSIS.md`
7. `COST_ANALYSIS.md`
8. `SECURITY_AND_COMPLIANCE.md`
9. `DEVELOPMENT_ROADMAP.md`
10. `OPEN_QUESTIONS.md`
11. `SOURCES.md`

Les documents doivent être cohérents entre eux. Les sources doivent être cliquables et associées aux affirmations qu'elles étayent.

## 13. Questions finales et recommandations

Termine par :
- les 10 risques majeurs classés par gravité ;
- les 5 hypothèses les plus fragiles ;
- les fonctionnalités réalisables immédiatement ;
- les fonctionnalités dépendant d'une autorisation ou d'une validation externe ;
- l'architecture recommandée ;
- les technologies à écarter et pourquoi ;
- les coûts et contraintes cachés ;
- les décisions que le propriétaire doit prendre avant développement.

## 14. Règle d'arrêt

À la fin de l'étude, arrête-toi. Ne commence pas le développement, même si tu estimes avoir suffisamment d'informations.

Présente un résumé exécutif et la liste des fichiers créés. Attends une validation humaine explicite avant toute étape d'implémentation.
