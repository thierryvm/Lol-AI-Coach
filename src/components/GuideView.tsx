import {
  Activity,
  ArrowRight,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Cpu,
  FlaskConical,
  History,
  Info,
  KeyRound,
  Keyboard,
  LayoutDashboard,
  Lightbulb,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Swords,
  Target,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getProviderDefinition, loadSavedAiSelection } from '../engines/aiConfig.ts';
import type { RiotPlatform, SavedPlayerProfile } from '../engines/types.ts';
import { OnboardingShareWizard } from './OnboardingShareWizard.tsx';

export type GuideTargetTab =
  | 'dashboard'
  | 'builds'
  | 'postgame'
  | 'live'
  | 'champions'
  | 'guide'
  | 'settings';

interface GuideViewProps {
  riotId: string;
  region: RiotPlatform;
  patchVersion: string;
  riotConfigured: boolean;
  riotKeyStartsWithRgapi: boolean;
  riotKeyLength: number;
  geminiConfigured: boolean;
  archivedMatchesCount: number;
  savedProfilesCount: number;
  savedProfiles: SavedPlayerProfile[];
  onSaveProfile: (profile: Omit<SavedPlayerProfile, 'id'> & { id?: string }) => void;
  onSwitchProfile: (profile: SavedPlayerProfile) => void;
  onNavigate: (tab: GuideTargetTab) => void;
}

type WorkflowStageId = 'before' | 'during' | 'after' | 'career';
type FeatureCategory = 'all' | 'builds' | 'ai' | 'live' | 'account';
type ApiFilter = 'all' | 'active' | 'opportunity';

const CHECKLIST_STORAGE_KEY = 'lol_ai_coach_guide_checklist_v1';

interface WorkflowStage {
  id: WorkflowStageId;
  stepNumber: string;
  title: string;
  subtitle: string;
  targetTab: GuideTargetTab;
  targetLabel: string;
  steps: Array<{
    title: string;
    detail: string;
  }>;
  checklist: Array<{
    id: string;
    label: string;
  }>;
  proNote: string;
}

const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: 'before',
    stepNumber: '01',
    title: 'Avant la partie (Builds, Runes & Boutique LoL)',
    subtitle:
      'Préparez votre équipement, vos pages de runes synchronisées avec le client LoL et vos mémos avant le lancement.',
    targetTab: 'builds',
    targetLabel: 'Ouvrir Avant la partie',
    steps: [
      {
        title: 'Choisir votre champion, votre rôle & les 5 ennemis (ou 5 cibles du simulateur)',
        detail:
          'Sélectionnez votre champion parmi les 8 catégories (dont Junglers) et vos adversaires. Dans le Simulateur d’impact en bas de page, cliquez sur le crayon de n’importe laquelle des 5 cibles pour tester un adversaire précis.',
      },
      {
        title: 'Gérer & synchroniser vos Runes (Éditeur officiel & MES PAGES)',
        detail:
          'Passez entre « RUNES · ÉDITEUR » (monuments officiels, mode Liste ou Grille, comparaison bleue vs méta, renommage au crayon, boutons SAUVEGARDER / + / Corbeille) et « MES PAGES » pour importer, modifier et activer vos pages directement dans League of Legends via le pont Windows v3.4.',
      },
      {
        title: 'Explorer la Boutique Officielle LoL, cliquer sur « Recette » & noter vos mémos',
        detail:
          'Cliquez sur « Recette » sur n’importe quel objet conseillé ou populaire (ou ouvrez « OBJETS · BOUTIQUE & RECETTES ») pour inspecter l’arbre complet (sous-composants, coût de fusion, évolutions) et double-cliquez pour équiper l’Atelier 6 emplacements. Enregistrez aussi vos réflexes dans « Mes mémos ».',
      },
    ],
    checklist: [
      { id: 'before-comp', label: 'Renseigner mon champion + les 5 ennemis (ou modifier une cible via le crayon)' },
      { id: 'before-runes', label: 'Personnaliser ou synchroniser une page de runes avec le client LoL' },
      { id: 'before-shop', label: 'Cliquer sur « Recette » ou explorer « OBJETS · BOUTIQUE & RECETTES »' },
      { id: 'before-memo', label: 'Créer ou relire un mémo de duel dans « Mes mémos »' },
      { id: 'before-passive', label: 'Tester un scénario (Retard / Snowball) et cliquer sur (i) « Formule IA »' },
    ],
    proNote:
      'Si vous modifiez ou activez une page de runes déjà ouverte à l’écran dans League of Legends, quittez la page puis rouvrez-la dans le client Riot pour rafraîchir son affichage instantanément. Vos mémos restent aussi accessibles partout via Ctrl+K (⌘K).',
  },
  {
    id: 'during',
    stepNumber: '02',
    title: 'Pendant la partie (En partie · Live & Temps Réel)',
    subtitle:
      'Vue organisée par phases de jeu avec sorts ennemis (gameEvent), synergie de combo allié, contre-objets et Coach Vocal IA.',
    targetTab: 'live',
    targetLabel: 'Ouvrir En partie · Live',
    steps: [
      {
        title: 'Survoler « En partie · Live » dans le menu gauche & suivre les phases chronologiques',
        detail:
          'Depuis n’importe quel écran, survolez « En partie · Live » dans la barre latérale pour voir votre champion, le rang moyen du lobby, les prochains objectifs neutres et le prochain achat prioritaire. Dans la vue Live, utilisez les onglets « 1. Départ (0–3m) », « 2. Phase de lane », « 3. Mid / Late », « 4. Coach Vocal & IA » ou « Suivi auto selon l’horloge ».',
      },
      {
        title: 'Suivre sorts ennemis (gameEvent), synergie de composition & radar gank',
        detail:
          'Le pont v3.4 capte les événements « gameEvent » en direct pour déclencher des alertes Toast sur les sorts majeurs et alimenter le widget « Sorts Ennemis détectés » (compte à rebours + copie format chat type « Zed no Flash -> 15:35 »). En parallèle, « Synergie de composition » identifie votre meilleur binôme allié pour enchaîner un combo selon sa position.',
      },
      {
        title: 'Utiliser « Analyser » (Web Speech), les commandes micro & le Pont Windows v3.4',
        detail:
          'Cliquez sur « Analyser » pour entendre vos 3 priorités live, ou activez le micro (« Mon A », « Mon ultime », « Mon flash », « Dragon », « Gank imminent », « Aatrox plus de flash »). Lancez lol-coach-bridge.bat v3.4 sur PC (dans un onglet dédié hors iframe) pour recevoir or, achats et niveaux A/Z/E/R en direct.',
      },
    ],
    checklist: [
      { id: 'during-hover', label: 'Tester l’aperçu rapide au survol sur « En partie · Live » dans le menu' },
      { id: 'during-phases', label: 'Basculer entre les phases (Départ / Lane / Mid-Late) ou activer le suivi auto' },
      { id: 'during-events', label: 'Vérifier les sorts ennemis (gameEvent), la Synergie de combo et les Contre-Objets' },
      { id: 'during-call', label: 'Cliquer sur « Analyser » pour tester la synthèse vocale Web Speech' },
      { id: 'during-bridge', label: 'Lancer lol-coach-bridge.bat (v3.4) dans un onglet dédié ou Détecter via Spectator-V5' },
    ],
    proNote:
      'Pour respecter Riot Vanguard, le client local n’expose pas les appuis clavier en jeu ni vos temps de recharge A/Z/E/R en cours : l’app détecte automatiquement vos montées de niveau 1→18 et les gameEvent, et vous activez un timer sort en 1 clic ou au micro (« Mon flash »).',
  },
  {
    id: 'after',
    stepNumber: '03',
    title: 'Après la partie (Après la partie · Analyse Post-Game)',
    subtitle: 'Comprenez chaque mort sur la carte, suivez votre courbe de forme et exportez vos données hors-ligne.',
    targetTab: 'postgame',
    targetLabel: 'Ouvrir Après la partie',
    steps: [
      {
        title: 'Filtrer l’historique & vérifier la validation du Programme',
        detail:
          'Filtrez vos parties par Victoire/Défaite, Rôle ou Champion. Le bandeau « Validation du Programme d’Entraînement » indique instantanément quels objectifs (Survie, Rythme, Macro) sont réussis.',
      },
      {
        title: 'Inspecter la Carte Tactique, la courbe & lancer le débriefing IA',
        detail:
          'Ouvrez « Carte Tactique & Morts » en grand format (22 tours, 34 buissons, 10 champions + calque Heatmap) et parcourez le graphique d’évolution multi-matchs pour comprendre chaque tournant du match.',
      },
      {
        title: 'Exporter les 10 dernières parties en CSV ou JSON',
        detail:
          'Utilisez les boutons « Exporter (10) · CSV / JSON » dans « Après la partie » (ou en bas d’« Aujourd’hui ») pour ouvrir vos KDA, CS/min, dégâts et vision dans Excel ou votre propre outil.',
      },
    ],
    checklist: [
      { id: 'after-goals', label: 'Vérifier mes objectifs validés (Survie, Rythme, Macro) sur le match' },
      { id: 'after-trend', label: 'Tester le graphique d’évolution (10 ou 15 parties) sur mon champion' },
      { id: 'after-map', label: 'Inspecter une mort ou le calque Heatmap dans « Carte Tactique & Morts »' },
      { id: 'after-export', label: 'Tester l’export CSV ou JSON des 10 dernières parties' },
    ],
    proNote:
      'Dans « Carte Tactique & Morts », utilisez les flèches ← et → du clavier pour enchaîner vos morts dans l’ordre chronologique sans lâcher les yeux de la carte.',
  },
  {
    id: 'career',
    stepNumber: '04',
    title: 'Suivi quotidien, Compte & Famille (Aujourd’hui & Réglages)',
    subtitle: 'Consultez votre conseil du jour, votre Score de Forme et pilotez vos comptes et moteurs IA.',
    targetTab: 'dashboard',
    targetLabel: 'Ouvrir Aujourd’hui',
    steps: [
      {
        title: 'Consulter le Conseil Tactique Contextuel & le Score de Forme',
        detail:
          'Chaque jour, une astuce ciblée issue de votre Synthèse Globale IA apparaît en haut d’« Aujourd’hui ». Passez le Programme d’Entraînement en mode « Standard » ou « Exigeant » et cliquez sur les pastilles (✓ / ×) pour revoir un match précis.',
      },
      {
        title: 'Basculer de compte en 1 clic depuis la barre latérale ou le menu Compte',
        detail:
          'Cliquez sur votre carte Riot ID en bas à gauche (ou sur le menu compte en haut à droite) pour changer de profil Famille/Amis, modifier votre Riot ID, lancer une synchro ou basculer entre thème clair et sombre.',
      },
      {
        title: 'Configurer votre moteur IA & le Pont PC dans Réglages & Compte',
        detail:
          'L’écran « Réglages & Compte » est séparé en 3 onglets (« Compte & Famille », « Moteur IA », « Services & PC ») pour gérer vos proches, choisir votre modèle IA (Gemini, Claude, OpenAI, Ollama...) et télécharger le pont Windows v3.4.',
      },
    ],
    checklist: [
      { id: 'career-daily', label: 'Valider mon « Conseil Tactique du jour » sur Aujourd’hui' },
      { id: 'career-cmd', label: 'Tester la recherche rapide Ctrl+K (⌘K) ou le menu Compte' },
      { id: 'career-synth', label: 'Générer ma Synthèse Globale IA sur mes matchs archivés' },
      { id: 'career-family', label: 'Explorer les 3 onglets de « Réglages & Compte »' },
    ],
    proNote:
      'Lorsque vous synchronisez un nouveau match ou que vous atteignez un palier d’entraînement, une notification toast en bas à droite vous donne accès au bilan en 1 clic.',
  },
];

