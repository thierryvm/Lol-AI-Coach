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
    title: 'Avant la partie (Draft & Builds)',
    subtitle: 'Préparez votre équipement et vos runes exactes avant même que les sbires n’apparaissent.',
    targetTab: 'builds',
    targetLabel: 'Ouvrir Builds & Match-ups',
    steps: [
      {
        title: 'Choisir votre champion & les 5 adversaires (dont les 5 cibles du simulateur)',
        detail:
          'Sélectionnez votre champion parmi les 8 catégories (dont Junglers). En bas dans le Simulateur d’impact, cliquez sur l’icône crayon de n’importe laquelle des 5 cibles ennemies pour la remplacer par le champion exact de votre choix.',
      },
      {
        title: 'Noter vos astuces dans le Carnet de mémos & voir les Contre-picks',
        detail:
          'Utilisez le champ « Mémo de duel » pour noter un réflexe précis (ex. « Respecter le niveau 2 »), cliquez sur « Enregistrer », et ouvrez « Mes mémos » à tout moment pour modifier, filtrer ou supprimer vos notes.',
      },
      {
        title: 'Comparer les builds, les runes et tester les passifs avec (i)',
        detail:
          'Lancez « Recherche de Builds » (U.GG / OP.GG), choisissez votre scénario (Équilibré / Retard / Snowball), puis cliquez sur (i) « Passif IA » à côté d’un objet pour connaître son impact réel.',
      },
    ],
    checklist: [
      { id: 'before-comp', label: 'Renseigner mon champion + les 5 ennemis (ou modifier une cible via le crayon)' },
      { id: 'before-memo', label: 'Créer ou relire un mémo dans « Mes mémos » de duel' },
      { id: 'before-popular', label: 'Consulter les items U.GG / OP.GG et la page de runes' },
      { id: 'before-combo', label: 'Comparer les 4 builds du Calculateur Multi-Combinaisons' },
      { id: 'before-passive', label: 'Cliquer sur (i) « Passif IA » pour vérifier un passif clé' },
    ],
    proNote:
      'Vos mémos de duel enregistrés sont automatiquement injectés dans votre Plan Tactique IA et retrouvables en 2 secondes via Ctrl+K (ou ⌘K sur Mac).',
  },
  {
    id: 'during',
    stepNumber: '02',
    title: 'Pendant la partie (Zone isolée Coach Temps Réel)',
    subtitle: 'Un espace vert dédié uniquement au jeu en direct, avec télémétrie live, bouton « Analyser » vocal Web Speech et micro.',
    targetTab: 'live',
    targetLabel: 'Ouvrir Coach Temps Réel',
    steps: [
      {
        title: 'Cliquer sur « Analyser » pour entendre la synthèse vocale rapide (Web Speech)',
        detail:
          'En pleine partie, cliquez sur le bouton « Analyser » : le coach calcule votre priorité immédiate, la fenêtre de rappel et le danger principal, puis lit les points clés à voix haute grâce à l’API Web Speech (désactivable ou réécoutable en 1 clic).',
      },
      {
        title: 'Détecter les moments clés au micro (Dragon, Baron, Gank)',
        detail:
          'Activez « Activer l’écoute micro » (ou « Extrait Audio Gemini ») : dès que vous prononcez « Dragon », « Baron Nashor », « Gank imminent » ou « Plus de flash », le coach déclenche une alerte visuelle et/ou vocale instantanée.',
      },
      {
        title: 'Déplier la connexion Live (Spectator-V5 ou Pont Windows) si besoin',
        detail:
          'La zone technique de connexion (Spectator-V5 / Pont Windows 127.0.0.1:2999) est repliable tout en bas pour laisser votre télémétrie KDA, CS, Or et timers Dragon/Baron bien en vue pendant le match.',
      },
    ],
    checklist: [
      { id: 'during-checklist', label: 'Relire mes 3 règles de Checklist Entraînement avant de jouer' },
      { id: 'during-call', label: 'Cliquer sur « Analyser » pour tester la synthèse vocale Web Speech' },
      { id: 'during-mic', label: 'Tester la détection micro ou un déclencheur (« Dragon », « Gank »)' },
      { id: 'during-timers', label: 'Repérer l’or en poche et les timers Dragon/Baron en haut du live' },
      { id: 'during-detect', label: 'Vérifier la détection Spectator-V5 ou le Pont Windows si nécessaire' },
    ],
    proNote:
      'La section « En Partie · Temps Réel » est volontairement isolée tout en haut du menu gauche : vous ne risquez jamais de vous perdre dans les stats Post-Game au milieu d’un teamfight.',
  },
  {
    id: 'after',
    stepNumber: '03',
    title: 'Après la partie (Analyse Post-Game & Export)',
    subtitle: 'Comprenez chaque mort sur la carte, suivez votre courbe de forme et exportez vos données hors-ligne.',
    targetTab: 'postgame',
    targetLabel: 'Ouvrir Analyse Post-Game',
    steps: [
      {
        title: 'Filtrer l’historique & vérifier la validation du Programme',
        detail:
          'Filtrez vos parties par Victoire/Défaite, Rôle ou Champion. Le bandeau « Validation du Programme d’Entraînement » indique instantanément quels objectifs (Survie, Rythme, Macro) sont réussis.',
      },
      {
        title: 'Inspecter la Carte Tactique, la courbe & lancer le débriefing IA',
        detail:
          'Ouvrez « Carte Tactique & Morts » en grand format (22 tours, 34 buissons, 10 champions) et parcourez le graphique d’évolution multi-matchs pour comprendre chaque tournant du match.',
      },
      {
        title: 'Exporter les 10 dernières parties en CSV ou JSON',
        detail:
          'Utilisez les boutons « Exporter (10) · CSV / JSON » dans Analyse Post-Game (ou en bas du Tableau de bord) pour ouvrir vos KDA, CS/min, dégâts et vision dans Excel ou votre propre outil hors-ligne.',
      },
    ],
    checklist: [
      { id: 'after-goals', label: 'Vérifier mes objectifs validés (Survie, Rythme, Macro) sur le match' },
      { id: 'after-trend', label: 'Tester le graphique d’évolution (10 ou 15 parties) sur mon champion' },
      { id: 'after-map', label: 'Inspecter une mort dans « Carte Tactique & Morts »' },
      { id: 'after-export', label: 'Tester l’export CSV ou JSON des 10 dernières parties' },
    ],
    proNote:
      'Dans « Carte Tactique & Morts », utilisez les flèches ← et → du clavier pour enchaîner vos morts dans l’ordre chronologique sans lâcher les yeux de la carte.',
  },
  {
    id: 'career',
    stepNumber: '04',
    title: 'Progrès quotidiens, Compte & Famille',
    subtitle: 'Recevez un conseil du jour sur mesure, suivez votre Score de Forme et gérez votre compte en 1 clic.',
    targetTab: 'dashboard',
    targetLabel: 'Ouvrir Tableau de bord',
    steps: [
      {
        title: 'Consulter le Conseil Tactique Contextuel & le Score de Forme',
        detail:
          'Chaque jour, une astuce ciblée issue de votre Synthèse Globale IA apparaît en haut du Dashboard. Passez le Programme d’Entraînement en mode « Standard » ou « Exigeant » et cliquez sur les pastilles (✓ / ×) pour revoir un match précis.',
      },
      {
        title: 'Basculer de compte en 1 clic depuis le menu en haut à droite',
        detail:
          'Plus besoin de quitter votre page : cliquez sur votre Pseudo#TAG en haut à droite pour changer de profil Famille/Amis, modifier votre Riot ID ou activer Auto-sync et le thème clair/sombre instantanément.',
      },
      {
        title: 'Configurer votre moteur IA & vos services dans Compte & Réglages',
        detail:
          'La page « Compte & Réglages » est organisée en 3 onglets clairs (« Compte & Famille », « Moteur IA », « Services & PC ») pour éviter de mélanger vos comptes Riot avec les lanceurs Windows/Mac.',
      },
    ],
    checklist: [
      { id: 'career-daily', label: 'Valider mon « Conseil Tactique du jour » sur le Dashboard' },
      { id: 'career-cmd', label: 'Tester la recherche rapide Ctrl+K ou le menu Compte en haut à droite' },
      { id: 'career-synth', label: 'Générer ma Synthèse Globale IA sur mes matchs archivés' },
      { id: 'career-family', label: 'Explorer les 3 onglets de « Compte & Réglages »' },
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
    id: 'contextual-advice',
    category: 'ai',
    title: 'Conseil Tactique Contextuel (Astuce du jour) & Boutons (i)',
    where: 'Tableau de bord → Tout en haut sous le profil',
    summary:
      'Croise votre Synthèse Globale IA et vos statistiques par classe de champion pour afficher chaque jour une priorité claire (ex. vision en mid-game sur les initiateurs). Chaque titre du Dashboard dispose aussi d’une icône (i) explicative.',
    howToUse:
      'Lisez l’astuce du jour dès l’ouverture, naviguez entre les conseils avec < >, cliquez sur « Appliquer aujourd’hui » pour verrouiller votre focus ou cliquez sur « Optimiser [Champion] ».',
    targetTab: 'dashboard',
    keywords: 'conseil tactique contextuel astuce jour synthese ia info bulle aide',
  },
  {
    id: 'voice-mic-coach',
    category: 'live',
    title: 'Bouton « Analyser » Web Speech & Coach Vocal au Micro',
    where: 'Coach Temps Réel → Analyse instantanée & Micro',
    summary:
      'Cliquer sur « Analyser » génère vos 3 priorités live et les lit immédiatement à voix haute via l’API Web Speech (réécoutable en 1 clic). Le micro détecte aussi vos appels (« Dragon », « Baron », « Gank imminent », « Plus de flash »).',
    howToUse:
      'En partie, cliquez sur « Analyser » (activez « Synthèse vocale auto » si souhaité) pour entendre les points clés sans quitter le jeu des yeux, ou activez le micro pour détecter vos annonces vocales.',
    targetTab: 'live',
    keywords: 'micro microphone voix vocal web speech analyser synthese audio gemini dragon baron gank flash live',
  },
  {
    id: 'lobby-scout-spells',
    category: 'live',
    title: 'Scouting de Lobby (style Porofessor) & Chrono Sorts d’Invocateur',
    where: 'Coach Temps Réel → Panneau Connexion Live & Barre Sorts Adverses',
    summary:
      'En partie détectée par Spectator-V5, cliquez sur « Scanner le lobby (Rangs & Maîtrises) » pour afficher le rang, le winrate, la maîtrise sur le champion joué et les tags tactiques (Main, En série) des 10 joueurs, plus des chronomètres en 1 clic pour Flash (300s), TP (360s) et sorts adverses.',
    howToUse:
      'Pendant la partie, cliquez sur « Scanner le lobby » pour repérer les joueurs les plus dangereux, puis cliquez sur « Flash » ou « TP » sous un ennemi dès qu’il dépense son sort.',
    targetTab: 'live',
    keywords: 'porofessor lobby scout rang maitrise hot streak flash tp teleportation sort invocateur timer live',
  },
  {
    id: 'gpi-radar-duo',
    category: 'ai',
    title: 'Profil de Performance 5 Axes (GPI) & Synergie Coéquipiers / Famille',
    where: 'Tableau de bord → Sous les 4 indicateurs principaux',
    summary:
      'Calcule un radar à 5 axes (Combat & Part de dégâts, Farm, Vision, Survie, Objectifs) comparé aux cibles de votre rôle, affiche vos Défis officiels Riot (Challenges-V1) et détecte automatiquement vos partenaires de jeu réguliers (ex. parties en duo familial).',
    howToUse:
      'Repérez votre « Point fort » et votre « Axe prioritaire » sur le radar, puis consultez le tableau de droite pour voir votre taux de victoire avec vos coéquipiers fréquents.',
    targetTab: 'dashboard',
    keywords: 'gpi mobalytics radar performance 5 axes combat farm vision survie objectifs duo famille coequipier challenges',
  },
  {
    id: 'training-program',
    category: 'live',
    title: 'Programme d’Entraînement Actif, Score de Forme & Notifications Toast',
    where: 'Dashboard · Analyse Post-Game · Coach Live',
    summary:
      'Calcule votre Score de Forme (/100) et suit 3 objectifs adaptés à votre rôle (Survie, Rythme/Vision, Macro) en mode Standard ou Exigeant. Des notifications animées vous avertissent en bas à droite dès qu’une nouvelle analyse est prête ou qu’un objectif est atteint.',
    howToUse:
      'Dans le Dashboard, choisissez Standard ou Exigeant et cliquez sur une pastille (✓ / ×) pour inspecter le match concerné. En Post-Game et en Coach Live, vos mêmes objectifs sont vérifiés automatiquement.',
    targetTab: 'dashboard',
    keywords: 'programme entrainement score forme objectif standard exigeant notification toast alerte',
  },
  {
    id: 'postgame-trend',
    category: 'live',
    title: 'Courbe d’Évolution & Export CSV / JSON (10 dernières parties)',
    where: 'Analyse Post-Game → Barre du haut & Sous la carte tactique',
    summary:
      'Visualise votre progression courbe par courbe (KDA, Or/min, Vision) sur 5 à 20+ matchs, et permet d’exporter instantanément les statistiques des 10 dernières parties en CSV (Excel) ou JSON pour analyse hors-ligne.',
    howToUse:
      'Sélectionnez la plage de parties puis cliquez sur un point pour ouvrir ce match, ou utilisez les boutons « Exporter (10) · CSV / JSON » dans Analyse Post-Game ou en bas du Tableau de bord.',
    targetTab: 'postgame',
    keywords: 'graphique evolution tendance kda or vision 10 parties export csv json excel hors-ligne',
  },
  {
    id: 'command-palette',
    category: 'account',
    title: 'Palette de Commande Universelle (Ctrl+K / ⌘K)',
    where: 'Barre supérieure → Bouton Rechercher ⌘K (partout dans l’app)',
    summary:
      'Permet de sauter en 1 seconde vers un onglet, un champion (Build ou Fiche Encyclopédie), une partie archivée, un mémo de duel ou le mode clair/sombre sans toucher à la souris.',
    howToUse:
      'Appuyez sur Ctrl+K (Windows) ou ⌘K (Mac), tapez quelques lettres (ex. « Sona », « Leona », « Post-Game »), naviguez avec ↑ / ↓ et validez avec Entrée.',
    targetTab: 'dashboard',
    keywords: 'ctrl k cmd palette commande recherche rapide raccourci clavier navigation',
  },
  {
    id: 'multi-combo',
    category: 'builds',
    title: 'Carnet de Mémos complet, Contre-picks & Multi-Combinaisons',
    where: 'Builds & Match-ups → Zone Mémo de duel & Scénarios',
    summary:
      'Propose 3 contre-picks en draft (« Suggérer des contre-picks »), offre un vrai gestionnaire de mémos (« Enregistrer » + « Mes mémos » pour éditer, corriger, filtrer et supprimer vos notes) et calcule 4 builds prêts à jouer.',
    howToUse:
      'Écrivez votre note de match-up puis cliquez sur « Enregistrer ». Ouvrez « Mes mémos » pour modifier ou supprimer d’anciens duels, ou recharger un match-up en 1 clic.',
    targetTab: 'builds',
    keywords: 'calculateur combinaisons dominé retard snowball anti soin runes conseiller pick draft memo carnet matchup editer supprimer',
  },
  {
    id: 'atelier-sandbox',
    category: 'builds',
    title: 'Atelier Équipement & Comparateur de deltas',
    where: 'Builds & Match-ups → Section Atelier',
    summary:
      'Testez librement n’importe quel objet dans vos 6 emplacements, ajustez le niveau de 1 à 18 et les charges Cœuracier, et voyez l’écart exact (vert/rouge) par rapport au build conseillé.',
    howToUse:
      'Cliquez sur un emplacement pour changer l’objet via le catalogue filtrable Data Dragon (Bottes, Éco, Armure, RM, AP, Anti-soin...).',
    targetTab: 'builds',
    keywords: 'atelier emplacement equipement stats delta coeuracier niveau',
  },
  {
    id: 'popular-builds-runes',
    category: 'builds',
    title: 'Recherche de Builds (U.GG / OP.GG) & Pages de Runes Hextech',
    where: 'Builds & Match-ups → Recherche de Builds & Section Runes',
    summary:
      'Interroge Google Search en direct sur U.GG, OP.GG et Lolalytics pour suggérer les objets populaires du patch actuel, et affiche vos runes avec le vrai design Hextech (vue compacte + arbre complet et fragments 3×3).',
    howToUse:
      'Cliquez sur « Rechercher sur le Web » pour obtenir les items méta puis appliquez-les en 1 clic dans l’Atelier. Basculez ensuite la vue des runes pour éditer chaque palier.',
    targetTab: 'builds',
    keywords: 'recherche builds google u.gg op.gg lolalytics runes hextech fragments',
  },
  {
    id: 'passive-ai',
    category: 'ai',
    title: 'Bouton (i) « Passif IA » & Simulateur sur 5 cibles modifiables',
    where: 'Builds & Match-ups → Simulateur d’impact en bas',
    summary:
      'Calcule les dégâts bruts et mitigés sur 3s/6s/10s contre 5 champions ennemis (modifiables chacun directement via l’icône crayon) et explique par IA comment un passif unique (ex. Aube et crépuscule) agit sur vos stats.',
    howToUse:
      'Cliquez sur une des 5 cibles pour simuler vos dégâts, cliquez sur son petit crayon pour la remplacer par un autre champion de la liste, ou cliquez sur (i) « Formule IA » à côté d’un objet.',
    targetTab: 'builds',
    keywords: 'aube crepuscule haut-lacere passif ia formule simulateur degats cibles modifier crayon data dragon',
  },
  {
    id: 'multi-ai-providers',
    category: 'ai',
    title: 'Multi-Fournisseurs IA & Choix du Modèle (Claude, OpenAI, Gemini, Local)',
    where: 'Compte & Réglages → Onglet Moteur IA',
    summary:
      'Permet de brancher votre abonnement ou clé préférée : Google Gemini, Claude Code (CLI Anthropic), Anthropic API, OpenAI (GPT / o-series), OpenRouter, Mistral, Groq, DeepSeek ou Ollama local.',
    howToUse:
      'Ouvrez « Compte & Réglages » puis l’onglet « Moteur IA », choisissez votre fournisseur et le modèle exact, puis cliquez sur « Tester la connexion ».',
    targetTab: 'settings',
    keywords: 'claude code anthropic openai chatgpt gemini mistral groq modele ia abonnement compte reglages',
  },
  {
    id: 'career-synthesis',
    category: 'ai',
    title: 'ADN Gameplay, Champions recommandés & Synergie Duo',
    where: 'Tableau de bord → Milieu de page',
    summary:
      'Analyse toutes vos parties archivées et vos maîtrises officielles Riot pour définir votre profil de joueur, recommander des champions adaptés, visualiser vos meilleurs duos et générer un plan IA sur 3 parties.',
    howToUse:
      'Filtrez les suggestions par rôle (Auto, Top, Jungle, Mid, ADC, Support) puis cliquez sur « Préparer le build » pour ouvrir le champion directement dans l’Optimiseur.',
    targetTab: 'dashboard',
    keywords: 'adn gameplay recommandation champions duo synergie maitrise mastery synthese globale tableau de bord',
  },
  {
    id: 'postgame-map',
    category: 'live',
    title: 'Carte Tactique, Morts & Heatmap Multi-Matchs',
    where: 'Analyse Post-Game → Vue d’ensemble ou onglet Carte Tactique & Morts',
    summary:
      'Superpose les 22 tours officielles (portée ~775), les 34 buissons calibrés 2026, les portraits des 10 champions autour de chaque mort et un calque « Heatmap » agrégeant toutes vos morts de l’archive.',
    howToUse:
      'Dans Analyse Post-Game, activez « Heatmap » pour voir vos zones les plus punitives, ou ouvrez la carte en grand format et parcourez vos morts avec ← / →.',
    targetTab: 'postgame',
    keywords: 'post-game carte tactique morts heatmap zones critiques tours portee buissons champions timeline courbes or cs',
  },
  {
    id: 'live-bridge',
    category: 'live',
    title: 'Coach Temps Réel & Pont Windows (127.0.0.1:2999)',
    where: 'Coach Temps Réel → Panneau Connexion Live',
    summary:
      'Relie l’application à votre client League of Legends en cours de partie pour lire vos stats en direct, même en mode Entraînement.',
    howToUse:
      'Utilisez la détection Spectator-V5 en partie classique, ou téléchargez le script Windows (.bat) depuis le panneau Live pour envoyer le flux local.',
    targetTab: 'live',
    keywords: 'live temps reel pont windows 2999 spectator',
  },
  {
    id: 'encyclopedia',
    category: 'builds',
    title: 'Encyclopédie Champions (8 catégories dont Junglers) & Stats Niv. 1–18',
    where: 'Champions',
    summary:
      'Consultez la fiche officielle Data Dragon de tous les champions avec 8 catégories sur une ligne (dont Junglers), filtre physique/magique, tri par portée/difficulté, « Joués récemment » et stats niveau 1–18.',
    howToUse:
      'Cliquez sur un champion puis sur « Optimiser un build avec ... » pour l’ouvrir directement dans Builds & Match-ups.',
    targetTab: 'champions',
    keywords: 'champions encyclopedie junglers categories sorts passif stats niveau portee',
  },
  {
    id: 'profiles-settings',
    category: 'account',
    title: 'Menu Compte Rapide, Profils Famille & Onglets Réglages',
    where: 'Menu Compte (haut à droite) & Compte & Réglages',
    summary:
      'Changez de joueur Famille/Amis, modifiez votre Riot ID ou activez Auto-sync et le thème sombre directement depuis le menu en haut à droite, sans quitter votre écran. La page Compte & Réglages sépare Compte & Famille, Moteur IA et Services & PC.',
    howToUse:
      'Cliquez sur votre Pseudo#TAG tout en haut à droite pour basculer de profil en 1 clic, ou ouvrez « Compte & Réglages » pour ajouter un proche ou télécharger un lanceur PC.',
    targetTab: 'settings',
    keywords: 'profils famille amis comptes reglages menu rapide sync cle riot',
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
    id: 'quick-find',
    question: 'Comment retrouver vite un champion, un ancien match ou un mémo de duel ?',
    cause:
      'Avec 170+ champions, jusqu’à 45 parties archivées et vos notes personnelles, naviguer onglet par onglet peut sembler long.',
    solution:
      'Appuyez sur Ctrl+K (ou ⌘K sur Mac), ou cliquez sur « Rechercher ⌘K » tout en haut : tapez le nom d’un champion, d’un match ou d’un mémo pour sauter directement dessus.',
    targetTab: 'dashboard',
    actionLabel: 'Aller sur le Tableau de bord',
  },
  {
    id: 'memo-manage',
    question: 'Où sont enregistrés mes mémos de duel et comment les modifier ou supprimer ?',
    cause:
      'Les notes sont sauvegardées localement par paire de champions (ex. Tahm Kench vs Leona) et ne doivent pas se perdre entre deux parties.',
    solution:
      'Dans Builds & Match-ups, cliquez sur « Enregistrer » à droite du champ mémo pour sauvegarder, puis cliquez sur « Mes mémos » pour consulter, éditer, filtrer, recharger ou supprimer toutes vos notes.',
    targetTab: 'builds',
    actionLabel: 'Ouvrir Builds & Match-ups',
  },
  {
    id: 'practice-tool',
    question: 'Ma partie Outil d’entraînement ou Personnalisée n’apparaît pas dans l’historique',
    cause:
      'Par conception, l’API officielle Riot Match-V5 ne publie pas les parties d’Outil d’entraînement ni certaines parties personnalisées privées.',
    solution:
      'Ouvrez Analyse Post-Game ou Tableau de bord et utilisez l’import local LCU (/history) ou le Pont Live Windows (127.0.0.1:2999) pendant la session.',
    targetTab: 'postgame',
    actionLabel: 'Ouvrir Analyse Post-Game',
  },
  {
    id: 'dominated',
    question: 'Je me fais dominer en lane : quel équipement choisir sans perdre trop d’or ?',
    cause:
      'Un build standard « snowball » devient contre-productif si vous avez du retard en or : vous finissez vos pics trop tard et mourez avant d’exister en teamfight.',
    solution:
      'Dans Builds & Match-ups, passez sur le scénario « Je me fais dominer » ou chargez la carte « Retard / Sécurité » du Calculateur Multi-Combinaisons pour privilégier les objets défensifs économiques.',
    targetTab: 'builds',
    actionLabel: 'Tester en mode Retard / Sécurité',
  },
  {
    id: 'passive-check',
    question: 'Comment savoir si un objet à passif (ex. Aube et crépuscule) vaut vraiment le coup ?',
    cause:
      'Les statistiques brutes affichées en boutique (AP, PV, Hâte) ne montrent pas la valeur cachée des passifs uniques ni les réductions liées à l’armure/RM ennemie.',
    solution:
      'Placez l’objet dans l’Atelier, descendez au Simulateur d’impact, sélectionnez votre adversaire puis cliquez sur l’icône (i) « Formule IA » pour voir le gain réel en dégâts et en soin.',
    targetTab: 'builds',
    actionLabel: 'Ouvrir le Simulateur d’impact',
  },
  {
    id: 'death-analysis',
    question: 'Comment comprendre pourquoi je suis mort sur la carte par rapport aux ennemis ?',
    cause:
      'La vue compacte privilégie la lecture globale avec les courbes Or/CS, tandis que l’analyse tactique complète (positions des 10 champions, distances aux tours et dégâts subis) est regroupée dans une vue dédiée.',
    solution:
      'Dans Analyse Post-Game, cliquez sur « Ouvrir en grand format → » (ou sur l’onglet « Carte Tactique & Morts »). Activez les calques Tours (22), Portée, Buissons et Champions, puis parcourez vos morts avec ← et →.',
    targetTab: 'postgame',
    actionLabel: 'Ouvrir Carte Tactique & Morts',
  },
  {
    id: 'ai-provider-switch',
    question: 'Comment brancher Claude Code, Anthropic Claude ou OpenAI à la place de Gemini ?',
    cause:
      'Par défaut, l’application démarre sur Google Gemini, mais vous pouvez piloter les analyses avec votre propre abonnement ou clé (Claude Code en local, Anthropic API, OpenAI, Mistral, Groq, etc.).',
    solution:
      'Ouvrez Compte & Réglages → onglet « Moteur IA », sélectionnez votre fournisseur et le modèle souhaité, puis cliquez sur « Tester la connexion ». En ligne (Cloud), utilisez une clé API via Settings > Secrets ; en local sur votre PC, `claude login` connecte votre abonnement Claude Code.',
    targetTab: 'settings',
    actionLabel: 'Configurer mon fournisseur IA',
  },
  {
    id: 'live-voice-analyser',
    question: 'Comment entendre la synthèse vocale rapide Web Speech pendant ma partie ?',
    cause:
      'En pleine partie, lire un pavé de texte fait perdre du temps sur la mini-carte : le module Coach Temps Réel permet d’écouter les 3 points clés directement via l’API Web Speech du navigateur.',
    solution:
      'Allez dans la zone verte « En Partie · Coach Temps Réel », cliquez sur « Analyser » : la priorité immédiate, la fenêtre de rappel et le danger ennemi sont lus à voix haute (avec bouton « Réécouter » et interrupteur « Synthèse vocale auto »).',
    targetTab: 'live',
    actionLabel: 'Tester dans Coach Temps Réel',
  },
  {
    id: 'api-key-personal',
    question: 'Ma nouvelle clé API Riot définitive fonctionne-t-elle sans limite de 24h ?',
    cause:
      'Contrairement à une clé de développement temporaire (valable 24h), votre application approuvée « LOL AI COACH » (Personal API Key) n’expire plus chaque jour.',
    solution:
      'Si vous venez de la mettre à jour dans Settings > Secrets, cliquez simplement sur « Synchroniser » en haut à droite (ou vérifiez le voyant dans Compte & Réglages → Services & PC). Ne diffusez jamais une capture où votre clé RGAPI apparaît en clair.',
    targetTab: 'settings',
    actionLabel: 'Vérifier l’état des services',
  },
  {
    id: 'share-family-repo',
    question: 'Pour partager avec mon fils : doit-il cloner le repo GitHub et créer sa propre clé Riot ?',
    cause:
      'Si vous lui partagez le lien web de votre app hébergée, votre clé serveur permanente suffit déjà pour vous deux ! En revanche, s’il clone le repo GitHub sur son PC, le fichier .env (contenant votre clé) est volontairement exclu de GitHub par sécurité.',
    solution:
      'Suivez l’assistant Onboarding juste au-dessus : choisissez « Partager votre lien web » (0 installation, 0 clé à créer pour lui) ou « Cloner le repo sur son PC » (avec téléchargement de l’assistant double-clic Windows/Mac).',
    targetTab: 'settings',
    actionLabel: 'Ouvrir Compte & Réglages',
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
    name: 'LEAGUE-V4 (Solo/Duo)',
    endpoint: 'entries/by-puuid',
    status: 'active',
    usage: 'Rang actuel, LP, victoires et défaites en Classée Solo/Duo',
    benefitForYou: 'Affiche votre progression classée directement sur le Tableau de bord.',
  },
  {
    name: 'MATCH-V5 (+ Timeline)',
    endpoint: 'matches/by-puuid · /timeline',
    status: 'active',
    usage: 'Historique détaillé, positions des 10 champions par frame, dégâts subis & courbes CS/Or',
    benefitForYou: 'Alimente la Carte Tactique & Morts (grand format), les courbes Post-Game et votre Synthèse Globale.',
  },
  {
    name: 'SPECTATOR-V5',
    endpoint: 'active-games/by-summoner',
    status: 'active',
    usage: 'Détection automatique d’une partie en cours et des 10 champions',
    benefitForYou: 'Pré-remplit votre match-up dans l’Optimiseur et le Coach Temps Réel.',
  },
  {
    name: 'CHAMPION-MASTERY-V4',
    endpoint: 'champion-masteries/by-puuid/top',
    status: 'active',
    usage: 'Top 12 maîtrises officielles (niveaux et points par champion)',
    benefitForYou:
      'Met en avant vos champions historiques et pépites oubliées directement dans « Champions recommandés » sur le Tableau de bord.',
  },
  {
    name: 'CHAMPION-V3 (Rotation gratuite)',
    endpoint: 'platform/v3/champion-rotations',
    status: 'active',
    usage: 'Champions gratuits de la semaine intégrés dans l’Encyclopédie',
    benefitForYou:
      'Affiche directement quels champions sont gratuits cette semaine pour vos tests ou pour vos enfants.',
  },
  {
    name: 'LEAGUE-V4 (Solo/Duo & File Flexible)',
    endpoint: 'entries/by-puuid (RANKED_SOLO_5x5 & RANKED_FLEX_SR)',
    status: 'active',
    usage: 'Rang, LP, Winrate et séries en Solo/Duo et en Flex + Scouting de lobby',
    benefitForYou:
      'Affiche vos deux rangs sur le Tableau de bord et permet le scan des 10 joueurs en partie Live.',
  },
  {
    name: 'CHALLENGES-V1 & LOL-STATUS-V4',
    endpoint: 'challenges/v1/player-data · status/v4/platform-data',
    status: 'active',
    usage: 'Palier de cristal des Défis Riot & surveillance en direct des incidents serveur',
    benefitForYou:
      'Affiche vos points/paliers de Défis et vous prévient immédiatement en cas de panne ou maintenance EUW1.',
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
  const [selectedIssueId, setSelectedIssueId] = useState<string>('quick-find');
  const [apiFilter, setApiFilter] = useState<ApiFilter>('all');
  const [showApiDetails, setShowApiDetails] = useState(false);
  const [expandedFeatureIds, setExpandedFeatureIds] = useState<Record<string, boolean>>({
    'contextual-advice': true,
    'training-program': true,
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
              <span>Guide interactif · Prise en main pas à pas</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              Comment utiliser LoL AI Coach sans jamais vous perdre
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
              Suivez le parcours en 4 moments clés (avant, pendant, après la partie et sur la durée),
              cochez vos étapes acquises et sautez en 1 clic vers le bon outil.
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

        {/* Cartes de statut réel (Riot API, Gemini, Data Dragon, Mémoire) */}
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

        {/* Démarrage Express en 60 secondes (ultra-lisible pour aller à l'essentiel) */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <span>Démarrage Express en 60 secondes — Votre routine en 3 réflexes</span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Astuce : cliquez sur les icônes <strong className="text-slate-700 dark:text-slate-200">(i)</strong> du Dashboard si vous avez un doute.
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
                  1. À l’ouverture
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Lisez votre <strong>Conseil Tactique du jour</strong> et vos 3 objectifs du <strong>Score de Forme</strong> avant de lancer la file.
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
                  2. En sélection (Draft)
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Relisez votre <strong>Mémo de duel</strong>, regardez les contre-picks et choisissez votre scénario (Équilibré / Retard / Snowball).
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('postgame')}
              className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-3.5 hover:border-amber-500/50 transition-colors space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <span className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-hidden="true" />
                  3. Après la partie
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Cliquez sur la <strong>notification toast</strong> en bas à droite pour inspecter vos morts sur la carte et votre courbe d’évolution.
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
            <span className="inline-flex items-center gap-1">
              <Bell className="w-3 h-3 text-sky-500" aria-hidden="true" />
              Toasts automatiques : alertes Post-Game &amp; objectifs validés
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
              Tapez un mot-clé (ex. « memo », « toast », « ctrl k », « évolution », « U.GG », « buissons ») pour trouver immédiatement l’outil.
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
            { id: 'builds', label: 'Builds, Runes & Champions' },
            { id: 'ai', label: 'Analyse & Moteurs IA' },
            { id: 'live', label: 'Live, Carte & Post-Game' },
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
            Aucun outil ne correspond à « {searchQuery} ». Essayez « builds », « passif », « live » ou « famille ».
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

      {/* 5. État technique & Services Riot API (dépliable pour garder le guide léger) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-500" aria-hidden="true" />
              <span>4. Connexions Riot API &amp; Raccourcis vers les écrans</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Votre clé personnelle Riot reste sécurisée côté serveur. Ouvrez les détails techniques uniquement si vous souhaitez voir les flux utilisés.
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
              {showApiDetails ? 'Masquer les détails techniques' : 'Voir les flux Riot API (technique)'}
            </span>
          </button>
        </div>

        {showApiDetails && (
          <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Filtrer les services Riot connectés ou envisageables :
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
                    <th className="py-2.5 px-3 text-left font-medium">API Riot</th>
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

        {/* Raccourcis rapides vers les écrans */}
        <div className="flex flex-wrap gap-2.5 pt-1">
          {[
            { tab: 'dashboard' as GuideTargetTab, label: 'Tableau de bord', icon: LayoutDashboard },
            { tab: 'builds' as GuideTargetTab, label: 'Builds & Match-ups', icon: Swords },
            { tab: 'postgame' as GuideTargetTab, label: 'Analyse Post-Game', icon: History },
            { tab: 'live' as GuideTargetTab, label: 'Coach Temps Réel', icon: Activity },
            { tab: 'champions' as GuideTargetTab, label: 'Champions', icon: BookOpen },
            { tab: 'settings' as GuideTargetTab, label: 'Compte & Réglages', icon: Settings },
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
