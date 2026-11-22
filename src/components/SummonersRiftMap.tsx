import { useEffect, useId, useMemo, useState } from 'react';
import type {
  ChampionSummary,
  MapCoordinateEvent,
  MapParticipantSnapshot,
} from '../engines/types.ts';
import { formatChampionDisplayName, resolveChampionDisplay } from '../utils/championDisplay.ts';

export interface ArchiveDeathPoint {
  x: number;
  y: number;
  zone: string;
  isolated: boolean;
}

interface SummonersRiftMapProps {
  events: MapCoordinateEvent[];
  archiveDeaths?: ArchiveDeathPoint[];
  archiveMatchCount?: number;
  champions?: ChampionSummary[];
  patchVersion: string;
  playerTeamId?: number;
  playerChampion?: string;
  mode?: 'compact' | 'expanded';
  selectedTimestampMs?: number | null;
  onSelectTimestampMs?: (ts: number) => void;
  onOpenExpanded?: () => void;
}

// Limites officielles de la Faille de l'invocateur (Match-V5 / Data Dragon map11)
const MAP_MIN_X = -120;
const MAP_MAX_X = 14870;
const MAP_MIN_Y = -120;
const MAP_MAX_Y = 14980;

// Portée d'attaque d'une tour (~775 unités Riot ≈ 15.5 unités SVG sur une grille 300x300)
const TURRET_RANGE_SVG = (775 / (MAP_MAX_X - MAP_MIN_X)) * 300;

interface TurretNode {
  id: string;
  team: 'BLUE' | 'RED';
  tier: 'OUTER' | 'INNER' | 'BASE' | 'NEXUS';
  lane: 'TOP' | 'MID' | 'BOT' | 'NEXUS';
  label: string;
  x: number;
  y: number;
}

// Coordonnées Riot exactes des 22 tourelles de la Faille de l'invocateur
const SUMMONERS_RIFT_TURRETS: TurretNode[] = [
  // Équipe Bleue (11 tours)
  { id: 'blue-top-t1', team: 'BLUE', tier: 'OUTER', lane: 'TOP', label: 'Tour T1 Top Bleue', x: 981, y: 10441 },
  { id: 'blue-top-t2', team: 'BLUE', tier: 'INNER', lane: 'TOP', label: 'Tour T2 Top Bleue', x: 1512, y: 6699 },
  { id: 'blue-top-t3', team: 'BLUE', tier: 'BASE', lane: 'TOP', label: 'Tour Inhibiteur Top Bleue', x: 1169, y: 4287 },
  { id: 'blue-mid-t1', team: 'BLUE', tier: 'OUTER', lane: 'MID', label: 'Tour T1 Mid Bleue', x: 5846, y: 6396 },
  { id: 'blue-mid-t2', team: 'BLUE', tier: 'INNER', lane: 'MID', label: 'Tour T2 Mid Bleue', x: 5048, y: 4812 },
  { id: 'blue-mid-t3', team: 'BLUE', tier: 'BASE', lane: 'MID', label: 'Tour Inhibiteur Mid Bleue', x: 3651, y: 3696 },
  { id: 'blue-bot-t1', team: 'BLUE', tier: 'OUTER', lane: 'BOT', label: 'Tour T1 Bot Bleue', x: 10504, y: 1029 },
  { id: 'blue-bot-t2', team: 'BLUE', tier: 'INNER', lane: 'BOT', label: 'Tour T2 Bot Bleue', x: 6919, y: 1483 },
  { id: 'blue-bot-t3', team: 'BLUE', tier: 'BASE', lane: 'BOT', label: 'Tour Inhibiteur Bot Bleue', x: 4281, y: 1253 },
  { id: 'blue-nexus-top', team: 'BLUE', tier: 'NEXUS', lane: 'NEXUS', label: 'Tour Nexus Haute Bleue', x: 1748, y: 2270 },
  { id: 'blue-nexus-bot', team: 'BLUE', tier: 'NEXUS', lane: 'NEXUS', label: 'Tour Nexus Basse Bleue', x: 2177, y: 1807 },

  // Équipe Rouge (11 tours)
  { id: 'red-top-t1', team: 'RED', tier: 'OUTER', lane: 'TOP', label: 'Tour T1 Top Rouge', x: 4318, y: 13875 },
  { id: 'red-top-t2', team: 'RED', tier: 'INNER', lane: 'TOP', label: 'Tour T2 Top Rouge', x: 7943, y: 13411 },
  { id: 'red-top-t3', team: 'RED', tier: 'BASE', lane: 'TOP', label: 'Tour Inhibiteur Top Rouge', x: 10481, y: 13650 },
  { id: 'red-mid-t1', team: 'RED', tier: 'OUTER', lane: 'MID', label: 'Tour T1 Mid Rouge', x: 8955, y: 8510 },
  { id: 'red-mid-t2', team: 'RED', tier: 'INNER', lane: 'MID', label: 'Tour T2 Mid Rouge', x: 9767, y: 10113 },
  { id: 'red-mid-t3', team: 'RED', tier: 'BASE', lane: 'MID', label: 'Tour Inhibiteur Mid Rouge', x: 11134, y: 11207 },
  { id: 'red-bot-t1', team: 'RED', tier: 'OUTER', lane: 'BOT', label: 'Tour T1 Bot Rouge', x: 13866, y: 4505 },
  { id: 'red-bot-t2', team: 'RED', tier: 'INNER', lane: 'BOT', label: 'Tour T2 Bot Rouge', x: 13327, y: 8226 },
  { id: 'red-bot-t3', team: 'RED', tier: 'BASE', lane: 'BOT', label: 'Tour Inhibiteur Bot Rouge', x: 13624, y: 10572 },
  { id: 'red-nexus-top', team: 'RED', tier: 'NEXUS', lane: 'NEXUS', label: 'Tour Nexus Haute Rouge', x: 12611, y: 13084 },
  { id: 'red-nexus-bot', team: 'RED', tier: 'NEXUS', lane: 'NEXUS', label: 'Tour Nexus Basse Rouge', x: 13052, y: 12612 },
];

interface BushLine {
  id: string;
  label: string;
  zone: 'lane' | 'river' | 'jungle';
  pts: Array<[number, number]>;
  width?: number;
}

