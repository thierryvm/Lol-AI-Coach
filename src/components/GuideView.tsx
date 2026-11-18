import {
  Activity,
  ArrowRight,
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
  LayoutDashboard,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Swords,
  Users,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getProviderDefinition, loadSavedAiSelection } from '../engines/aiConfig.ts';
import type { RiotPlatform } from '../engines/types.ts';

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
        title: 'Choisir votre champion (8 rôles dont Junglers) & les 5 adversaires',
        detail:
          'Sélectionnez votre champion parmi les 8 catégories (Tous, Combattants, Mages, Assassins, Tanks, Tireurs, Supports, Junglers) ou cliquez sur vos « Joués récemment ». En partie lancée, « Détecter partie en cours » pré-remplit les 10 champions.',
      },
      {
        title: 'Comparer Recherche de Builds (U.GG / OP.GG) & Multi-Combinaisons',
        detail:
          'Lancez « Recherche de Builds » pour voir les objets populaires du moment (U.GG / OP.GG), puis choisissez le scénario adapté (Équilibré / Je me fais dominer / En avance) et ajustez vos vraies pages de runes visuelles.',
      },
      {
        title: 'Tester dans l’Atelier & inspecter les passifs avec le bouton (i)',
        detail:
          'Modifiez librement les 6 emplacements, ajustez le niveau (1 à 18) ou les PV Cœuracier, puis cliquez sur l’icône (i) « Passif IA » à côté d’un objet (ex. Aube de Haut-Lacère) pour voir sa formule mathématique exacte sur votre cible.',
      },
    ],
    checklist: [
      { id: 'before-comp', label: 'Renseigner mon champion + les 5 ennemis (ou preset rapide)' },
      { id: 'before-popular', label: 'Consulter les items populaires U.GG / OP.GG et la page de runes' },
      { id: 'before-combo', label: 'Comparer les 4 builds du Calculateur Multi-Combinaisons' },
      { id: 'before-passive', label: 'Cliquer sur (i) « Passif IA » pour vérifier un passif clé' },
    ],
    proNote:
      'Dans les pages de runes, basculez entre la vue compacte et la grille complète style client LoL pour éditer en 1 clic votre rune fondamentale, vos 2 arbres et les 3 rangées de fragments.',
  },
  {
    id: 'during',
    stepNumber: '02',
    title: 'Pendant la partie (Coach Temps Réel)',
    subtitle: 'Gardez un œil sur les menaces adverses et recevez des appels macro adaptés à la minute.',
    targetTab: 'live',
    targetLabel: 'Ouvrir Coach Temps Réel',
    steps: [
      {
        title: 'Connexion automatique ou Pont Windows local',
        detail:
          'En partie normale/classée/ARAM, Spectator-V5 détecte votre match. Pour avoir l’or, le CS, les objets et les stats seconde par seconde (même en Outil d’entraînement), utilisez le petit script Pont Live Windows (127.0.0.1:2999).',
      },
      {
        title: 'Surveiller la menace adverse et les rappels d’objectifs',
        detail:
          'L’écran synthétise la répartition Physique/Magique ennemie, les timers Dragon/Héraut/Nashor et vos écarts de rythme sans bruit inutile.',
      },
      {
        title: 'Demander un appel tactique Gemini en 1 clic',
        detail:
          'Cliquez sur le bouton de conseil IA pour obtenir une consigne courte et actionnable selon votre état de partie (jouer le peel, split, ou forcer un objectif).',
      },
    ],
    checklist: [
      { id: 'during-detect', label: 'Vérifier la détection Spectator-V5 ou lancer le Pont Windows' },
      { id: 'during-timers', label: 'Repérer la répartition de dégâts ennemie pour adapter mon prochain objet' },
      { id: 'during-call', label: 'Générer un conseil tactique en direct' },
    ],
    proNote:
      'En mode Simulation ou avec le Pont Windows, vous pouvez ajuster vos objets en direct si vous êtes derrière en or pour éviter de vous enfermer dans un build trop cher.',
  },
  {
    id: 'after',
    stepNumber: '03',
    title: 'Après la partie (Analyse Post-Game)',
    subtitle: 'Transformez chaque partie terminée en plan d’entraînement visuel et chiffré.',
    targetTab: 'postgame',
    targetLabel: 'Ouvrir Analyse Post-Game',
    steps: [
      {
        title: 'Sélectionner un match ou importer une partie personnalisée',
        detail:
          'Vos parties classées/normales/ARAM arrivent automatiquement. Pour l’Outil d’entraînement ou les parties privées (non exposées par Match-V5), utilisez l’import local LCU (/history) ou un Match ID.',
      },
      {
        title: 'Inspecter la Carte Tactique & Morts (22 tours, 34 buissons, 10 champions)',
        detail:
          'Cliquez sur « Ouvrir en grand format → » (ou l’onglet Carte Tactique & Morts) pour afficher les 22 tours avec leur portée, les 34 buissons calibrés 2026, le portrait réel de votre champion et des 9 autres joueurs, les flèches d’approche et la répartition des dégâts subis.',
      },
      {
        title: 'Lancer le débriefing IA sur le match',
        detail:
          'Votre assistant IA actif (Gemini, Claude ou OpenAI) croise vos temps morts, votre vision et votre équipement final pour pointer 2 à 3 actions simples à corriger dès la partie suivante.',
      },
    ],
    checklist: [
      { id: 'after-map', label: 'Inspecter une mort dans « Carte Tactique & Morts » (tours, buissons, dégâts)' },
      { id: 'after-timeline', label: 'Comparer ma courbe d’or/CS face à mon vis-à-vis' },
      { id: 'after-ai', label: 'Lire la synthèse Post-Game IA' },
    ],
    proNote:
      'Dans « Carte Tactique & Morts », utilisez les flèches ← et → pour enchaîner vos morts dans l’ordre et repérer les zones où vous mourez sans allié proche.',
  },
  {
    id: 'career',
    stepNumber: '04',
    title: 'Long terme, Multi-IA & Famille',
    subtitle: 'Suivez la progression multi-matchs, choisissez votre moteur IA préféré et gérez plusieurs comptes.',
    targetTab: 'dashboard',
    targetLabel: 'Ouvrir Tableau de bord',
    steps: [
      {
        title: 'Cumuler les matchs dans l’archive locale & Synthèse Globale IA',
        detail:
          'Chaque synchronisation enrichit automatiquement votre archive (jusqu’à 45 parties conservées par compte). La Synthèse Globale analyse vos tendances sur toute la durée : placements, CS/min et plan d’action sur 3 parties.',
      },
      {
        title: 'Connecter votre abonnement IA favori & choisir le modèle',
        detail:
          'Dans Paramètres, sélectionnez Gemini, Claude Code (abonnement Anthropic), Anthropic API, OpenAI (GPT / o-series), OpenRouter, Mistral, Groq ou un modèle local, puis choisissez le modèle précis à utiliser.',
      },
      {
        title: 'Basculer entre les comptes Famille & Amis',
        detail:
          'Ajoutez les Riot ID de vos enfants ou amis dans Paramètres : le menu déroulant en haut de page permet ensuite de changer de joueur en 1 clic sans jamais retoucher aux clés API.',
      },
    ],
    checklist: [
      { id: 'career-sync', label: 'Synchroniser mon Riot ID avec la clé API définitive' },
      { id: 'career-synth', label: 'Lancer la Synthèse Globale IA sur mes matchs archivés' },
      { id: 'career-ai', label: 'Vérifier mon fournisseur et modèle IA actif dans Paramètres' },
      { id: 'career-family', label: 'Ajouter au moins un profil secondaire dans Paramètres' },
    ],
    proNote:
      'L’Encyclopédie Champions affiche désormais 8 catégories (avec Junglers) sur une ligne épurée, le filtre par type de dégâts et les stats exactes niveau par niveau.',
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
    id: 'multi-combo',
    category: 'builds',
    title: 'Calculateur Multi-Combinaisons, Conseiller Draft & Carnet Match-ups',
    where: 'Builds & Match-ups → En-tête Match-up & Milieu de page',
    summary:
      'Suggère 3 contre-picks adaptés à votre rôle et à la composition ennemie (« Conseiller mon pick »), sauvegarde vos mémos personnels par duo de lane et calcule 4 builds prêts à jouer (Équilibré, Retard, Snowball, Anti-Comp).',
    howToUse:
      'Notez vos réflexes de lane dans le Mémo en haut, cliquez sur « Conseiller mon pick » en draft, ou cliquez sur « Charger ce build + runes » sur l’un des 4 scénarios.',
    targetTab: 'builds',
    keywords: 'calculateur combinaisons dominé retard snowball anti soin runes conseiller pick draft memo carnet matchup',
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
    title: 'Bouton (i) « Passif IA » & Simulateur d’impact en temps réel',
    where: 'Builds & Match-ups → Icône (i) à côté des objets + Simulateur en bas',
    summary:
      'Calcule les dégâts bruts et mitigés contre un ennemi réel sur une durée d’échange (3s/6s/10s) et explique par IA comment un passif unique (ex. Aube de Haut-Lacère / Aube et crépuscule) modifie vos formules.',
    howToUse:
      'Cliquez sur (i) à côté d’un objet ou « Formule IA » dans l’inspecteur Data Dragon pour obtenir les équations chiffrées sur votre build et cible actuels.',
    targetTab: 'builds',
    keywords: 'aube crepuscule haut-lacere passif ia formule simulateur degats data dragon',
  },
  {
    id: 'multi-ai-providers',
    category: 'ai',
    title: 'Multi-Fournisseurs IA & Choix du Modèle (Claude, OpenAI, Gemini, Local)',
    where: 'Paramètres → Fournisseur IA, Abonnements & Choix du Modèle',
    summary:
      'Permet de brancher votre abonnement ou clé préférée : Google Gemini, Claude Code (CLI Anthropic), Anthropic Claude API, OpenAI (GPT / o-series), OpenRouter, Mistral, Groq, DeepSeek ou Ollama local.',
    howToUse:
      'Choisissez votre fournisseur et le modèle exact dans Paramètres, puis cliquez sur « Tester la connexion ». Ce modèle pilote alors toutes les analyses de l’application.',
    targetTab: 'settings',
    keywords: 'claude code anthropic openai chatgpt gemini mistral groq modele ia abonnement parametres',
  },
  {
    id: 'career-synthesis',
    category: 'ai',
    title: 'ADN Gameplay, Champions recommandés & Synthèse Globale',
    where: 'Tableau de bord → Juste sous les 4 KPIs principaux',
    summary:
      'Analyse toutes vos parties archivées et vos maîtrises officielles Riot (CHAMPION-MASTERY-V4) pour définir votre profil de joueur, recommander des champions ou pépites oubliées, puis générer un plan IA sur 3 parties.',
    howToUse:
      'Filtrez les suggestions par rôle (Auto, Top, Jungle, Mid, ADC, Support) puis cliquez sur « Préparer le build » pour ouvrir le champion directement dans l’Optimiseur.',
    targetTab: 'dashboard',
    keywords: 'adn gameplay recommandation champions nouveau champion decouvrir maitrise mastery synthese globale tableau de bord',
  },
  {
    id: 'postgame-map',
    category: 'live',
    title: 'Carte Tactique, Morts & Heatmap Multi-Matchs',
    where: 'Analyse Post-Game → Vue d’ensemble ou onglet Carte Tactique & Morts',
    summary:
      'Superpose les 22 tours officielles (portée ~775), les 34 buissons calibrés 2026, les portraits des champions autour de chaque mort et un calque « Heatmap » agrégeant toutes vos morts de l’archive pour repérer vos zones critiques récurrentes.',
    howToUse:
      'Dans Analyse Post-Game, activez « Heatmap » pour voir vos zones les plus punitives sur l’ensemble de vos matchs, ou ouvrez la carte en grand format et parcourez vos morts avec ← / →.',
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
    title: 'Profils Famille & Amis + Auto-Synchronisation',
    where: 'Paramètres & Barre supérieure',
    summary:
      'Enregistrez plusieurs comptes Riot (les vôtres, vos enfants, vos amis) avec chacun leur archive isolée, et activez la synchro silencieuse toutes les 5 minutes.',
    howToUse:
      'Ajoutez un compte dans Paramètres, puis basculez à tout moment via la liste déroulante en haut de l’écran.',
    targetTab: 'settings',
    keywords: 'profils famille amis comptes parametres sync cle riot',
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
      'Allez dans Paramètres → Fournisseur IA, Abonnements & Choix du Modèle, sélectionnez votre fournisseur et le modèle souhaité, puis cliquez sur « Tester la connexion ». En ligne (Cloud), utilisez une clé API via Settings > Secrets ; en local sur votre PC, `claude login` connecte votre abonnement Claude Code.',
    targetTab: 'settings',
    actionLabel: 'Configurer mon fournisseur IA',
  },
  {
    id: 'api-key-personal',
    question: 'Ma nouvelle clé API Riot définitive fonctionne-t-elle sans limite de 24h ?',
    cause:
      'Contrairement à une clé de développement temporaire (valable 24h), votre application approuvée « LOL AI COACH » (Personal API Key) n’expire plus chaque jour.',
    solution:
      'Si vous venez de la mettre à jour dans Settings > Secrets, cliquez simplement sur « Synchroniser » en haut à droite (ou vérifiez le voyant vert ci-dessus). Pensez simplement à ne jamais diffuser de capture où votre clé RGAPI apparaît en clair.',
    targetTab: 'settings',
    actionLabel: 'Vérifier l’état des services',
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
    status: 'opportunity',
    usage: 'Non encore branché · Champions gratuits de la semaine',
    benefitForYou:
      'Très pratique dans l’Encyclopédie pour repérer en 1 coup d’œil les champions gratuits pour vos enfants.',
  },
  {
    name: 'LEAGUE-V4 (File Flexible)',
    endpoint: 'RANKED_FLEX_SR',
    status: 'opportunity',
    usage: 'Actuellement centré sur Solo/Duo uniquement',
    benefitForYou:
      'Permettrait d’afficher votre rang en équipe/Flex quand vous jouez à 3 ou 5 en famille.',
  },
  {
    name: 'LOL-STATUS-V4 & CHALLENGES-V1',
    endpoint: 'platform-data · challenges/v1',
    status: 'opportunity',
    usage: 'Non encore branché · État des serveurs Riot & Défis',
    benefitForYou:
      'Préviendrait en cas de maintenance serveur EUW et afficherait les jalons de défis débloqués.',
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
  onNavigate,
}: GuideViewProps) {
  const [activeStageId, setActiveStageId] = useState<WorkflowStageId>('before');
  const [featureCategory, setFeatureCategory] = useState<FeatureCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIssueId, setSelectedIssueId] = useState<string>('practice-tool');
  const [apiFilter, setApiFilter] = useState<ApiFilter>('all');
  const [expandedFeatureIds, setExpandedFeatureIds] = useState<Record<string, boolean>>({
    'passive-ai': true,
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
      </section>

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
              Tapez un mot-clé (ex. « U.GG », « runes », « buissons », « Claude », « Junglers ») pour trouver immédiatement l’outil.
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
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Pourquoi cela arrive
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {selectedIssue.cause}
                </p>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
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

      {/* 5. Audit Portail Riot Developer & Prochaines APIs exploitables */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-500" aria-hidden="true" />
              <span>4. Bilan de votre Clé Riot Définitive &amp; Améliorations API possibles</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Votre application approuvée (Personal API Key · 20 req/s · 100 req/2 min) reste valide sans expiration de 24h et ouvre l’accès à d’autres endpoints Riot utiles.
            </p>
          </div>

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
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
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

        {/* Note sécurité importante suite à la capture */}
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-4 flex items-start gap-3 text-xs">
          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1 text-slate-700 dark:text-slate-300">
            <div className="font-semibold text-slate-900 dark:text-white">
              Bon réflexe sécurité avec votre clé définitive
            </div>
            <p className="leading-relaxed">
              Votre clé est bien protégée côté serveur via les Secrets. Évitez simplement de partager publiquement une capture d’écran du portail Riot où la ligne <code className="font-mono">API Key (RGAPI-...)</code> apparaît en clair ; si besoin, le bouton rouge <strong className="text-slate-900 dark:text-white">NEW API KEY</strong> sur votre portail permet d’en générer une nouvelle en 1 clic.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3 text-left font-medium">API Riot</th>
                <th className="py-2.5 px-3 text-left font-medium">Statut</th>
                <th className="py-2.5 px-3 text-left font-medium">Rôle technique</th>
                <th className="py-2.5 px-3 text-left font-medium">Bénéfice concret pour vous</th>
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

        {/* Raccourcis rapides vers les écrans */}
        <div className="flex flex-wrap gap-2.5 pt-1">
          {[
            { tab: 'dashboard' as GuideTargetTab, label: 'Tableau de bord', icon: LayoutDashboard },
            { tab: 'builds' as GuideTargetTab, label: 'Builds & Match-ups', icon: Swords },
            { tab: 'postgame' as GuideTargetTab, label: 'Analyse Post-Game', icon: History },
            { tab: 'live' as GuideTargetTab, label: 'Coach Temps Réel', icon: Activity },
            { tab: 'champions' as GuideTargetTab, label: 'Champions', icon: BookOpen },
            { tab: 'settings' as GuideTargetTab, label: 'Paramètres', icon: Settings },
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