interface FeatureGuideCard {
  id: string;
  category: Exclude<FeatureCategory, 'all'>;
  title: string;
  where: string;
  summary: string;
  howToUse: string;
  targetTab: GuideTargetTab;
  keywords: string;
}

const FEATURE_CARDS: FeatureGuideCard[] = [
  {
    id: 'official-runes-lcu',
    category: 'builds',
    title: 'Éditeur Officiel de Runes, « MES PAGES » & Synchro Client LoL (LCU v3.4)',
    where: 'Avant la partie → Onglets RUNES · ÉDITEUR & MES PAGES',
    summary:
      'Reproduit fidèlement l’interface du client Riot (monuments Sorcellerie, Précision, Domination, Volonté, Inspiration, vue Liste détaillée ou Grille complète, comparaison bleue vs méta) et lit/écrit directement vos pages dans League of Legends via le pont local v3.4.',
    howToUse:
      'Lancez lol-coach-bridge.bat v3.4 avec League of Legends ouvert, cliquez sur « Importer du client LoL », modifiez vos runes ou fragments 3×3 puis cliquez sur « SAUVEGARDER » ou « Équiper dans LoL ». Pensez à fermer puis rouvrir la page dans le client Riot si elle était déjà affichée.',
    targetTab: 'builds',
    keywords: 'runes lcu client officiel editeur mes pages sauvegarder importer equiper s3.4 pont windows',
  },
  {
    id: 'lol-item-shop-recipe',
    category: 'builds',
    title: 'Boutique Officielle LoL & Arbre Interactif « Recette »',
    where: 'Avant la partie → Bouton Recette sur chaque objet & onglet OBJETS · BOUTIQUE & RECETTES',
    summary:
      'Affiche toute la boutique officielle Data Dragon filtrable par statistiques (AD, AP, PV, Armure, RM, Hâte, Anti-soin...) et catégories, avec le panneau « Recette » montrant les sous-composants, le coût de fusion et les objets vers lesquels l’item évolue.',
    howToUse:
      'Cliquez sur « Recette » sur n’importe quel item recommandé/populaire (ou ouvrez l’onglet Boutique). Cliquez sur un composant pour remonter son arbre, et double-cliquez sur un objet pour le placer dans l’Atelier 6 emplacements.',
    targetTab: 'builds',
    keywords: 'boutique shop officiel recette composants into atelier objets items cout fusion double clic',
  },
  {
    id: 'live-popover-phases',
    category: 'live',
    title: 'Aperçu Live au Survol & Navigation par Phases Chronologiques',
    where: 'Barre latérale gauche (survol) & En partie · Live → Onglets de phase',
    summary:
      'Le survol de « En partie · Live » ouvre un aperçu glassmorphique (champion, KDA/niveau, rang moyen du lobby, timers Dragon/Baron et prochain rappel prioritaire). Dans l’écran Live, 4 phases chronologiques évitent toute surcharge visuelle pendant la partie.',
    howToUse:
      'Survolez « En partie · Live » sans quitter votre page actuelle, ou ouvrez la vue et activez « Suivi auto selon l’horloge » pour basculer automatiquement de « 1. Départ (0–3m) » vers « 2. Phase de lane » puis « 3. Mid / Late ».',
    targetTab: 'live',
    keywords: 'survol popover apercu barre laterale phases depart lane mid late suivi auto horloge',
  },
  {
    id: 'live-gameevent-enemy-spells',
    category: 'live',
    title: 'Détection « gameEvent », Alertes Toast & Tracker Sorts Ennemis',
    where: 'En partie · Live → Rappel Sorts Ennemis détectés (gameEvent)',
    summary:
      'Parse automatiquement les événements de jeu (lancers d’ultimes, Flash, kills, objectifs) reçus via le pont Windows v3.4, affiche une alerte Toast discrète sur les sorts majeurs et tient un compte à rebours dynamique basé sur Data Dragon.',
    howToUse:
      'Filtrez sur « Tous », « En recharge » ou « Majeurs », cliquez sur un sort ennemi si vous le voyez hors vision pour lancer son timer, ou cliquez sur « Copier chat » pour coller instantanément « Zed no Flash -> 15:35 » dans le chat allié.',
    targetTab: 'live',
    keywords: 'gameevent sorts ennemis flash ultime timer toast alerte copie chat live',
  },
  {
    id: 'live-composition-synergy',
    category: 'live',
    title: 'Synergie de Composition · Meilleur Binôme Combo en Temps Réel',
    where: 'En partie · Live → Synergie de composition (Phase Lane / Mid-Late)',
    summary:
      'Analyse la composition alliée, votre position en direct, les contrôles de foule (CC) officiels Data Dragon et la disponibilité d’ultime (Niv. 6+) pour désigner l’allié idéal avec qui engager ou protéger en teamfight.',
    howToUse:
      'Repérez le binôme « Meilleur combo » en haut de la carte (ex. Séquence 1 → 2 : CC d’ouverture suivi de votre burst/peel) et comparez les scores de compatibilité des autres coéquipiers.',
    targetTab: 'live',
    keywords: 'synergie composition combo allies cc engage peel binome temps reel',
  },
  {
    id: 'live-counters-jungle-lane',
    category: 'live',
    title: 'Contre-Objets Live, Radar Jungle (7 zones) & Comparatif Lane',
    where: 'En partie · Live → Phases 2 & 3 (Lane / Mid-Late)',
    summary:
      'Détecte les menaces et items achetés par les adversaires pour recommander les contre-achats achetables avec votre or actuel, suit le danger de gank sur les 7 zones de la carte et compare votre rythme (CS/KDA) aux stats méta de votre voie.',
    howToUse:
      'Dans Contre-Objets, filtrez sur « Achetables » avant votre back ; sur le Radar Jungle, cliquez sur une des 7 zones de la mini-map ou sur les boutons tactiles dessous dès que le jungler ennemi apparaît.',
    targetTab: 'live',
    keywords: 'contre objets items anti soin radar jungle gank mini map 7 zones comparatif lane',
  },
  {
    id: 'voice-mic-coach',
    category: 'live',
    title: 'Bouton « Analyser » Web Speech, Coach Micro & Ordre des Sorts 1→18',
    where: 'En partie · Live → Onglet 4. Coach Vocal & IA + Timeline Sorts',
    summary:
      'Cliquer sur « Analyser » génère vos 3 priorités live et les lit à voix haute via Web Speech. Le micro écoute vos commandes vocales et votre ordre de compétences 1→18 (A/Z/E/R) se met à jour automatiquement dès qu’un point de sort est attribué.',
    howToUse:
      'Prononcez « Mon A », « Mon ultime », « Mon flash », « Dragon », « Baron », « Gank imminent » ou « [Champion] plus de flash » pour démarrer le chrono correspondant sans lâcher votre souris.',
    targetTab: 'live',
    keywords: 'micro microphone voix vocal web speech analyser mon a ultime flash dragon baron gank azer',
  },
  {
    id: 'lobby-scout-spells',
    category: 'live',
    title: 'Scouting de Lobby (style Porofessor) & Sorts d’Invocateur',
    where: 'En partie · Live → Panneau Connexion Live & Tracker Sorts d’Invocateur',
    summary:
      'En partie détectée par Spectator-V5, cliquez sur « Scanner le lobby (Rangs & Maîtrises) » pour afficher le rang, le winrate, la maîtrise sur le champion joué et les tags tactiques des 10 joueurs, plus les chronos Flash/TP/Ignite/Exhaust.',
    howToUse:
      'Cliquez sur « Scanner le lobby » en début de partie pour repérer les cibles à prioriser, puis cliquez sur le sort d’invocateur d’un ennemi dès qu’il le dépense.',
    targetTab: 'live',
    keywords: 'porofessor lobby scout rang maitrise flash tp teleportation sort invocateur timer live',
  },
  {
    id: 'contextual-advice',
    category: 'ai',
    title: 'Conseil Tactique Contextuel (Astuce du jour) & Boutons (i)',
    where: 'Aujourd’hui → Tout en haut sous le profil',
    summary:
      'Croise votre Synthèse Globale IA et vos statistiques par classe de champion pour afficher chaque jour une priorité claire. Chaque section d’« Aujourd’hui » dispose aussi d’une icône (i) explicative.',
    howToUse:
      'Lisez l’astuce du jour dès l’ouverture, naviguez avec < >, cliquez sur « Appliquer aujourd’hui » pour verrouiller votre focus ou sur « Optimiser [Champion] ».',
    targetTab: 'dashboard',
    keywords: 'conseil tactique contextuel astuce jour synthese ia info bulle aide',
  },
  {
    id: 'gpi-radar-duo',
    category: 'ai',
    title: 'Profil de Performance 5 Axes (GPI) & Synergie Coéquipiers / Famille',
    where: 'Aujourd’hui → Sous les 4 indicateurs principaux',
    summary:
      'Calcule un radar à 5 axes (Combat & Part de dégâts, Farm, Vision, Survie, Objectifs) comparé aux cibles de votre rôle, affiche vos Défis Riot (Challenges-V1) et détecte automatiquement vos partenaires de jeu réguliers.',
    howToUse:
      'Repérez votre « Point fort » et votre « Axe prioritaire » sur le radar, puis consultez le tableau de droite pour voir votre taux de victoire en duo.',
    targetTab: 'dashboard',
    keywords: 'gpi radar performance 5 axes combat farm vision survie objectifs duo famille coequipier challenges',
  },
  {
    id: 'training-program',
    category: 'live',
    title: 'Programme d’Entraînement Actif, Score de Forme & Toasts',
    where: 'Aujourd’hui · En partie · Live · Après la partie',
    summary:
      'Calcule votre Score de Forme (/100) et suit 3 objectifs adaptés à votre rôle (Survie, Rythme/Vision, Macro) en mode Standard ou Exigeant. Des notifications toast vous avertissent dès qu’un palier ou sort majeur est détecté.',
    howToUse:
      'Dans « Aujourd’hui », choisissez Standard ou Exigeant et cliquez sur une pastille (✓ / ×) pour inspecter le match concerné dans « Après la partie ».',
    targetTab: 'dashboard',
    keywords: 'programme entrainement score forme objectif standard exigeant notification toast alerte',
  },
  {
    id: 'postgame-trend',
    category: 'live',
    title: 'Courbe d’Évolution & Export CSV / JSON (10 dernières parties)',
    where: 'Après la partie → Barre du haut & Sous la carte tactique',
    summary:
      'Visualise votre progression courbe par courbe (KDA, Or/min, Vision) sur 5 à 20+ matchs, et permet d’exporter instantanément les statistiques des 10 dernières parties en CSV (Excel) ou JSON.',
    howToUse:
      'Sélectionnez la plage de parties puis cliquez sur un point pour ouvrir ce match, ou utilisez les boutons « Exporter (10) · CSV / JSON ».',
    targetTab: 'postgame',
    keywords: 'graphique evolution tendance kda or vision 10 parties export csv json excel hors-ligne',
  },
  {
    id: 'command-palette',
    category: 'account',
    title: 'Palette de Commande Universelle (Ctrl+K / ⌘K)',
    where: 'Barre supérieure → Bouton Rechercher ⌘K (partout dans l’app)',
    summary:
      'Permet de sauter en 1 seconde vers un écran, un champion (Build ou Fiche Encyclopédie), une partie archivée, un mémo de duel ou le mode clair/sombre sans toucher à la souris.',
    howToUse:
      'Appuyez sur Ctrl+K (Windows) ou ⌘K (Mac), tapez quelques lettres (ex. « Sona », « Leona », « Live »), naviguez avec ↑ / ↓ et validez avec Entrée.',
    targetTab: 'dashboard',
    keywords: 'ctrl k cmd palette commande recherche rapide raccourci clavier navigation',
  },
  {
    id: 'multi-combo',
    category: 'builds',
    title: 'Carnet de Mémos complet, Contre-picks & Multi-Combinaisons',
    where: 'Avant la partie → Zone Mémo de duel & Scénarios',
    summary:
      'Propose 3 contre-picks en draft (« Suggérer des contre-picks »), offre un gestionnaire de mémos (« Enregistrer » + « Mes mémos » pour éditer, filtrer et supprimer) et calcule 4 builds prêts à jouer selon le scénario.',
    howToUse:
      'Écrivez votre note de match-up puis cliquez sur « Enregistrer ». Ouvrez « Mes mémos » pour modifier ou recharger un ancien duel en 1 clic.',
    targetTab: 'builds',
    keywords: 'calculateur combinaisons dominé retard snowball anti soin runes conseiller pick draft memo carnet matchup',
  },
  {
    id: 'atelier-sandbox',
    category: 'builds',
    title: 'Atelier Équipement 6 Emplacements & Comparateur de Deltas',
    where: 'Avant la partie → Section Atelier & Simulateur',
    summary:
      'Testez librement n’importe quel objet dans vos 6 emplacements, ajustez le niveau de 1 à 18 et les charges Cœuracier, et voyez l’écart exact (vert/rouge) par rapport au build conseillé.',
    howToUse:
      'Cliquez sur un emplacement pour choisir un objet dans la Boutique Officielle (ou sur la croix du slot pour le retirer) et comparez vos dégâts en direct.',
    targetTab: 'builds',
    keywords: 'atelier emplacement equipement stats delta coeuracier niveau retirer croix',
  },
  {
    id: 'popular-builds-search',
    category: 'builds',
    title: 'Recherche de Builds Web (U.GG / OP.GG) & Application en 1 Clic',
    where: 'Avant la partie → Recherche de Builds',
    summary:
      'Interroge Google Search en direct sur U.GG, OP.GG et Lolalytics pour suggérer les objets populaires du patch actuel avec leur bouton « Recette » dédié.',
    howToUse:
      'Cliquez sur « Rechercher sur le Web » pour obtenir les items méta, inspectez leur « Recette » ou appliquez la sélection directement dans l’Atelier.',
    targetTab: 'builds',
    keywords: 'recherche builds google u.gg op.gg lolalytics recette meta',
  },
  {
    id: 'passive-ai',
    category: 'ai',
    title: 'Bouton (i) « Formule IA » & Simulateur sur 5 Cibles Modifiables',
    where: 'Avant la partie → Simulateur d’impact en bas',
    summary:
      'Calcule les dégâts bruts et mitigés sur 3s/6s/10s contre 5 champions ennemis (modifiables chacun via l’icône crayon) et explique par IA comment un passif unique agit sur vos stats.',
    howToUse:
      'Cliquez sur une des 5 cibles pour simuler vos dégâts, cliquez sur son petit crayon pour changer de champion ennemi, ou cliquez sur (i) « Formule IA » à côté d’un objet.',
    targetTab: 'builds',
    keywords: 'aube crepuscule passif ia formule simulateur degats cibles modifier crayon data dragon',
  },
  {
    id: 'multi-ai-providers',
    category: 'ai',
    title: 'Multi-Fournisseurs IA & Choix du Modèle (Gemini, Claude, OpenAI, Local)',
    where: 'Réglages & Compte → Onglet Moteur IA',
    summary:
      'Permet de brancher votre fournisseur préféré : Google Gemini, Claude Code (CLI Anthropic), Anthropic API, OpenAI, OpenRouter, Mistral, Groq, DeepSeek ou Ollama local.',
    howToUse:
      'Ouvrez « Réglages & Compte » puis l’onglet « Moteur IA », choisissez votre fournisseur et le modèle exact, puis cliquez sur « Tester la connexion ».',
    targetTab: 'settings',
    keywords: 'claude code anthropic openai chatgpt gemini mistral groq modele ia abonnement compte reglages',
  },
  {
    id: 'career-synthesis',
    category: 'ai',
    title: 'ADN Gameplay, Champions Recommandés & Synergie Duo',
    where: 'Aujourd’hui → Milieu de page',
    summary:
      'Analyse vos parties archivées et vos maîtrises officielles Riot pour définir votre profil, recommander des champions adaptés, visualiser vos meilleurs duos et générer un plan IA sur 3 parties.',
    howToUse:
      'Filtrez les suggestions par rôle (Auto, Top, Jungle, Mid, ADC, Support) puis cliquez sur « Préparer le build » pour ouvrir le champion dans « Avant la partie ».',
    targetTab: 'dashboard',
    keywords: 'adn gameplay recommandation champions duo synergie maitrise mastery synthese globale',
  },
  {
    id: 'postgame-map',
    category: 'live',
    title: 'Carte Tactique, Morts & Heatmap Multi-Matchs',
    where: 'Après la partie → Vue d’ensemble ou Carte Tactique & Morts',
    summary:
      'Superpose les 22 tours officielles (portée ~775), les 34 buissons calibrés, les portraits des 10 champions autour de chaque mort et un calque « Heatmap » agrégeant toutes vos morts de l’archive.',
    howToUse:
      'Dans « Après la partie », activez « Heatmap » pour repérer vos zones risquées, ou ouvrez la carte en grand format et parcourez vos morts avec ← / →.',
    targetTab: 'postgame',
    keywords: 'post-game carte tactique morts heatmap zones critiques tours portee buissons champions timeline courbes',
  },
  {
    id: 'live-bridge',
    category: 'live',
    title: 'Pont Windows v3.4 (LCU 38421 + Live Client 2999)',
    where: 'En partie · Live → Configurer pont / JSON · ou Réglages & Compte → Services & PC',
    summary:
      'Relie votre PC Windows à l’app sans bloquer CORS : lit l’or, le niveau, les achats, les compétences A/Z/E/R et les gameEvent sur 127.0.0.1:2999, et synchronise vos pages de runes avec le client League of Legends via 127.0.0.1:38421.',
    howToUse:
      'Téléchargez lol-coach-bridge.bat (v3.4) (Node.js requis sur Windows), double-cliquez dessus avant votre session et ouvrez l’app dans un onglet navigateur dédié (pas dans une iframe) pour activer « Pont auto (3s) » et l’import/export de runes.',
    targetTab: 'live',
    keywords: 'live temps reel pont windows v3.4 2999 38421 lcu runes bat iframe onglet dedie',
  },
  {
    id: 'encyclopedia',
    category: 'builds',
    title: 'Encyclopédie Champions (8 catégories dont Junglers) & Stats Niv. 1–18',
    where: 'Avant la partie → Bouton Encyclopédie / Champions (ou Ctrl+K)',
    summary:
      'Consultez la fiche officielle Data Dragon de tous les champions avec 8 catégories sur une ligne (dont Junglers), filtre physique/magique, tri par portée/difficulté, « Joués récemment » et stats niveau 1–18.',
    howToUse:
      'Cliquez sur un champion puis sur « Optimiser un build avec ... » pour l’ouvrir directement dans « Avant la partie ».',
    targetTab: 'champions',
    keywords: 'champions encyclopedie junglers categories sorts passif stats niveau portee',
  },
  {
    id: 'profiles-settings',
    category: 'account',
    title: 'Carte Compte Barre Latérale, Profils Famille & Onglets Réglages',
    where: 'Bas de la barre latérale · Menu Compte (haut droite) · Réglages & Compte',
    summary:
      'Changez de joueur Famille/Amis, modifiez votre Riot ID ou basculez entre mode clair et mode sombre directement depuis la barre latérale ou le menu compte. « Réglages & Compte » sépare Compte & Famille, Moteur IA et Services & PC.',
    howToUse:
      'Cliquez sur votre carte Riot ID en bas à gauche (ou sur votre nom en haut à droite) pour changer de profil en 1 clic, ou ouvrez « Réglages & Compte » pour ajouter un proche.',
    targetTab: 'settings',
    keywords: 'profils famille amis comptes reglages menu rapide sync cle riot theme sombre clair',
  },
];