// 34 buissons officiels de la Faille 2026 (post-refonte S14+) calibrés pixel par pixel sur map11.png (grille 300x300)
const SUMMONERS_RIFT_BUSHES: BushLine[] = [
  // Top Lane (3 buissons en courbe + 2 tri-bush)
  { id: 'top-lane-1', label: 'Top Lane (buisson bas)', zone: 'lane', pts: [[25, 56], [26, 50], [28, 43]], width: 4.2 },
  { id: 'top-lane-2', label: 'Top Lane (buisson milieu)', zone: 'lane', pts: [[33, 31], [38, 28]], width: 4.2 },
  { id: 'top-lane-3', label: 'Top Lane (buisson haut)', zone: 'lane', pts: [[49, 25], [56, 23], [63, 22]], width: 4.2 },
  { id: 'top-tri-blue', label: 'Tri-bush Top Bleu', zone: 'jungle', pts: [[48, 91], [53, 95]], width: 4.2 },
  { id: 'top-tri-red', label: 'Tri-bush Top Rouge', zone: 'jungle', pts: [[104, 46], [109, 48]], width: 4.2 },

  // Rivière Top & Mid (buissons S14–2026 recentrés dans la rivière)
  { id: 'top-pixel', label: 'Pixel Bush Rivière Top', zone: 'river', pts: [[51, 66], [56, 70]], width: 4.0 },
  { id: 'top-pit-back', label: 'Buisson derrière fosse Nashor', zone: 'jungle', pts: [[124, 97], [128, 102]], width: 4.0 },
  { id: 'top-mid-river', label: 'Buisson Mid-Rivière Top', zone: 'river', pts: [[115, 121], [121, 115]], width: 4.2 },

  // Jungle Bleue (quart haut-gauche)
  { id: 'blue-gromp', label: 'Buisson Gromp Bleu', zone: 'jungle', pts: [[45, 109], [49, 115]], width: 3.8 },
  { id: 'blue-buff-top', label: 'Buisson Buff Bleu', zone: 'jungle', pts: [[74, 125], [80, 127]], width: 4.0 },
  { id: 'blue-wolves-top', label: 'Buisson Loups Bleu', zone: 'jungle', pts: [[67, 151], [68, 158]], width: 3.8 },
  { id: 'blue-river-exit', label: 'Entrée Jungle Bleue Top', zone: 'jungle', pts: [[96, 125], [102, 125]], width: 3.8 },

  // Jungle Rouge (quart haut-droite)
  { id: 'red-krugs-top', label: 'Buisson Krugs Rouge', zone: 'jungle', pts: [[168, 49], [174, 51]], width: 3.8 },
  { id: 'red-behind-top', label: 'Buisson arrière Red Rouge', zone: 'jungle', pts: [[148, 61], [154, 62]], width: 3.8 },
  { id: 'red-cross-top', label: 'Carrefour Red Rouge', zone: 'jungle', pts: [[128, 66], [136, 66]], width: 4.0 },
  { id: 'red-buff-top', label: 'Buisson Red Buff Rouge', zone: 'jungle', pts: [[156, 91], [160, 94]], width: 4.0 },
  { id: 'red-raptors-top', label: 'Buisson Corbins Rouge', zone: 'jungle', pts: [[168, 95], [171, 100]], width: 3.8 },

  // Bot Lane (3 buissons en courbe + 2 tri-bush)
  { id: 'bot-lane-1', label: 'Bot Lane (buisson haut)', zone: 'lane', pts: [[274, 244], [273, 250], [271, 257]], width: 4.2 },
  { id: 'bot-lane-2', label: 'Bot Lane (buisson milieu)', zone: 'lane', pts: [[266, 269], [261, 272]], width: 4.2 },
  { id: 'bot-lane-3', label: 'Bot Lane (buisson bas)', zone: 'lane', pts: [[251, 275], [244, 277], [237, 278]], width: 4.2 },
  { id: 'bot-tri-red', label: 'Tri-bush Bot Rouge', zone: 'jungle', pts: [[252, 209], [247, 205]], width: 4.2 },
  { id: 'bot-tri-blue', label: 'Tri-bush Bot Bleu', zone: 'jungle', pts: [[193, 251], [188, 249]], width: 4.2 },

  // Rivière Bot & Mid (buissons S14–2026 recentrés dans la rivière)
  { id: 'bot-pixel', label: 'Pixel Bush Rivière Bot', zone: 'river', pts: [[249, 234], [244, 230]], width: 4.0 },
  { id: 'bot-pit-back', label: 'Buisson derrière fosse Dragon', zone: 'jungle', pts: [[176, 203], [172, 198]], width: 4.0 },
  { id: 'bot-mid-river', label: 'Buisson Mid-Rivière Bot', zone: 'river', pts: [[185, 179], [179, 185]], width: 4.2 },

  // Jungle Rouge (quart bas-droite)
  { id: 'red-gromp', label: 'Buisson Gromp Rouge', zone: 'jungle', pts: [[255, 191], [251, 185]], width: 3.8 },
  { id: 'red-buff-bot', label: 'Buisson Buff Bleu (Rouge)', zone: 'jungle', pts: [[226, 175], [220, 173]], width: 4.0 },
  { id: 'red-wolves-bot', label: 'Buisson Loups Rouge', zone: 'jungle', pts: [[233, 149], [232, 142]], width: 3.8 },
  { id: 'red-river-exit', label: 'Entrée Jungle Rouge Bot', zone: 'jungle', pts: [[204, 175], [198, 175]], width: 3.8 },

  // Jungle Bleue (quart bas-gauche)
  { id: 'blue-krugs-bot', label: 'Buisson Krugs Bleu', zone: 'jungle', pts: [[132, 251], [126, 249]], width: 3.8 },
  { id: 'blue-behind-bot', label: 'Buisson arrière Red Bleu', zone: 'jungle', pts: [[152, 239], [146, 238]], width: 3.8 },
  { id: 'blue-cross-bot', label: 'Carrefour Red Bleu', zone: 'jungle', pts: [[172, 234], [164, 234]], width: 4.0 },
  { id: 'blue-buff-bot', label: 'Buisson Red Buff Bleu', zone: 'jungle', pts: [[144, 209], [140, 206]], width: 4.0 },
  { id: 'blue-raptors-bot', label: 'Buisson Corbins Bleu', zone: 'jungle', pts: [[132, 205], [129, 200]], width: 3.8 },
];

function bushPointsToSvgPath(pts: Array<[number, number]>): string {
  if (pts.length === 2) {
    return `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]}`;
  }
  if (pts.length === 3) {
    return `M ${pts[0][0]} ${pts[0][1]} Q ${pts[1][0]} ${pts[1][1]} ${pts[2][0]} ${pts[2][1]}`;
  }
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
}

function toStructX(x: number): number {
  return ((x - MAP_MIN_X) / (MAP_MAX_X - MAP_MIN_X)) * 300;
}

function toStructY(y: number): number {
  return 300 - ((y - MAP_MIN_Y) / (MAP_MAX_Y - MAP_MIN_Y)) * 300;
}

function toEventX(x: number): number {
  return Math.max(9, Math.min(291, toStructX(x)));
}

function toEventY(y: number): number {
  return Math.max(9, Math.min(291, toStructY(y)));
}

function riotDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.round(Math.hypot(ax - bx, ay - by));
}

