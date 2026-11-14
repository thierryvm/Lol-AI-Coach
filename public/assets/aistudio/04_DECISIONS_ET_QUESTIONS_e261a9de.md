# Décisions connues et questions à trancher

## Orientations déjà retenues
- Produit : coach et outil d'analyse pour League of Legends.
- Couverture souhaitée : tous les champions, toutes les lanes et tous les rôles.
- Plateformes : Windows, macOS et Linux.
- Langage principal souhaité : Rust.
- Tauri 2 est une piste privilégiée, mais doit être comparée.
- Fonctionnement local prioritaire ; synchronisation Internet acceptable pour les données et mises à jour.
- Technologies gratuites et open source privilégiées.
- Pas d'abonnement IA obligatoire pour utiliser les fonctions fondamentales.
- OpenRouter est une option, jamais une dépendance obligatoire.
- Modèles locaux et API/BYOK peuvent être proposés.
- Les abonnements grand public ne doivent être intégrés que si le fournisseur l'autorise explicitement.
- Le projet pourrait être partagé puis commercialisé.
- Aucun bot, scripting ou contrôle automatisé du jeu.
- Étude et validation avant toute implémentation.

## Questions à résoudre par l'étude
1. Quelles fonctions live sont réellement permises et techniquement supportées par Riot ?
2. Quel niveau d'analyse des replays est réellement possible ?
3. Quelles données et statistiques sont suffisamment fiables et réutilisables ?
4. Quel MVP apporte une valeur réelle sans dépendre d'accès non garantis ?
5. Tauri 2 est-il le meilleur choix pour les trois OS ?
6. Quel stockage local et quelle stratégie de synchronisation adopter ?
7. Quels fournisseurs autorisent explicitement une intégration tierce par abonnement ?
8. Quel est le coût réaliste d'un usage IA pour différents profils ?
9. Quelles exigences Riot s'appliquent à une application publique et commerciale ?
10. Quelles décisions doivent être prises avant le premier sprint ?