interface TroubleshootingItem {
  id: string;
  question: string;
  cause: string;
  solution: string;
  targetTab: GuideTargetTab;
  actionLabel: string;
}

const TROUBLESHOOTING_ITEMS: TroubleshootingItem[] = [
  {
    id: 'runes-lcu-refresh',
    question: 'J’ai modifié ou activé une page de runes mais elle ne change pas à l’écran dans le client Riot',
    cause:
      'Le client League of Legends enregistre bien la modification envoyée via le pont LCU (v3.4), mais ne rafraîchit pas toujours visuellement la page si cette même page est déjà ouverte à l’écran au moment de la sauvegarde.',
    solution:
      'Quittez simplement la page de runes (ou cliquez sur une autre page) puis rouvrez-la dans le client League of Legends : vos runes et fragments modifiés apparaissent immédiatement à jour !',
    targetTab: 'builds',
    actionLabel: 'Ouvrir mes Runes (Avant la partie)',
  },
  {
    id: 'bridge-v34-bat',
    question: 'Le script lol-coach-bridge.bat affiche une erreur ou ne détecte pas mon client LoL',
    cause:
      'Deux causes fréquentes : 1) Node.js n’est pas encore installé sur Windows (« Le système ne peut exécuter le programme spécifié ») ou le script est encore en ancienne version (< v3.4) ; 2) l’app est ouverte dans l’aperçu intégré (iframe) qui bloque 127.0.0.1.',
    solution:
      'Vérifiez que Node.js (LTS) est installé sur Windows, re-téléchargez « lol-coach-bridge.bat (v3.4) » depuis « En partie · Live » ou « Avant la partie » (onglet MES PAGES), puis cliquez sur « Ouvrir dans un onglet dédié » dans votre navigateur.',
    targetTab: 'live',
    actionLabel: 'Ouvrir En partie · Live',
  },
  {
    id: 'recipe-button-shop',
    question: 'À quoi sert le bouton « Recette » et comment l’utiliser avec l’Atelier ?',
    cause:
      'Il était parfois difficile de savoir quels composants acheter en premier lors d’un back intermédiaire avec 700–1300 po.',
    solution:
      'Cliquez sur « Recette » sur n’importe quel item recommandé ou populaire (ou ouvrez « OBJETS · BOUTIQUE & RECETTES ») : la Boutique Officielle s’ouvre directement sur l’arbre complet (Sous-composants → Objet → Construit vers). Double-cliquez sur un objet pour l’équiper dans l’Atelier 6 emplacements.',
    targetTab: 'builds',
    actionLabel: 'Tester Boutique & Recette',
  },
  {
    id: 'vanguard-cooldowns',
    question: 'Pourquoi mes propres temps de recharge A/Z/E/R ne se lancent pas automatiquement dès que j’appuie sur une touche ?',
    cause:
      'Riot Vanguard et l’API officielle Live Client Data (127.0.0.1:2999) ne diffusent pas vos appuis clavier locaux ni le compte à rebours interne de vos sorts A/Z/E/R.',
    solution:
      'En revanche, le pont v3.4 lit automatiquement vos montées de niveau 1→18 (A/Z/E/R), vos achats, votre or et les événements « gameEvent » (Flash, ultimes, kills). Pour chronométrer vos propres sorts ou un sort ennemi hors événement, cliquez en 1 clic sur sa pastille ou dites « Mon flash » / « Mon ultime » au micro.',
    targetTab: 'live',
    actionLabel: 'Voir En partie · Live',
  },
  {
    id: 'quick-find',
    question: 'Comment retrouver vite un champion, un ancien match ou un mémo de duel ?',
    cause:
      'Avec 170+ champions, jusqu’à 45 parties archivées et vos notes personnelles, naviguer onglet par onglet peut sembler long.',
    solution:
      'Appuyez sur Ctrl+K (ou ⌘K sur Mac), ou cliquez sur « Rechercher ⌘K » tout en haut : tapez le nom d’un champion, d’un match ou d’un mémo pour sauter directement dessus.',
    targetTab: 'dashboard',
    actionLabel: 'Aller sur Aujourd’hui',
  },
  {
    id: 'memo-manage',
    question: 'Où sont enregistrés mes mémos de duel et comment les modifier ou supprimer ?',
    cause:
      'Les notes sont sauvegardées localement par paire de champions (ex. Tahm Kench vs Leona) et ne doivent pas se perdre entre deux parties.',
    solution:
      'Dans « Avant la partie », cliquez sur « Enregistrer » à droite du champ mémo pour sauvegarder, puis cliquez sur « Mes mémos » pour consulter, éditer, filtrer, recharger ou supprimer toutes vos notes.',
    targetTab: 'builds',
    actionLabel: 'Ouvrir Avant la partie',
  },
  {
    id: 'practice-tool',
    question: 'Ma partie Outil d’entraînement ou Personnalisée n’apparaît pas dans l’historique',
    cause:
      'Par conception, l’API officielle Riot Match-V5 ne publie pas les parties d’Outil d’entraînement ni certaines parties personnalisées privées.',
    solution:
      'Ouvrez « En partie · Live » avec lol-coach-bridge.bat v3.4 pendant votre session d’entraînement (ou utilisez l’import local LCU /history dans « Après la partie »).',
    targetTab: 'postgame',
    actionLabel: 'Ouvrir Après la partie',
  },
  {
    id: 'dominated',
    question: 'Je me fais dominer en lane : quel équipement choisir sans perdre trop d’or ?',
    cause:
      'Un build standard « snowball » devient contre-productif si vous avez du retard en or : vous finissez vos pics trop tard et mourez avant d’exister en teamfight.',
    solution:
      'Dans « Avant la partie », passez sur le scénario « Je me fais dominer » ou chargez la carte « Retard / Sécurité » du Calculateur Multi-Combinaisons pour privilégier les objets défensifs économiques.',
    targetTab: 'builds',
    actionLabel: 'Tester en mode Retard / Sécurité',
  },
  {
    id: 'passive-check',
    question: 'Comment savoir si un objet à passif vaut vraiment le coup ?',
    cause:
      'Les statistiques brutes affichées en boutique (AP, PV, Hâte) ne montrent pas la valeur cachée des passifs uniques ni les réductions liées à l’armure/RM ennemie.',
    solution:
      'Placez l’objet dans l’Atelier 6 emplacements, descendez au Simulateur d’impact, sélectionnez votre adversaire puis cliquez sur l’icône (i) « Formule IA » pour voir le gain réel en dégâts et en soin.',
    targetTab: 'builds',
    actionLabel: 'Ouvrir le Simulateur d’impact',
  },
  {
    id: 'death-analysis',
    question: 'Comment comprendre pourquoi je suis mort sur la carte par rapport aux ennemis ?',
    cause:
      'La vue compacte privilégie la lecture globale avec les courbes Or/CS, tandis que l’analyse tactique complète (positions des 10 champions, distances aux tours et dégâts subis) est regroupée dans un onglet dédié.',
    solution:
      'Dans « Après la partie », cliquez sur « Ouvrir en grand format → » (ou sur l’onglet « Carte Tactique & Morts »). Activez les calques Tours (22), Portée, Buissons, Champions ou Heatmap, puis parcourez vos morts avec ← et →.',
    targetTab: 'postgame',
    actionLabel: 'Ouvrir Carte Tactique & Morts',
  },
  {
    id: 'ai-provider-switch',
    question: 'Comment brancher Claude Code, Anthropic Claude ou OpenAI à la place de Gemini ?',
    cause:
      'Par défaut, l’application démarre sur Google Gemini, mais vous pouvez piloter les analyses avec votre propre abonnement ou clé (Claude Code en local, Anthropic API, OpenAI, Mistral, Groq, etc.).',
    solution:
      'Ouvrez « Réglages & Compte » → onglet « Moteur IA », sélectionnez votre fournisseur et le modèle souhaité, puis cliquez sur « Tester la connexion ». En ligne (Cloud), utilisez une clé API via Settings > Secrets ; en local sur votre PC, `claude login` connecte votre abonnement Claude Code.',
    targetTab: 'settings',
    actionLabel: 'Configurer mon fournisseur IA',
  },
  {
    id: 'share-family-repo',
    question: 'Pour partager avec mon fils : doit-il cloner le repo GitHub et créer sa propre clé Riot ?',
    cause:
      'Si vous lui partagez le lien web de votre app hébergée, votre clé serveur permanente suffit déjà pour vous deux ! En revanche, s’il clone le repo GitHub sur son PC, le fichier .env (contenant votre clé) est volontairement exclu de GitHub par sécurité.',
    solution:
      'Suivez l’assistant Onboarding juste au-dessus : choisissez « Partager votre lien web » (0 installation, 0 clé à créer pour lui) ou « Cloner le repo sur son PC » (avec téléchargement de l’assistant double-clic Windows/Mac).',
    targetTab: 'settings',
    actionLabel: 'Ouvrir Réglages & Compte',
  },
];