function formatRoleFr(pos: string): string {
  const upper = pos.toUpperCase();
  if (upper === 'TOP') return 'Top';
  if (upper === 'JUNGLE') return 'Jungle';
  if (upper === 'MIDDLE' || upper === 'MID') return 'Mid';
  if (upper === 'BOTTOM' || upper === 'ADC') return 'ADC';
  if (upper === 'UTILITY' || upper === 'SUPPORT') return 'Support';
  return '';
}

const CHAMPION_IMG_ALIASES: Record<string, string> = {
  fiddlesticks: 'Fiddlesticks',
  wukong: 'MonkeyKing',
  monkeyking: 'MonkeyKing',
  nunuwillump: 'Nunu',
  nunu: 'Nunu',
  renataglasc: 'Renata',
  renata: 'Renata',
  belveth: 'Belveth',
  chogath: 'Chogath',
  drmundo: 'DrMundo',
  jarvaniv: 'JarvanIV',
  kaisa: 'Kaisa',
  khazix: 'Khazix',
  kogmaw: 'KogMaw',
  ksante: 'KSante',
  leblanc: 'Leblanc',
  leesin: 'LeeSin',
  masteryi: 'MasterYi',
  missfortune: 'MissFortune',
  reksai: 'RekSai',
  tahmkench: 'TahmKench',
  twistedfate: 'TwistedFate',
  velkoz: 'Velkoz',
  xinzhao: 'XinZhao',
  aurelionsol: 'AurelionSol',
};

function normalizeChampionImageKey(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '');
  const alias = CHAMPION_IMG_ALIASES[cleaned.toLowerCase()];
  if (alias) return alias;
  return cleaned;
}