interface RiotApiCapability {
  name: string;
  endpoint: string;
  status: 'active' | 'opportunity';
  usage: string;
  benefitForYou: string;
}

const RIOT_API_CAPABILITIES: RiotApiCapability[] = [
  {
    name: 'ACCOUNT-V1 & SUMMONER-V4',
    endpoint: 'by-riot-id · summoners/by-puuid',
    status: 'active',
    usage: 'Résolution Pseudo#TAG → PUUID, niveau et icône de profil',
    benefitForYou: 'Permet de suivre plusieurs comptes Famille/Amis sur toutes les régions (EUW1, etc.).',
  },
  {
    name: 'LEAGUE-V4 (Solo/Duo & Flex)',
    endpoint: 'entries/by-puuid (RANKED_SOLO_5x5 & RANKED_FLEX_SR)',
    status: 'active',
    usage: 'Rang, LP, Winrate et séries en Solo/Duo et Flex + Scouting de lobby',
    benefitForYou: 'Affiche vos deux rangs sur « Aujourd’hui » et scanne les 10 joueurs en partie Live.',
  },
  {
    name: 'MATCH-V5 (+ Timeline)',
    endpoint: 'matches/by-puuid · /timeline',
    status: 'active',
    usage: 'Historique détaillé, positions des 10 champions par frame, dégâts subis & courbes CS/Or',
    benefitForYou: 'Alimente la Carte Tactique & Morts (grand format), Heatmap, courbes Post-Game et Synthèse Globale.',
  },
  {
    name: 'SPECTATOR-V5',
    endpoint: 'active-games/by-summoner',
    status: 'active',
    usage: 'Détection automatique d’une partie en cours et des 10 champions',
    benefitForYou: 'Pré-remplit votre match-up dans « Avant la partie » et « En partie · Live ».',
  },
  {
    name: 'LIVE CLIENT DATA (Local PC)',
    endpoint: '127.0.0.1:2999/liveclientdata/allgamedata',
    status: 'active',
    usage: 'Or, CS, achats, positions, niveaux A/Z/E/R et événements gameEvent en direct',
    benefitForYou:
      'Active le tracker de sorts ennemis, la synergie de composition, les contre-objets urgents et le mode Entraînement.',
  },
  {
    name: 'PONT WINDOWS LCU v3.4 (Local PC)',
    endpoint: '127.0.0.1:38421 · lol-runes / active-game / history',
    status: 'active',
    usage: 'Lecture et écriture bidirectionnelle de vos pages de runes dans le client League of Legends',
    benefitForYou:
      'Importe vos vraies pages dans « MES PAGES », permet de les modifier/sauvegarder/équiper en 1 clic.',
  },
  {
    name: 'CHAMPION-MASTERY-V4 & CHAMPION-V3',
    endpoint: 'champion-masteries/top · platform/v3/champion-rotations',
    status: 'active',
    usage: 'Top maîtrises officielles & champions gratuits de la semaine',
    benefitForYou:
      'Suggère vos meilleurs champions dans « Aujourd’hui » et indique les champions gratuits dans l’Encyclopédie.',
  },
  {
    name: 'CHALLENGES-V1 & LOL-STATUS-V4',
    endpoint: 'challenges/v1/player-data · status/v4/platform-data',
    status: 'active',
    usage: 'Palier de cristal des Défis Riot & surveillance en direct des incidents serveur',
    benefitForYou:
      'Affiche vos paliers de Défis et vous prévient immédiatement en cas de maintenance EUW1.',
  },
  {
    name: 'TOURNAMENT / CLASH-V1',
    endpoint: 'lol/clash/v1/players/by-puuid',
    status: 'opportunity',
    usage: 'Non encore branché · Tournois Clash du week-end',
    benefitForYou:
      'Permettrait de scouter automatiquement les équipes adverses lors des soirées Clash en famille ou entre amis.',
  },
];

export function GuideView({
  riotId,
  region,
  patchVersion,
  riotConfigured,
  riotKeyStartsWithRgapi,
  riotKeyLength,
  geminiConfigured,
  archivedMatchesCount,
  savedProfilesCount,
  savedProfiles,
  onSaveProfile,
  onSwitchProfile,
  onNavigate,
}: GuideViewProps) {
  const [activeStageId, setActiveStageId] = useState<WorkflowStageId>('before');
  const [featureCategory, setFeatureCategory] = useState<FeatureCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIssueId, setSelectedIssueId] = useState<string>('runes-lcu-refresh');
  const [apiFilter, setApiFilter] = useState<ApiFilter>('all');
  const [showApiDetails, setShowApiDetails] = useState(false);
  const [expandedFeatureIds, setExpandedFeatureIds] = useState<Record<string, boolean>>({
    'official-runes-lcu': true,
    'lol-item-shop-recipe': true,
    'live-gameevent-enemy-spells': true,
  });

  const [completedChecklist, setCompletedChecklist] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore storage read error
    }
    return {};
  });

  useEffect(() => {
    try {
      localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(completedChecklist));
    } catch {
      // ignore storage write error
    }
  }, [completedChecklist]);

  const activeStage =
    WORKFLOW_STAGES.find((st) => st.id === activeStageId) || WORKFLOW_STAGES[0];

  const totalChecklistCount = useMemo(
    () => WORKFLOW_STAGES.reduce((acc, st) => acc + st.checklist.length, 0),
    [],
  );
  const completedCount = useMemo(
    () =>
      WORKFLOW_STAGES.reduce(
        (acc, st) => acc + st.checklist.filter((item) => completedChecklist[item.id]).length,
        0,
      ),
    [completedChecklist],
  );
  const masteryPct = Math.round((completedCount / Math.max(1, totalChecklistCount)) * 100);

  const filteredFeatures = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return FEATURE_CARDS.filter((card) => {
      if (featureCategory !== 'all' && card.category !== featureCategory) return false;
      if (!q) return true;
      return `${card.title} ${card.where} ${card.summary} ${card.howToUse} ${card.keywords}`
        .toLowerCase()
        .includes(q);
    });
  }, [featureCategory, searchQuery]);

  const filteredApis = useMemo(() => {
    if (apiFilter === 'all') return RIOT_API_CAPABILITIES;
    return RIOT_API_CAPABILITIES.filter((api) => api.status === apiFilter);
  }, [apiFilter]);

  const selectedIssue =
    TROUBLESHOOTING_ITEMS.find((it) => it.id === selectedIssueId) || TROUBLESHOOTING_ITEMS[0];

  const toggleChecklistItem = (id: string) => {
    setCompletedChecklist((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const resetChecklist = () => {
    setCompletedChecklist({});
  };

  const toggleFeatureCard = (id: string) => {
    setExpandedFeatureIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const riotHealthy = riotConfigured && riotKeyStartsWithRgapi;
  const savedAiSelection = useMemo(() => loadSavedAiSelection(), []);
  const activeAiProvider = useMemo(
    () => getProviderDefinition(savedAiSelection.provider),
    [savedAiSelection.provider],
  );
  const aiStatusReady = savedAiSelection.provider === 'gemini' ? geminiConfigured : true;

  return (
    <div className="space-y-8">
      {/* 1. En-tête + Diagnostic en direct de l'environnement */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <Compass className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Mode d’emploi · Guide interactif à jour (v3.4)</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              Comment utiliser LoL AI Coach sans jamais vous perdre
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
              Suivez le parcours en 4 moments clés (Avant, Pendant, Après la partie et Suivi quotidien),
              maîtrisez la synchro client LoL v3.4 et sautez en 1 clic vers le bon écran.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] px-4 py-3 min-w-[230px] space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Maîtrise de l’outil
              </span>
              <span className="font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
                {completedCount}/{totalChecklistCount} ({masteryPct}%)
              </span>
            </div>
            <div className="h-2 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full w-full origin-left bg-amber-500 transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
                style={{ transform: `scaleX(${Math.max(0, Math.min(1, masteryPct / 100))})` }}
              />
            </div>
            {completedCount > 0 && (
              <button
                type="button"
                onClick={resetChecklist}
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                <span>Réinitialiser ma progression</span>
              </button>
            )}
          </div>
        </div>

        {/* Cartes de statut réel (Riot API, IA, Data Dragon, Compte) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-3.5 space-y-1">
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                Clé Riot API
              </span>
              <span
                className={`font-semibold ${
                  riotHealthy
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {riotHealthy ? 'Active' : 'À vérifier'}
              </span>
            </div>
            <div className="text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
              {riotHealthy
                ? `RGAPI (${riotKeyLength} car.) · 100 req/2m`
                : 'Mode local / référence'}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-3.5 space-y-1">
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                Moteur IA actif
              </span>
              <span
                className={`font-semibold ${
                  aiStatusReady
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {aiStatusReady ? 'Prêt' : 'Clé requise'}
              </span>
            </div>
            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
              {activeAiProvider.shortName} · <span className="font-mono text-[11px]">{savedAiSelection.model}</span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-3.5 space-y-1">
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" />
                Data Dragon Officiel
              </span>
              <span className="font-mono tabular-nums font-semibold text-sky-600 dark:text-sky-400">
                v{patchVersion}
              </span>
            </div>
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              Champions, objets &amp; runes à jour
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-3.5 space-y-1">
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                Compte actif
              </span>
              <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                {region}
              </span>
            </div>
            <div className="text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-white truncate">
              {riotId} · {archivedMatchesCount} match(s) · {savedProfilesCount} profil(s)
            </div>
          </div>
        </div>

        {/* Démarrage Express en 60 secondes */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <span>Démarrage Express en 60 secondes — Votre routine en 3 réflexes</span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Astuce : survolez <strong className="text-slate-700 dark:text-slate-200">En partie · Live</strong> dans le menu gauche pour un aperçu direct.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-3.5 hover:border-amber-500/50 transition-colors space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <span className="flex items-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
                  1. Aujourd’hui (À l’ouverture)
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Lisez votre <strong>Conseil Tactique du jour</strong> et vos 3 défis du <strong>Score de Forme</strong> avant de lancer la file.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('builds')}
              className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-3.5 hover:border-amber-500/50 transition-colors space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <span className="flex items-center gap-1.5">
                  <Swords className="w-3.5 h-3.5 text-sky-500 shrink-0" aria-hidden="true" />
                  2. Avant la partie (Draft)
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Importez ou équipez vos <strong>Runes LCU</strong>, ouvrez une <strong>Recette</strong> en boutique et relisez votre <strong>Mémo</strong>.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('live')}
              className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-3.5 hover:border-amber-500/50 transition-colors space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <span className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-hidden="true" />
                  3. En partie · Live &amp; Post-Game
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Suivez les phases, les <strong>sorts ennemis</strong>, le <strong>meilleur binôme combo</strong>, puis débriefez sur la Carte Tactique.
              </p>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0E14] px-3.5 py-2.5 text-[11px] text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
              <Keyboard className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
              Raccourcis pratiques :
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[10px]">
                Ctrl+K
              </kbd>{' '}
              / ⌘K : recherche rapide partout
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[10px]">
                Échap
              </kbd>{' '}
              : fermer modales &amp; aperçus
            </span>
            <span className="inline-flex items-center gap-1">
              <Bell className="w-3 h-3 text-sky-500" aria-hidden="true" />
              Toasts automatiques : sorts majeurs Live, nouveaux matchs &amp; objectifs validés
            </span>
          </div>
        </div>
      </section>

      {/* 1bis. Assistant Onboarding & Partage Famille pas à pas */}
      <OnboardingShareWizard
        activeRiotId={riotId}
        activeRegion={region}
        riotConfigured={riotConfigured}
        riotKeyStartsWithRgapi={riotKeyStartsWithRgapi}
        geminiConfigured={geminiConfigured}
        savedProfiles={savedProfiles}
        onSaveProfile={onSaveProfile}
        onSwitchProfile={onSwitchProfile}
        onNavigateTab={(tab) => onNavigate(tab)}
      />

      {/* 2. Parcours Interactif en 4 étapes */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            1. Parcours rapide : quel est votre moment de jeu ?
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cliquez sur une étape ci-dessous pour afficher les 3 gestes essentiels et accéder directement à l’écran concerné.
          </p>
        </div>

        {/* Sélecteur des 4 moments */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {WORKFLOW_STAGES.map((stage) => {
            const isActive = stage.id === activeStage.id;
            const stageDone = stage.checklist.filter((c) => completedChecklist[c.id]).length;
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setActiveStageId(stage.id)}
                className={`text-left p-3.5 rounded-xl border transition-colors space-y-1.5 ${
                  isActive
                    ? 'border-amber-500/70 bg-amber-500/10'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] hover:border-amber-500/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                  <span
                    className={`font-bold ${
                      isActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                    }`}
                  >
                    ÉTAPE {stage.stepNumber}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {stageDone}/{stage.checklist.length}
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                  {stage.title}
                </div>
              </button>
            );
          })}
        </div>

        {/* Détail interactif de l'étape sélectionnée */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {activeStage.title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {activeStage.subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(activeStage.targetTab)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              <span>{activeStage.targetLabel}</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Les 3 gestes pas à pas */}
            <div className="lg:col-span-7 space-y-3">
              {activeStage.steps.map((step, idx) => (
                <div
                  key={step.title}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-3.5 flex items-start gap-3"
                >
                  <span className="w-6 h-6 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono tabular-nums text-xs font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      {step.title}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {step.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Checklist interactive + Conseil pratique */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4 space-y-3">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  Ma check-list pratique (sauvegardée)
                </div>
                <div className="space-y-2">
                  {activeStage.checklist.map((item) => {
                    const checked = Boolean(completedChecklist[item.id]);
                    return (
                      <label
                        key={item.id}
                        className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors text-xs ${
                          checked
                            ? 'border-emerald-500/40 bg-emerald-500/5 text-slate-700 dark:text-slate-200'
                            : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-amber-500/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleChecklistItem(item.id)}
                          className="mt-0.5 rounded border-slate-300 accent-amber-500 shrink-0"
                        />
                        <span className={checked ? 'line-through opacity-75' : ''}>
                          {item.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/35 bg-amber-500/5 p-3.5 space-y-1">
                <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  Astuce sur cette étape
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {activeStage.proNote}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Explorateur & Recherche rapide des outils */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-amber-500" aria-hidden="true" />
              <span>2. Où trouver chaque outil ? (Recherche instantanée)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tapez un mot-clé (ex. « runes », « recette », « gameEvent », « synergie », « v3.4 », « heatmap ») pour trouver immédiatement l’outil.
            </p>
          </div>

          <div className="relative w-full md:w-72">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un outil ou un mot-clé..."
              aria-label="Rechercher un outil dans le guide"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Filtres par catégorie */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'Tous les outils' },
            { id: 'builds', label: 'Builds, Runes & Boutique' },
            { id: 'live', label: 'Live, Carte & Post-Game' },
            { id: 'ai', label: 'Analyse & Moteurs IA' },
            { id: 'account', label: 'Famille & Réglages' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setFeatureCategory(cat.id as FeatureCategory)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                featureCategory === cat.id
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] text-slate-600 dark:text-slate-300 hover:border-amber-500/40'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {filteredFeatures.length === 0 ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Aucun outil ne correspond à « {searchQuery} ». Essayez « runes », « recette », « gameEvent », « live » ou « famille ».
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredFeatures.map((card) => {
              const isOpen = Boolean(expandedFeatureIds[card.id]);
              return (
                <div
                  key={card.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-2.5"
                >
                  <button
                    type="button"
                    onClick={() => toggleFeatureCard(card.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-start justify-between gap-3 text-left"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {card.title}
                      </div>
                      <div className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                        {card.where}
                      </div>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                    )}
                  </button>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {card.summary}
                  </p>

                  {isOpen && (
                    <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                      <div className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                        <strong className="text-slate-900 dark:text-white">Comment faire : </strong>
                        {card.howToUse}
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate(card.targetTab)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121722] text-slate-800 dark:text-slate-100 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                      >
                        <span>Ouvrir cet écran</span>
                        <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Assistant Dépannage Express */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench className="w-4 h-4 text-sky-500" aria-hidden="true" />
            <span>3. Assistant Dépannage en 2 clics</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Choisissez la situation que vous rencontrez pour voir immédiatement l’explication et le bon bouton.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 space-y-2">
            {TROUBLESHOOTING_ITEMS.map((item) => {
              const active = item.id === selectedIssue.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedIssueId(item.id)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                    active
                      ? 'border-sky-500/60 bg-sky-500/10 text-slate-900 dark:text-white font-semibold'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] text-slate-600 dark:text-slate-300 hover:border-sky-500/40'
                  }`}
                >
                  {item.question}
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-5 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                {selectedIssue.question}
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Pourquoi cela arrive
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {selectedIssue.cause}
                </p>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  La solution immédiate
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                  {selectedIssue.solution}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-sky-500 shrink-0" aria-hidden="true" />
                <span>Raccourci direct vers l’écran concerné</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(selectedIssue.targetTab)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-500 transition-colors"
              >
                <span>{selectedIssue.actionLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 5. État technique & Services Riot API + Pont Local (dépliable) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-500" aria-hidden="true" />
              <span>4. Connexions Riot API, Pont Local v3.4 &amp; Raccourcis</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Votre clé personnelle Riot reste sécurisée côté serveur. Ouvrez les détails techniques pour consulter tous les flux Cloud et locaux (LCU / Live Client).
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowApiDetails((v) => !v)}
            aria-expanded={showApiDetails}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] text-slate-700 dark:text-slate-200 hover:border-emerald-500/60 transition-colors whitespace-nowrap shrink-0"
          >
            {showApiDetails ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>
              {showApiDetails ? 'Masquer les détails techniques' : 'Voir les flux Riot & Pont PC (technique)'}
            </span>
          </button>
        </div>

        {showApiDetails && (
          <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Filtrer les services connectés ou envisageables :
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {[
                  { id: 'all', label: 'Toutes' },
                  { id: 'active', label: 'Déjà actives' },
                  { id: 'opportunity', label: 'À ajouter ensuite' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setApiFilter(tab.id as ApiFilter)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                      apiFilter === tab.id
                        ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-emerald-500/40'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-4 flex items-start gap-3 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1 text-slate-700 dark:text-slate-300">
                <div className="font-semibold text-slate-900 dark:text-white">
                  Bon réflexe sécurité avec votre clé API
                </div>
                <p className="leading-relaxed">
                  Votre clé est protégée côté serveur via les Secrets. Évitez simplement de partager publiquement une capture d’écran du portail Riot où la ligne <code className="font-mono">RGAPI-...</code> apparaît en clair.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3 text-left font-medium">API / Pont</th>
                    <th className="py-2.5 px-3 text-left font-medium">Statut</th>
                    <th className="py-2.5 px-3 text-left font-medium">Rôle</th>
                    <th className="py-2.5 px-3 text-left font-medium">Ce que ça vous apporte</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                  {filteredApis.map((api) => (
                    <tr key={api.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 align-top">
                        <div className="font-semibold text-slate-900 dark:text-white">{api.name}</div>
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          {api.endpoint}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 align-top whitespace-nowrap">
                        {api.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            Actif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                            Opportunité
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 align-top text-slate-600 dark:text-slate-300">
                        {api.usage}
                      </td>
                      <td className="py-2.5 px-3 align-top text-slate-700 dark:text-slate-200">
                        {api.benefitForYou}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Raccourcis rapides alignés avec le menu principal */}
        <div className="flex flex-wrap gap-2.5 pt-1">
          {[
            { tab: 'dashboard' as GuideTargetTab, label: 'Aujourd’hui', icon: LayoutDashboard },
            { tab: 'builds' as GuideTargetTab, label: 'Avant la partie', icon: Swords },
            { tab: 'live' as GuideTargetTab, label: 'En partie · Live', icon: Activity },
            { tab: 'postgame' as GuideTargetTab, label: 'Après la partie', icon: History },
            { tab: 'champions' as GuideTargetTab, label: 'Encyclopédie Champions', icon: BookOpen },
            { tab: 'settings' as GuideTargetTab, label: 'Réglages & Compte', icon: Settings },
          ].map((btn) => {
            const Icon = btn.icon;
            return (
              <button
                key={btn.tab}
                type="button"
                onClick={() => onNavigate(btn.tab)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] text-slate-700 dark:text-slate-200 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{btn.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