export function SummonersRiftMap({
  events,
  archiveDeaths = [],
  archiveMatchCount = 0,
  champions = [],
  patchVersion,
  playerTeamId = 100,
  playerChampion,
  mode = 'compact',
  selectedTimestampMs,
  onSelectTimestampMs,
  onOpenExpanded,
}: SummonersRiftMapProps) {
  const svgUid = useId().replace(/:/g, '');
  const [filterType, setFilterType] = useState<'ALL' | 'DEATH' | 'KILL'>('ALL');
  const [internalSelectedEvent, setInternalSelectedEvent] = useState<MapCoordinateEvent | null>(
    events.find((e) => e.type === 'DEATH') || events[0] || null,
  );
  const [showBushes, setShowBushes] = useState(true);
  const [showTurrets, setShowTurrets] = useState(true);
  const [showTurretRanges, setShowTurretRanges] = useState(false);
  const [showChampionPositions, setShowChampionPositions] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [hoveredFeature, setHoveredFeature] = useState<string | null>(null);
  const [hoveredTurretId, setHoveredTurretId] = useState<string | null>(null);
  const [mapImgFailed, setMapImgFailed] = useState(false);

  const resolveChampionIconUrl = (rawName?: string): string | null => {
    if (!rawName) return null;
    const trimmed = rawName.trim();
    if (
      !trimmed ||
      trimmed === 'Adversaire' ||
      trimmed === 'Tourelle' ||
      trimmed === 'Sbires / Monstres'
    ) {
      return null;
    }
    const disp = resolveChampionDisplay(champions, trimmed);
    if (disp.imageUrl) return disp.imageUrl;
    const imgKey = normalizeChampionImageKey(trimmed);
    if (!imgKey) return null;
    return `https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/champion/${imgKey}.png`;
  };

  const playerIconUrl = resolveChampionIconUrl(playerChampion);
  const playerDisplayName = playerChampion
    ? formatChampionDisplayName(champions, playerChampion)
    : undefined;

  const isExpanded = mode === 'expanded';

  // Synchronise la sélection quand on change de match ou via prop externe
  useEffect(() => {
    if (selectedTimestampMs != null) {
      const matchEv = events.find((e) => e.timestampMs === selectedTimestampMs);
      if (matchEv) {
        setInternalSelectedEvent(matchEv);
        return;
      }
    }
    setInternalSelectedEvent(events.find((e) => e.type === 'DEATH') || events[0] || null);
  }, [events, selectedTimestampMs]);

  const selectedEvent = useMemo(() => {
    if (selectedTimestampMs != null) {
      return events.find((e) => e.timestampMs === selectedTimestampMs) || internalSelectedEvent;
    }
    return internalSelectedEvent;
  }, [events, selectedTimestampMs, internalSelectedEvent]);

  const handleSelectEvent = (ev: MapCoordinateEvent) => {
    setInternalSelectedEvent(ev);
    onSelectTimestampMs?.(ev.timestampMs);
  };

  const visibleEvents = useMemo(() => {
    if (filterType === 'ALL') return events;
    return events.filter((e) => e.type === filterType);
  }, [events, filterType]);

  const mapUrl = `https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/map/map11.png`;
  const deathCount = events.filter((e) => e.type === 'DEATH').length;
  const killCount = events.filter((e) => e.type === 'KILL').length;

  const heatmapHotspot = useMemo(() => {
    if (archiveDeaths.length === 0) return null;
    const zoneCounts = new Map<string, number>();
    for (const d of archiveDeaths) {
      zoneCounts.set(d.zone, (zoneCounts.get(d.zone) || 0) + 1);
    }
    const top = Array.from(zoneCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    return top ? { zone: top[0], count: top[1] } : null;
  }, [archiveDeaths]);

  // Diagnostic géométrique + positionnel pour l'événement sélectionné
  const tacticalAnalysis = useMemo(() => {
    if (!selectedEvent) return null;

    const allyTeamStr = playerTeamId === 200 ? 'RED' : 'BLUE';
    const enemyTeamStr = playerTeamId === 200 ? 'BLUE' : 'RED';

    let nearestAllyTurret = SUMMONERS_RIFT_TURRETS[0];
    let nearestAllyDist = Infinity;
    let nearestEnemyTurret = SUMMONERS_RIFT_TURRETS[0];
    let nearestEnemyDist = Infinity;

    for (const t of SUMMONERS_RIFT_TURRETS) {
      const d = riotDistance(selectedEvent.x, selectedEvent.y, t.x, t.y);
      if (t.team === allyTeamStr && d < nearestAllyDist) {
        nearestAllyDist = d;
        nearestAllyTurret = t;
      }
      if (t.team === enemyTeamStr && d < nearestEnemyDist) {
        nearestEnemyDist = d;
        nearestEnemyTurret = t;
      }
    }

    // Territoire par rapport à la diagonale de la rivière (x + y = 14870)
    const diag = selectedEvent.x + selectedEvent.y;
    const isBlue = playerTeamId !== 200;
    let territory = 'Rivière / Zone neutre';
    let overextended = false;
    if (Math.abs(diag - 14870) > 1300) {
      const inEnemyHalf = isBlue ? diag > 14870 : diag < 14870;
      territory = inEnemyHalf ? 'Territoire adverse (avancé)' : 'Territoire allié';
      overextended = inEnemyHalf && nearestAllyDist > 2600;
    }

    // Buisson le plus proche (en unités SVG -> unités Riot)
    const evSvgX = toStructX(selectedEvent.x);
    const evSvgY = toStructY(selectedEvent.y);
    let nearestBush: BushLine | null = null;
    let nearestBushSvgDist = Infinity;
    for (const b of SUMMONERS_RIFT_BUSHES) {
      for (const [bx, by] of b.pts) {
        const d = Math.hypot(evSvgX - bx, evSvgY - by);
        if (d < nearestBushSvgDist) {
          nearestBushSvgDist = d;
          nearestBush = b;
        }
      }
    }
    const nearestBushRiotDist = Math.round((nearestBushSvgDist / 300) * (MAP_MAX_X - MAP_MIN_X));
    const nearBush = nearestBush && nearestBushRiotDist <= 1150 ? nearestBush : null;

    // Snapshots des 10 champions (si Match-V5 Timeline disponible)
    const snapshots = selectedEvent.participantSnapshots || [];
    const otherSnapshots = snapshots.filter((s) => !s.isPlayer);
    const nearbyAllies = otherSnapshots.filter(
      (s) => s.isAlly && riotDistance(selectedEvent.x, selectedEvent.y, s.x, s.y) <= 2600,
    );
    const farAllies = otherSnapshots.filter(
      (s) => s.isAlly && riotDistance(selectedEvent.x, selectedEvent.y, s.x, s.y) > 2600,
    );
    const nearestAllySnap = otherSnapshots
      .filter((s) => s.isAlly)
      .sort(
        (a, b) =>
          riotDistance(selectedEvent.x, selectedEvent.y, a.x, a.y) -
          riotDistance(selectedEvent.x, selectedEvent.y, b.x, b.y),
      )[0];

    const threats = otherSnapshots.filter((s) => !s.isAlly && (s.isKiller || s.isAssister));
    const enemiesCount =
      selectedEvent.type === 'DEATH'
        ? Math.max(1, (selectedEvent.assistingChampions?.length || 0) + 1)
        : 1;
    const alliesCount = nearbyAllies.length + 1;

    // Causes probables & recommandation concrète
    const causes: string[] = [];
    if (selectedEvent.type === 'DEATH') {
      if (enemiesCount >= 2 && nearbyAllies.length === 0) {
        causes.push(
          `Infériorité numérique nette (${alliesCount}v${enemiesCount}) : vous étiez seul face à ${selectedEvent.killerChampion || 'l’adversaire'}${
            selectedEvent.assistingChampions?.length
              ? ` épaulé par ${selectedEvent.assistingChampions.join(', ')}`
              : ''
          }.`,
        );
      } else if (enemiesCount >= 2) {
        causes.push(
          `Engagement en supériorité adverse (${alliesCount}v${enemiesCount}) face à ${enemiesCount} ennemis coordonnés.`,
        );
      }

      if (overextended) {
        causes.push(
          `Position trop avancée (${nearestAllyDist.toLocaleString('fr-FR')} u. de votre tour la plus proche, ${nearestAllyTurret.label}) : repli impossible avant l’arrivée des ennemis.`,
        );
      } else if (nearestEnemyDist <= 950) {
        causes.push(
          `Action sous tour adverse (${nearestEnemyTurret.label}, à ${nearestEnemyDist.toLocaleString('fr-FR')} u.) : risque élevé de prise de tourelle ou de contre-gank.`,
        );
      }

      if (nearBush) {
        causes.push(
          `Combat collé à un angle mort (${nearBush.label} à ~${nearestBushRiotDist} u.) : zone classique d’embuscade ou de gank sans balise.`,
        );
      }

      if (selectedEvent.nearObjectiveWindow) {
        causes.push(
          `Timing critique (<45s avant un Dragon/Baron) : cette mort prive l’équipe de contestation sur l’objectif.`,
        );
      }

      if (causes.length === 0) {
        causes.push(
          `Duel perdu ou burst subi en ${selectedEvent.zone} à ${selectedEvent.minute} min (${nearestAllyDist.toLocaleString('fr-FR')} u. de ${nearestAllyTurret.label}).`,
        );
      }
    } else {
      causes.push(
        `Élimination réussie en ${selectedEvent.zone} à ${selectedEvent.minute} min${
          selectedEvent.assistingChampions?.length
            ? ` avec l’appui de ${selectedEvent.assistingChampions.join(', ')}`
            : ' en action solo'
        }.`,
      );
    }

    let tip = '';
    if (selectedEvent.type === 'DEATH') {
      if (selectedEvent.nearObjectiveWindow) {
        tip =
          'Rentrez à la base 55 secondes avant le prochain objectif et posez la vision autour de la fosse avec votre support/jungler avant de pousser.';
      } else if (overextended && nearbyAllies.length === 0) {
        tip =
          'Ne dépassez pas la ligne médiane sans savoir où sont le jungler et le mid adverses ; poussez la vague puis reculez vers votre tour ou dans le brouillard.';
      } else if (nearBush) {
        tip = `Utilisez un sort à distance ou une balise bleue/jaune dans ${nearBush.label} avant de vous en approcher.`;
      } else {
        tip = `Gardez un œil sur les pings et la distance à votre tour de repli (${nearestAllyTurret.label}) avant d’engager.`;
      }
    } else {
      tip = 'Après ce kill, convertissez immédiatement l’avantage numérique sur une tour, des plaques ou un objectif neutre.';
    }

    return {
      nearestAllyTurret,
      nearestAllyDist,
      nearestEnemyTurret,
      nearestEnemyDist,
      territory,
      overextended,
      nearBush,
      nearestBushRiotDist,
      snapshots,
      nearbyAllies,
      farAllies,
      nearestAllySnap,
      threats,
      enemiesCount,
      alliesCount,
      causes,
      tip,
    };
  }, [selectedEvent, playerTeamId]);

  const currentVisibleIdx = selectedEvent
    ? visibleEvents.findIndex((e) => e.timestampMs === selectedEvent.timestampMs)
    : -1;

  const mapMaxWidthClass = isExpanded ? 'max-w-[660px]' : 'max-w-[390px]';

  return (
    <div className={`grid grid-cols-1 ${isExpanded ? 'xl:grid-cols-12' : 'lg:grid-cols-12'} gap-6 items-start`}>
      {/* Colonne Carte */}
      <div className={`${isExpanded ? 'xl:col-span-7' : 'lg:col-span-6'} space-y-2.5`}>
        {/* Barre de calques sur une seule ligne propre */}
        <div
          className={`${mapMaxWidthClass} mx-auto grid grid-cols-5 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800`}
        >
          <button
            type="button"
            onClick={() => setShowBushes((prev) => !prev)}
            className={`px-1.5 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate ${
              showBushes
                ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Buissons
          </button>
          <button
            type="button"
            onClick={() => setShowTurrets((prev) => !prev)}
            className={`px-1.5 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate ${
              showTurrets
                ? 'bg-sky-600/15 text-sky-700 dark:text-sky-300 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Tours (22)
          </button>
          <button
            type="button"
            disabled={!showTurrets}
            onClick={() => setShowTurretRanges((prev) => !prev)}
            className={`px-1.5 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate disabled:opacity-40 ${
              showTurretRanges && showTurrets
                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Portée
          </button>
          <button
            type="button"
            onClick={() => setShowChampionPositions((prev) => !prev)}
            className={`px-1.5 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate ${
              showChampionPositions
                ? 'bg-rose-600/15 text-rose-700 dark:text-rose-300 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Champions
          </button>
          <button
            type="button"
            disabled={archiveDeaths.length === 0}
            onClick={() => setShowHeatmap((prev) => !prev)}
            title={
              archiveDeaths.length > 0
                ? `Superposer les ${archiveDeaths.length} morts de vos ${archiveMatchCount} parties archivées`
                : 'Synchronisez vos matchs pour activer la carte thermique'
            }
            className={`px-1.5 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate disabled:opacity-40 ${
              showHeatmap && archiveDeaths.length > 0
                ? 'bg-orange-500/20 text-orange-700 dark:text-orange-300 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Heatmap
          </button>
        </div>

        {/* Minimap interactive */}
        <div
          className={`relative aspect-square w-full ${mapMaxWidthClass} mx-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-[#0B0E14] overflow-hidden shadow-inner`}
        >
          {!mapImgFailed ? (
            <img
              src={mapUrl}
              alt="Minimap officielle de la Faille de l'invocateur (Data Dragon)"
              referrerPolicy="no-referrer"
              onError={() => setMapImgFailed(true)}
              className="absolute inset-0 w-full h-full object-cover select-none"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#101827] to-slate-950" />
          )}

          <div className="absolute inset-0 bg-black/20 pointer-events-none" />

          <svg
            viewBox="0 0 300 300"
            className="relative z-10 w-full h-full"
            role="img"
            aria-label="Minimap de la Faille de l'invocateur avec tours, lignes de buissons, positions des champions et événements"
          >
            <defs>
              <marker
                id="threat-arrow"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 8 5 L 0 9 z" fill="#FB7185" />
              </marker>
              <radialGradient id="death-heat-grad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#F97316" stopOpacity="0.46" />
                <stop offset="55%" stopColor="#EF4444" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Calque 0 : Carte thermique multi-matchs (zones de mort récurrentes) */}
            {showHeatmap && archiveDeaths.length > 0 && (
              <g aria-label="Carte thermique multi-matchs" className="pointer-events-none">
                {archiveDeaths.map((d, i) => (
                  <circle
                    key={`heat-${i}`}
                    cx={toEventX(d.x)}
                    cy={toEventY(d.y)}
                    r={d.isolated ? 16 : 12}
                    fill="url(#death-heat-grad)"
                  />
                ))}
              </g>
            )}

            {/* Labels des bases */}
            <text
              x="12"
              y="291"
              className="fill-sky-300/85 text-[7.5px] font-mono font-semibold pointer-events-none"
            >
              BASE BLEUE
            </text>
            <text
              x="288"
              y="15"
              textAnchor="end"
              className="fill-rose-300/85 text-[7.5px] font-mono font-semibold pointer-events-none"
            >
              BASE ROUGE
            </text>

            {/* Calque 1 : Lignes de buissons (34 buissons officiels 2026 vérifiés sur map11.png) */}
            {showBushes && (
              <g aria-label="Lignes de buissons">
                {SUMMONERS_RIFT_BUSHES.map((bush) => {
                  const d = bushPointsToSvgPath(bush.pts);
                  const w = bush.width ?? 4.0;
                  const isHovered = hoveredFeature === bush.label;
                  return (
                    <g
                      key={bush.id}
                      onMouseEnter={() => setHoveredFeature(bush.label)}
                      onMouseLeave={() => setHoveredFeature(null)}
                      className="cursor-help"
                    >
                      <title>{bush.label}</title>
                      <path
                        d={d}
                        fill="none"
                        stroke="#052E16"
                        strokeWidth={w + 1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.92}
                      />
                      <path
                        d={d}
                        fill="none"
                        stroke={isHovered ? '#4ADE80' : '#22C55E'}
                        strokeWidth={w}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={isHovered ? 1 : 0.9}
                      />
                      <path
                        d={d}
                        fill="none"
                        stroke="#86EFAC"
                        strokeWidth={Math.max(1.1, w * 0.32)}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.65}
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {/* Calque 2 : Cercles de portée des tours */}
            {showTurrets &&
              SUMMONERS_RIFT_TURRETS.map((turret) => {
                const isHovered = hoveredTurretId === turret.id;
                if (!showTurretRanges && !isHovered) return null;
                const tx = toStructX(turret.x);
                const ty = toStructY(turret.y);
                return (
                  <circle
                    key={`range-${turret.id}`}
                    cx={tx}
                    cy={ty}
                    r={TURRET_RANGE_SVG}
                    fill={turret.team === 'BLUE' ? 'rgba(56, 189, 248, 0.08)' : 'rgba(251, 113, 133, 0.08)'}
                    stroke={turret.team === 'BLUE' ? 'rgba(56, 189, 248, 0.55)' : 'rgba(251, 113, 133, 0.55)'}
                    strokeWidth="0.9"
                    strokeDasharray="2.5 2"
                    className="pointer-events-none"
                  />
                );
              })}

            {/* Calque 3 : Ligne de sécurité vers la tour alliée la plus proche de l'événement sélectionné */}
            {showTurrets && selectedEvent && tacticalAnalysis && (
              <line
                x1={toEventX(selectedEvent.x)}
                y1={toEventY(selectedEvent.y)}
                x2={toStructX(tacticalAnalysis.nearestAllyTurret.x)}
                y2={toStructY(tacticalAnalysis.nearestAllyTurret.y)}
                stroke="rgba(56, 189, 248, 0.65)"
                strokeWidth="1.2"
                strokeDasharray="3 2.5"
                className="pointer-events-none"
              />
            )}

            {/* Calque 4 : Les 22 Tours officielles */}
            {showTurrets && (
              <g aria-label="Tourelles des équipes Bleue et Rouge">
                {SUMMONERS_RIFT_TURRETS.map((turret) => {
                  const tx = toStructX(turret.x);
                  const ty = toStructY(turret.y);
                  const isBlue = turret.team === 'BLUE';
                  const isNexus = turret.tier === 'NEXUS';
                  const size = isNexus ? 4.3 : turret.tier === 'BASE' ? 4.7 : 5.1;
                  const isHovered = hoveredTurretId === turret.id;

                  const points = [
                    `${tx},${ty - size}`,
                    `${tx + size * 0.85},${ty - size * 0.25}`,
                    `${tx + size * 0.65},${ty + size * 0.85}`,
                    `${tx - size * 0.65},${ty + size * 0.85}`,
                    `${tx - size * 0.85},${ty - size * 0.25}`,
                  ].join(' ');

                  return (
                    <g
                      key={turret.id}
                      onMouseEnter={() => {
                        setHoveredTurretId(turret.id);
                        setHoveredFeature(`${turret.label} · Portée ~775`);
                      }}
                      onMouseLeave={() => {
                        setHoveredTurretId(null);
                        setHoveredFeature(null);
                      }}
                      className="cursor-help"
                    >
                      <title>{turret.label}</title>
                      <polygon
                        points={points}
                        fill={isBlue ? '#0EA5E9' : '#F43F5E'}
                        stroke={isHovered ? '#FFFFFF' : isBlue ? '#082F49' : '#4C0519'}
                        strokeWidth={isHovered ? 1.6 : 1.25}
                      />
                      <circle
                        cx={tx}
                        cy={ty + size * 0.05}
                        r={size * 0.32}
                        fill={isBlue ? '#BAE6FD' : '#FECDD3'}
                        className="pointer-events-none"
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {/* Calque 5 : Positions des 10 champions & flèches d'approche pour la mort/action sélectionnée */}
            {showChampionPositions &&
              selectedEvent &&
              tacticalAnalysis &&
              tacticalAnalysis.snapshots.length > 0 && (
                <g aria-label="Positions des champions autour de l'événement">
                  {/* Flèches d'approche depuis la position des attaquants jusqu'au lieu de la mort */}
                  {selectedEvent.type === 'DEATH' &&
                    tacticalAnalysis.threats.map((threat: MapParticipantSnapshot) => {
                      const sx = toEventX(threat.x);
                      const sy = toEventY(threat.y);
                      const tx = toEventX(selectedEvent.x);
                      const ty = toEventY(selectedEvent.y);
                      if (Math.hypot(sx - tx, sy - ty) < 8) return null;
                      return (
                        <line
                          key={`threat-line-${threat.participantId}`}
                          x1={sx}
                          y1={sy}
                          x2={tx}
                          y2={ty}
                          stroke="#FB7185"
                          strokeWidth="1.5"
                          strokeDasharray="3 2"
                          markerEnd="url(#threat-arrow)"
                          opacity={0.9}
                          className="pointer-events-none"
                        />
                      );
                    })}

                  {/* Jetons des 9 autres champions (hors joueur déjà affiché par son portrait en Calque 6) */}
                  {tacticalAnalysis.snapshots
                    .filter((s) => !s.isPlayer)
                    .map((snap) => {
                      const rawSx = toEventX(snap.x);
                      const rawSy = toEventY(snap.y);
                      const selX = toEventX(selectedEvent.x);
                      const selY = toEventY(selectedEvent.y);
                      const distToPlayer = Math.hypot(rawSx - selX, rawSy - selY);
                      // Léger décalage visuel si l'attaquant est collé pile sur le portrait du joueur
                      let sx = rawSx;
                      let sy = rawSy;
                      if (distToPlayer < 12) {
                        const angle =
                          distToPlayer > 0.5
                            ? Math.atan2(rawSy - selY, rawSx - selX)
                            : (snap.participantId % 5) * 0.9 - 1.2;
                        sx = Math.max(10, Math.min(290, selX + Math.cos(angle) * 13));
                        sy = Math.max(10, Math.min(290, selY + Math.sin(angle) * 13));
                      }

                      const isThreat = snap.isKiller || snap.isAssister;
                      const radius = isThreat
                        ? isExpanded
                          ? 8.5
                          : 7.2
                        : isExpanded
                          ? 6.8
                          : 5.8;
                      const clipId = `${svgUid}-snap-${snap.participantId}`;
                      const imgUrl = resolveChampionIconUrl(snap.championName);
                      const snapDisplayName = formatChampionDisplayName(champions, snap.championName);
                      const roleTag = formatRoleFr(snap.teamPosition);
                      const tooltip = `${snapDisplayName}${roleTag ? ` (${roleTag})` : ''} · ${
                        snap.isKiller
                          ? 'Tueur'
                          : snap.isAssister
                            ? 'Assiste'
                            : snap.isAlly
                              ? 'Allié'
                              : 'Adversaire'
                      }`;

                      return (
                        <g
                          key={`snap-${snap.participantId}`}
                          onMouseEnter={() => setHoveredFeature(tooltip)}
                          onMouseLeave={() => setHoveredFeature(null)}
                          className="cursor-help"
                        >
                          <title>{tooltip}</title>
                          <defs>
                            <clipPath id={clipId}>
                              <circle cx={sx} cy={sy} r={radius - 0.8} />
                            </clipPath>
                          </defs>
                          <circle
                            cx={sx}
                            cy={sy}
                            r={radius + (isThreat ? 1.5 : 0.7)}
                            fill={
                              snap.isAlly
                                ? '#0284C7'
                                : isThreat
                                  ? '#E11D48'
                                  : '#334155'
                            }
                            stroke={isThreat ? '#FDE047' : snap.isAlly ? '#7DD3FC' : '#FDA4AF'}
                            strokeWidth={isThreat ? 1.5 : 1}
                            opacity={snap.isAlly || isThreat ? 0.98 : 0.78}
                          />
                          <text
                            x={sx}
                            y={sy + 2.2}
                            textAnchor="middle"
                            className="fill-white text-[5.5px] font-mono font-bold pointer-events-none"
                          >
                            {snap.championName.slice(0, 2).toUpperCase()}
                          </text>
                          {imgUrl && (
                            <image
                              href={imgUrl}
                              x={sx - radius + 0.8}
                              y={sy - radius + 0.8}
                              width={(radius - 0.8) * 2}
                              height={(radius - 0.8) * 2}
                              clipPath={`url(#${clipId})`}
                              preserveAspectRatio="xMidYMid slice"
                              opacity={snap.isAlly || isThreat ? 0.98 : 0.82}
                            />
                          )}
                        </g>
                      );
                    })}
                </g>
              )}

            {/* Calque 6 : Événements du joueur (Portrait réel du champion joué + badge × / +) */}
            {visibleEvents.map((ev, idx) => {
              const cx = toEventX(ev.x);
              const cy = toEventY(ev.y);
              const isSelected = selectedEvent === ev;
              const isDeath = ev.type === 'DEATH';
              const showPortrait = showChampionPositions && Boolean(playerIconUrl);
              const radius = showPortrait
                ? isSelected
                  ? isExpanded
                    ? 10.2
                    : 9.2
                  : isExpanded
                    ? 7.2
                    : 6.4
                : isSelected
                  ? 7.5
                  : 6.2;
              const playerClipId = `${svgUid}-player-ev-${idx}`;
              const badgeX = cx + radius * 0.72;
              const badgeY = cy - radius * 0.72;
              const badgeR = isSelected ? 3.5 : 2.9;

              return (
                <g
                  key={`${ev.timestampMs}-${idx}`}
                  onClick={() => handleSelectEvent(ev)}
                  onMouseEnter={() =>
                    setHoveredFeature(
                      `${playerDisplayName || 'Vous'} · ${isDeath ? 'Mort' : 'Élimination'} (${ev.minute} min)`,
                    )
                  }
                  onMouseLeave={() => setHoveredFeature(null)}
                  className="cursor-pointer"
                >
                  <title>{ev.contextNote}</title>
                  {isSelected && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius + 4.2}
                      className={
                        isDeath
                          ? 'fill-rose-500/30 stroke-white'
                          : 'fill-emerald-500/30 stroke-white'
                      }
                      strokeWidth="1.6"
                    />
                  )}
                  {showPortrait && playerIconUrl ? (
                    <>
                      <defs>
                        <clipPath id={playerClipId}>
                          <circle cx={cx} cy={cy} r={radius - 0.9} />
                        </clipPath>
                      </defs>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={radius}
                        fill={isDeath ? '#9F1239' : '#065F46'}
                        stroke={isSelected ? '#FFFFFF' : isDeath ? '#FB7185' : '#34D399'}
                        strokeWidth={isSelected ? 1.8 : 1.35}
                        opacity={selectedEvent && !isSelected ? 0.85 : 1}
                      />
                      <text
                        x={cx}
                        y={cy + 2.2}
                        textAnchor="middle"
                        className="fill-white text-[5.5px] font-mono font-bold pointer-events-none"
                      >
                        {(playerChampion || 'V').slice(0, 2).toUpperCase()}
                      </text>
                      <image
                        href={playerIconUrl}
                        x={cx - radius + 0.9}
                        y={cy - radius + 0.9}
                        width={(radius - 0.9) * 2}
                        height={(radius - 0.9) * 2}
                        clipPath={`url(#${playerClipId})`}
                        preserveAspectRatio="xMidYMid slice"
                        opacity={selectedEvent && !isSelected ? 0.88 : 1}
                      />
                      {/* Pastille compacte Mort (×) ou Kill (+) en coin pour garder le visage lisible */}
                      <circle
                        cx={badgeX}
                        cy={badgeY}
                        r={badgeR}
                        fill={isDeath ? '#E11D48' : '#10B981'}
                        stroke="#FFFFFF"
                        strokeWidth="0.9"
                      />
                      <text
                        x={badgeX}
                        y={badgeY + 1.8}
                        textAnchor="middle"
                        className="fill-white text-[5.5px] font-mono font-bold pointer-events-none"
                      >
                        {isDeath ? '×' : '+'}
                      </text>
                    </>
                  ) : (
                    <>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={radius}
                        className={
                          isDeath ? 'fill-rose-600 stroke-white' : 'fill-emerald-600 stroke-white'
                        }
                        strokeWidth="1.5"
                        opacity={selectedEvent && !isSelected && isExpanded ? 0.68 : 1}
                      />
                      <text
                        x={cx}
                        y={cy + 2.8}
                        textAnchor="middle"
                        className="fill-white text-[8.5px] font-mono font-bold pointer-events-none"
                      >
                        {isDeath ? '×' : '+'}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Légende épurée sur une ligne */}
        <div
          className={`${mapMaxWidthClass} mx-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 px-0.5`}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rotate-45 bg-sky-500 inline-block" aria-hidden="true" />
              Tours Bleues
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rotate-45 bg-rose-500 inline-block" aria-hidden="true" />
              Tours Rouges
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-1.5 rounded-sm bg-emerald-500 inline-block" aria-hidden="true" />
              Buissons
            </span>
            {showChampionPositions && (
              <>
                {playerIconUrl && (
                  <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200 font-medium">
                    <img
                      src={playerIconUrl}
                      alt={playerDisplayName || 'Vous'}
                      className="w-3.5 h-3.5 rounded-full ring-1 ring-rose-400 object-cover"
                    />
                    {playerDisplayName || 'Vous'}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-rose-500 ring-1 ring-yellow-300 inline-block" aria-hidden="true" />
                  Attaquants
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-sky-500 inline-block" aria-hidden="true" />
                  Alliés
                </span>
              </>
            )}
          </div>
          {hoveredFeature ? (
            <span className="text-amber-600 dark:text-amber-400 font-medium truncate max-w-[240px]">
              {hoveredFeature}
            </span>
          ) : showHeatmap && heatmapHotspot ? (
            <span className="text-orange-600 dark:text-orange-400 font-mono tabular-nums truncate">
              Heatmap ({archiveDeaths.length} morts / {archiveMatchCount}m) · Zone critique : {heatmapHotspot.zone} ({heatmapHotspot.count})
            </span>
          ) : null}
        </div>
      </div>

      {/* Colonne Droite : Synthèse épurée + Chronologie à hauteur équilibrée */}
      <div className={`${isExpanded ? 'xl:col-span-5' : 'lg:col-span-6'} space-y-4`}>
        {selectedEvent && tacticalAnalysis && (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800 pb-4">
            {/* En-tête de l'action sélectionnée (zéro pilule, métadonnées typographiques) */}
            <div className="pb-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2 min-w-0">
                  <h3
                    className={`text-sm font-bold truncate ${
                      selectedEvent.type === 'DEATH'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {selectedEvent.type === 'DEATH' ? 'Mort' : 'Élimination'} · {selectedEvent.zone}
                  </h3>
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                    {selectedEvent.minute} min
                  </span>
                </div>

                {visibleEvents.length > 1 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={currentVisibleIdx <= 0}
                      onClick={() => {
                        if (currentVisibleIdx > 0) {
                          handleSelectEvent(visibleEvents[currentVisibleIdx - 1]);
                        }
                      }}
                      className="px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-35 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Action précédente"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={currentVisibleIdx < 0 || currentVisibleIdx >= visibleEvents.length - 1}
                      onClick={() => {
                        if (currentVisibleIdx >= 0 && currentVisibleIdx < visibleEvents.length - 1) {
                          handleSelectEvent(visibleEvents[currentVisibleIdx + 1]);
                        }
                      }}
                      className="px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-35 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Action suivante"
                    >
                      →
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {selectedEvent.type === 'DEATH' &&
                  resolveChampionIconUrl(selectedEvent.killerChampion) && (
                    <img
                      src={resolveChampionIconUrl(selectedEvent.killerChampion)!}
                      alt={selectedEvent.killerChampion || 'Attaquant'}
                      className="w-5 h-5 rounded-full ring-1 ring-rose-500/70 object-cover shrink-0"
                    />
                  )}
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                  {selectedEvent.contextNote}
                </p>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                <span>{tacticalAnalysis.territory}</span>
                {selectedEvent.type === 'DEATH' && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Rapport {tacticalAnalysis.alliesCount}v{tacticalAnalysis.enemiesCount}
                    </span>
                  </>
                )}
                {tacticalAnalysis.overextended && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span className="text-amber-600 dark:text-amber-400 font-medium">Position avancée</span>
                  </>
                )}
                {tacticalAnalysis.nearBush && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Près de {tacticalAnalysis.nearBush.label}
                    </span>
                  </>
                )}
                {selectedEvent.nearObjectiveWindow && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span className="text-rose-600 dark:text-rose-400 font-medium">&lt;45s avant objectif</span>
                  </>
                )}
              </p>
            </div>

            {/* Détail approfondi uniquement en mode grand format (garde la vue d'ensemble ultra équilibrée) */}
            {isExpanded ? (
              <>
                <div className="py-3 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Tour alliée la plus proche
                    </div>
                    <div className="font-semibold text-sky-600 dark:text-sky-400 mt-0.5">
                      {tacticalAnalysis.nearestAllyTurret.label}
                    </div>
                    <div className="font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300">
                      {tacticalAnalysis.nearestAllyDist.toLocaleString('fr-FR')} u.
                    </div>
                  </div>

                  <div>
                    {tacticalAnalysis.snapshots.length > 0 ? (
                      <>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Couverture alliée ({selectedEvent.snapshotDeltaSec != null ? `-${selectedEvent.snapshotDeltaSec}s` : 'frame'})
                        </div>
                        <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          {tacticalAnalysis.nearbyAllies.length > 0
                            ? `${tacticalAnalysis.nearbyAllies.length} allié(s) proche(s)`
                            : 'Aucun allié proche'}
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                          {tacticalAnalysis.nearestAllySnap
                            ? `Plus proche : ${formatChampionDisplayName(champions, tacticalAnalysis.nearestAllySnap.championName)} (${riotDistance(
                                selectedEvent.x,
                                selectedEvent.y,
                                tacticalAnalysis.nearestAllySnap.x,
                                tacticalAnalysis.nearestAllySnap.y,
                              ).toLocaleString('fr-FR')} u.)`
                            : 'Positions Match-V5'}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Tour ennemie la plus proche
                        </div>
                        <div className="font-semibold text-rose-600 dark:text-rose-400 mt-0.5">
                          {tacticalAnalysis.nearestEnemyTurret.label}
                        </div>
                        <div className="font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300">
                          {tacticalAnalysis.nearestEnemyDist.toLocaleString('fr-FR')} u.
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="py-3 space-y-2">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    Pourquoi cette action s’est produite
                  </div>
                  <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {tacticalAnalysis.causes.map((c, idx) => (
                      <li key={idx} className="leading-relaxed">
                        • {c}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-sky-700 dark:text-sky-300 leading-relaxed pt-1">
                    <strong className="font-semibold">
                      Réflexe{playerDisplayName ? ` (${playerDisplayName})` : ''} :
                    </strong>{' '}
                    {tacticalAnalysis.tip}
                  </p>
                </div>

                {selectedEvent.damageBreakdown && selectedEvent.damageBreakdown.length > 0 && (
                  <div className="pt-3 space-y-2">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      Dégâts subis sur l’action
                    </div>
                    <div className="space-y-1.5">
                      {selectedEvent.damageBreakdown.map((dmg, i) => {
                        const maxTotal = selectedEvent.damageBreakdown![0].totalDamage || 1;
                        const pct = Math.min(100, Math.round((dmg.totalDamage / maxTotal) * 100));
                        const dmgIcon = resolveChampionIconUrl(dmg.sourceName);
                        const dmgLabel =
                          dmg.isEnemyChampion || dmg.sourceName !== 'Tourelle'
                            ? formatChampionDisplayName(champions, dmg.sourceName)
                            : dmg.sourceName;
                        return (
                          <div key={`${dmg.sourceName}-${i}`} className="text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                                {dmgIcon && (
                                  <img
                                    src={dmgIcon}
                                    alt={dmgLabel}
                                    className="w-4 h-4 rounded-full object-cover shrink-0"
                                  />
                                )}
                                {dmgLabel}
                              </span>
                              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                {dmg.totalDamage} dmg
                                {dmg.physicalDamage > 0 ? ` · ${dmg.physicalDamage} Phys.` : ''}
                                {dmg.magicDamage > 0 ? ` · ${dmg.magicDamage} Mag.` : ''}
                                {dmg.trueDamage > 0 ? ` · ${dmg.trueDamage} Brut` : ''}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mt-0.5">
                              <div className="h-full bg-rose-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="pt-3 flex items-center justify-between gap-4 text-[11px] text-slate-600 dark:text-slate-300">
                <span>
                  Tour alliée :{' '}
                  <strong className="text-sky-600 dark:text-sky-400 font-semibold">
                    {tacticalAnalysis.nearestAllyTurret.label}
                  </strong>{' '}
                  <span className="font-mono tabular-nums">
                    ({tacticalAnalysis.nearestAllyDist.toLocaleString('fr-FR')} u.)
                  </span>
                </span>
                {tacticalAnalysis.snapshots.length > 0 && (
                  <span className="shrink-0">
                    {tacticalAnalysis.nearbyAllies.length > 0
                      ? `${tacticalAnalysis.nearbyAllies.length} allié(s) proche(s)`
                      : 'Aucun allié proche'}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Chronologie filtrable */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              Chronologie ({visibleEvents.length})
            </div>
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800">
              {[
                { id: 'ALL' as const, label: `Tous (${events.length})` },
                { id: 'DEATH' as const, label: `Morts (${deathCount})` },
                { id: 'KILL' as const, label: `Kills (${killCount})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id)}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    filterType === tab.id
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {visibleEvents.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6">
              Aucun événement dans cette catégorie sur cette partie.
            </p>
          ) : (
            <div
              className={`${
                isExpanded ? 'max-h-[290px]' : 'max-h-[245px]'
              } overflow-y-auto thin-scrollbar divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl`}
            >
              {visibleEvents.map((ev, idx) => {
                const active = selectedEvent === ev;
                return (
                  <button
                    key={`${ev.timestampMs}-${idx}`}
                    type="button"
                    onClick={() => handleSelectEvent(ev)}
                    className={`w-full text-left px-3.5 py-2.5 transition-colors ${
                      active
                        ? 'bg-slate-100 dark:bg-slate-800/70'
                        : 'bg-white dark:bg-[#121722] hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={`text-xs font-semibold ${
                          ev.type === 'DEATH'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {ev.type === 'DEATH' ? 'Mort' : 'Élimination'} · {ev.zone}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {ev.minute} min
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                      {ev.contextNote}
                    </p>
                    {(ev.isolated || ev.nearObjectiveWindow) && (
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                        {ev.isolated && <span>Position isolée</span>}
                        {ev.isolated && ev.nearObjectiveWindow && <span aria-hidden="true">·</span>}
                        {ev.nearObjectiveWindow && <span>Pré-objectif (&lt;45s)</span>}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


