import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  ArrowLeftRight,
  GitCompareArrows,
  Radar,
  TrendingUp,
} from 'lucide-react';
import {
  computeFullChampionBuildStats,
  simulateCombatDamageAgainstTarget,
  type CombatTargetConfig,
  type FullBuildStatBreakdown,
  type RealTimeCombatDamageResult,
} from '../engines/buildSimulator.ts';
import type { RunePageSelection } from '../engines/runeEngine.ts';
import type {
  ChampionSummary,
  EnemyThreatSummary,
  ItemData,
  Role,
  RuneSlotItem,
  RuneTree,
} from '../engines/types.ts';
import { BuildRadarChart, type RadarAxisMetric } from './BuildRadarChart.tsx';
import { SafeGameIcon } from './SafeGameIcon.tsx';

export interface CompareBuildPreset {
  id: string;
  label: string;
  badge: string;
  items: ItemData[];
  runeSelection: RunePageSelection;
  heartsteelStacksHp: number;
}

interface BuildSideBySideCompareWidgetProps {
  champion: ChampionSummary;
  role: Role;
  runeTrees: RuneTree[];
  threats: EnemyThreatSummary;
  target: CombatTargetConfig;
  durationSec: number;
  spellCasts: number;
  currentLevel: number;
  onSelectLevel?: (level: number) => void;
  presets: CompareBuildPreset[];
}

type SpikeCurveMode = 'progressive' | 'full';

interface LevelPowerPoint {
  level: number;
  scoreA: number;
  scoreB: number;
  dpsA: number;
  dpsB: number;
  ehpA: number;
  ehpB: number;
  goldA: number;
  goldB: number;
  itemsCountA: number;
  itemsCountB: number;
  milestoneTagA?: string;
  milestoneTagB?: string;
  statsA: FullBuildStatBreakdown;
  statsB: FullBuildStatBreakdown;
  combatA: RealTimeCombatDamageResult;
  combatB: RealTimeCombatDamageResult;
}

const STAT_SHARD_LABELS: [string[], string[], string[]] = [
  ['+9 Force adaptative', '+10% Vit. attaque', '+8 Hâte'],
  ['+9 Force adaptative', '+2% Vit. déplac.', '+10–180 PV'],
  ['+65 PV fixes', '+10% Ténacité', '+10–180 PV'],
];

const CORE_UNLOCK_LEVELS = [6, 9, 12, 15, 17];
const BOOTS_UNLOCK_LEVEL = 4;

function isBootsItem(item: ItemData): boolean {
  return (
    item.tags.includes('Boots') ||
    (item.gold.total <= 1300 && /bottes|boots|coques|sandales|jambières|chaussures/i.test(item.name))
  );
}

function getItemsActiveAtLevel(
  allItems: ItemData[],
  level: number,
  mode: SpikeCurveMode,
): {
  activeItems: ItemData[];
  unlockedLabel?: string;
  upcomingRatio: number;
  upcomingGold: number;
} {
  if (mode === 'full') {
    return {
      activeItems: allItems.slice(0, 6),
      upcomingRatio: 0,
      upcomingGold: 0,
    };
  }

  const boots = allItems.filter((it) => isBootsItem(it));
  const core = allItems.filter((it) => !isBootsItem(it));
  const active: ItemData[] = [];
  let unlockedLabel: string | undefined;

  if (boots.length > 0 && level >= BOOTS_UNLOCK_LEVEL) {
    active.push(boots[0]);
    if (level === BOOTS_UNLOCK_LEVEL) {
      unlockedLabel = boots[0].name;
    }
  }

  let nextUnlockLevel: number | null = null;
  let prevUnlockLevel = 1;
  let upcomingGold = 0;

  core.slice(0, 5).forEach((item, idx) => {
    const unlockLvl = CORE_UNLOCK_LEVELS[idx] ?? 17;
    if (level >= unlockLvl) {
      active.push(item);
      if (level === unlockLvl) {
        unlockedLabel = item.name;
      }
      prevUnlockLevel = unlockLvl;
    } else if (nextUnlockLevel === null) {
      nextUnlockLevel = unlockLvl;
      upcomingGold = item.gold.total;
    }
  });

  const upcomingRatio =
    nextUnlockLevel && nextUnlockLevel > prevUnlockLevel
      ? Math.max(0, Math.min(1, (level - prevUnlockLevel) / (nextUnlockLevel - prevUnlockLevel)))
      : 0;

  return {
    activeItems: active.slice(0, 6),
    unlockedLabel,
    upcomingRatio,
    upcomingGold,
  };
}

function resolveRuneDetails(runeTrees: RuneTree[], selection: RunePageSelection) {
  const findRune = (id: number): RuneSlotItem | null => {
    for (const tree of runeTrees) {
      for (const slot of tree.slots) {
        const hit = slot.runes.find((r) => r.id === id);
        if (hit) return hit;
      }
    }
    return null;
  };

  const primaryTree = runeTrees.find((t) => t.id === selection.primaryTreeId) || null;
  const secondaryTree = runeTrees.find((t) => t.id === selection.secondaryTreeId) || null;
  const keystone = findRune(selection.keystoneId);
  const primaryMinors = selection.primaryMinorIds
    .map((id) => findRune(id))
    .filter((r): r is RuneSlotItem => Boolean(r));
  const secondaryMinors = selection.secondaryMinorIds
    .map((id) => findRune(id))
    .filter((r): r is RuneSlotItem => Boolean(r));

  const shards = [
    STAT_SHARD_LABELS[0][selection.shardIndices[0]] || '+9 Force adaptative',
    STAT_SHARD_LABELS[1][selection.shardIndices[1]] || '+9 Force adaptative',
    STAT_SHARD_LABELS[2][selection.shardIndices[2]] || '+65 PV fixes',
  ];

  return {
    primaryTree,
    secondaryTree,
    keystone,
    primaryMinors,
    secondaryMinors,
    shards,
  };
}

function scaleTargetForLevel(
  baseTarget: CombatTargetConfig,
  baseLevel: number,
  targetLevel: number,
): CombatTargetConfig {
  const safeBase = Math.max(1, baseLevel);
  const ratioHp = (0.38 + targetLevel * 0.048) / (0.38 + safeBase * 0.048);
  const ratioArmor = (0.45 + targetLevel * 0.042) / (0.45 + safeBase * 0.042);
  const ratioMr = (0.58 + targetLevel * 0.03) / (0.58 + safeBase * 0.03);
  return {
    ...baseTarget,
    hp: Math.max(520, Math.round(baseTarget.hp * ratioHp)),
    armor: Math.max(24, Math.round(baseTarget.armor * ratioArmor)),
    mr: Math.max(26, Math.round(baseTarget.mr * ratioMr)),
  };
}

function computePowerIndex(
  stats: FullBuildStatBreakdown,
  combat: RealTimeCombatDamageResult,
  level: number,
  upcomingGoldComponentBonus: number,
): number {
  const ultMultiplier = level >= 16 ? 1.15 : level >= 11 ? 1.09 : level >= 6 ? 1.04 : 1.0;
  const raw =
    combat.realDps * 0.23 +
    combat.totalMitigatedDamage * 0.024 +
    stats.combat.abilityImpactIndex * 0.08 +
    (stats.combat.physicalEhp + stats.combat.magicEhp) * 0.032 +
    stats.totals.abilityHaste * 0.78 +
    stats.combat.combatSustainPerSec * 0.45 +
    stats.combat.runeGoldValue * 0.015 +
    upcomingGoldComponentBonus;
  return Math.round(raw * ultMultiplier);
}

function SpikeLineOverlayChart({
  points,
  labelA,
  labelB,
  inspectedLevel,
  onSelectLevel,
}: {
  points: LevelPowerPoint[];
  labelA: string;
  labelB: string;
  inspectedLevel: number;
  onSelectLevel: (lvl: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredLevel, setHoveredLevel] = useState<number | null>(null);
  const clipIdPrefix = useId().replace(/:/g, '');

  const activePoint = useMemo(() => {
    const lvl = hoveredLevel ?? inspectedLevel;
    return points.find((p) => p.level === lvl) || points[points.length - 1];
  }, [points, hoveredLevel, inspectedLevel]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || points.length === 0) return;

    const width = 640;
    const height = 264;
    const margin = { top: 24, right: 20, bottom: 32, left: 46 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const maxScore = Math.max(
      120,
      ...points.map((p) => Math.max(p.scoreA, p.scoreB)),
    );
    const minScore = Math.max(
      0,
      Math.floor(Math.min(...points.map((p) => Math.min(p.scoreA, p.scoreB))) * 0.8),
    );

    const xScale = d3.scaleLinear().domain([1, 18]).range([0, innerW]);
    const yScale = d3
      .scaleLinear()
      .domain([minScore, Math.ceil(maxScore * 1.08)])
      .nice()
      .range([innerH, 0]);

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReducedMotion ? 0 : 420;

    const svg = d3.select(svgEl);
    let root = svg.select<SVGGElement>('g.spike-root');

    if (root.empty()) {
      const defs = svg.append('defs');
      defs
        .append('clipPath')
        .attr('id', `${clipIdPrefix}-above`)
        .append('path')
        .attr('class', 'clip-above-path');
      defs
        .append('clipPath')
        .attr('id', `${clipIdPrefix}-below`)
        .append('path')
        .attr('class', 'clip-below-path');

      root = svg
        .append('g')
        .attr('class', 'spike-root')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);

      root.append('g').attr('class', 'spike-grid');
      root.append('g').attr('class', 'spike-milestones');

      // Aires différentielles (A > B bleu, B > A ambre)
      root
        .append('path')
        .attr('class', 'spike-diff-b-above')
        .attr('clip-path', `url(#${clipIdPrefix}-above)`)
        .attr('fill', 'rgba(245, 158, 11, 0.16)');
      root
        .append('path')
        .attr('class', 'spike-diff-a-above')
        .attr('clip-path', `url(#${clipIdPrefix}-below)`)
        .attr('fill', 'rgba(14, 165, 233, 0.16)');

      root
        .append('path')
        .attr('class', 'spike-line-a fill-none')
        .attr('stroke', '#0ea5e9')
        .attr('stroke-width', 2.25)
        .attr('stroke-dasharray', '6,3');

      root
        .append('path')
        .attr('class', 'spike-line-b fill-none')
        .attr('stroke', '#f59e0b')
        .attr('stroke-width', 2.65);

      root.append('g').attr('class', 'spike-dots-a');
      root.append('g').attr('class', 'spike-dots-b');

      // Repère vertical interactif du niveau inspecté/survolé
      root
        .append('line')
        .attr('class', 'spike-focus-line stroke-slate-400 dark:stroke-slate-500')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3');

      root
        .append('circle')
        .attr('class', 'spike-focus-dot-a stroke-white dark:stroke-[#0D121C]')
        .attr('r', 5)
        .attr('fill', '#0ea5e9')
        .attr('stroke-width', 1.75);

      root
        .append('circle')
        .attr('class', 'spike-focus-dot-b stroke-white dark:stroke-[#0D121C]')
        .attr('r', 5.5)
        .attr('fill', '#f59e0b')
        .attr('stroke-width', 1.75);

      root.append('g').attr('class', 'spike-x-axis');
      root
        .append('rect')
        .attr('class', 'spike-hit-area fill-transparent cursor-crosshair')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', innerW)
        .attr('height', innerH);
    }

    // Grille horizontale
    const yTicks = yScale.ticks(4);
    const gridSel = root.select<SVGGElement>('g.spike-grid');
    gridSel
      .selectAll<SVGGElement, number>('g.y-grid-row')
      .data(yTicks, (d) => String(d))
      .join((enter) => {
        const g = enter.append('g').attr('class', 'y-grid-row');
        g.append('line')
          .attr('x1', 0)
          .attr('x2', innerW)
          .attr('class', 'stroke-slate-200 dark:stroke-slate-800')
          .attr('stroke-dasharray', '3,3');
        g.append('text')
          .attr('x', -8)
          .attr('text-anchor', 'end')
          .attr('dominant-baseline', 'central')
          .attr('class', 'fill-slate-400 dark:fill-slate-500 text-[10px] font-mono tabular-nums');
        return g;
      })
      .each(function (t) {
        const y = yScale(t);
        const g = d3.select(this);
        g.select('line').attr('y1', y).attr('y2', y);
        g.select('text').attr('y', y).text(`${t}`);
      });

    // Jalons R1 (Niv.6), R2 (Niv.11), R3 (Niv.16)
    const milestones = [
      { level: 6, label: 'Niv.6 (R1)' },
      { level: 11, label: 'Niv.11 (R2)' },
      { level: 16, label: 'Niv.16 (R3)' },
    ];
    root
      .select<SVGGElement>('g.spike-milestones')
      .selectAll<SVGGElement, (typeof milestones)[number]>('g.ms-col')
      .data(milestones, (d) => String(d.level))
      .join((enter) => {
        const g = enter.append('g').attr('class', 'ms-col');
        g.append('line')
          .attr('y1', 0)
          .attr('y2', innerH)
          .attr('class', 'stroke-slate-300/70 dark:stroke-slate-700/70')
          .attr('stroke-dasharray', '2,4');
        g.append('text')
          .attr('y', -8)
          .attr('text-anchor', 'middle')
          .attr('class', 'fill-slate-400 dark:fill-slate-500 text-[9px] font-mono font-semibold');
        return g;
      })
      .each(function (m) {
        const x = xScale(m.level);
        const g = d3.select(this);
        g.select('line').attr('x1', x).attr('x2', x);
        g.select('text').attr('x', x).text(m.label);
      });

    // Axe X (1..18)
    const xLevels = [1, 3, 6, 9, 11, 14, 16, 18];
    root
      .select<SVGGElement>('g.spike-x-axis')
      .selectAll<SVGTextElement, number>('text.x-lvl-label')
      .data(xLevels, (d) => String(d))
      .join((enter) =>
        enter
          .append('text')
          .attr('class', 'x-lvl-label fill-slate-400 dark:fill-slate-500 text-[10px] font-mono tabular-nums')
          .attr('text-anchor', 'middle')
          .attr('y', innerH + 18),
      )
      .attr('x', (d) => xScale(d))
      .text((d) => `N${d}`);

    // Générateurs de courbes et d'aires
    const lineA = d3
      .line<LevelPowerPoint>()
      .x((d) => xScale(d.level))
      .y((d) => yScale(d.scoreA))
      .curve(d3.curveMonotoneX);

    const lineB = d3
      .line<LevelPowerPoint>()
      .x((d) => xScale(d.level))
      .y((d) => yScale(d.scoreB))
      .curve(d3.curveMonotoneX);

    const areaBetween = d3
      .area<LevelPowerPoint>()
      .x((d) => xScale(d.level))
      .y0((d) => yScale(d.scoreA))
      .y1((d) => yScale(d.scoreB))
      .curve(d3.curveMonotoneX);

    const clipAboveArea = d3
      .area<LevelPowerPoint>()
      .x((d) => xScale(d.level))
      .y0(0)
      .y1((d) => yScale(d.scoreA))
      .curve(d3.curveMonotoneX);

    const clipBelowArea = d3
      .area<LevelPowerPoint>()
      .x((d) => xScale(d.level))
      .y0((d) => yScale(d.scoreA))
      .y1(innerH)
      .curve(d3.curveMonotoneX);

    svg.select(`#${clipIdPrefix}-above path`).attr('d', clipAboveArea(points) || '');
    svg.select(`#${clipIdPrefix}-below path`).attr('d', clipBelowArea(points) || '');

    root
      .select<SVGPathElement>('path.spike-diff-b-above')
      .transition()
      .duration(duration)
      .ease(d3.easeCubicOut)
      .attr('d', areaBetween(points) || '');

    root
      .select<SVGPathElement>('path.spike-diff-a-above')
      .transition()
      .duration(duration)
      .ease(d3.easeCubicOut)
      .attr('d', areaBetween(points) || '');

    root
      .select<SVGPathElement>('path.spike-line-a')
      .transition()
      .duration(duration)
      .ease(d3.easeCubicOut)
      .attr('d', lineA(points) || '');

    root
      .select<SVGPathElement>('path.spike-line-b')
      .transition()
      .duration(duration)
      .ease(d3.easeCubicOut)
      .attr('d', lineB(points) || '');

    // Marqueurs de spikes (R1/R2/R3 + déblocage d'objet)
    root
      .select<SVGGElement>('g.spike-dots-a')
      .selectAll<SVGCircleElement, LevelPowerPoint>('circle.dot-a')
      .data(points, (d) => String(d.level))
      .join((enter) =>
        enter
          .append('circle')
          .attr('class', 'dot-a pointer-events-none')
          .attr('fill', '#0ea5e9'),
      )
      .transition()
      .duration(duration)
      .ease(d3.easeCubicOut)
      .attr('cx', (d) => xScale(d.level))
      .attr('cy', (d) => yScale(d.scoreA))
      .attr('r', (d) => (d.milestoneTagA || d.level === 6 || d.level === 11 || d.level === 16 ? 3.5 : 2));

    root
      .select<SVGGElement>('g.spike-dots-b')
      .selectAll<SVGCircleElement, LevelPowerPoint>('circle.dot-b')
      .data(points, (d) => String(d.level))
      .join((enter) =>
        enter
          .append('circle')
          .attr('class', 'dot-b pointer-events-none')
          .attr('fill', '#f59e0b'),
      )
      .transition()
      .duration(duration)
      .ease(d3.easeCubicOut)
      .attr('cx', (d) => xScale(d.level))
      .attr('cy', (d) => yScale(d.scoreB))
      .attr('r', (d) => (d.milestoneTagB || d.level === 6 || d.level === 11 || d.level === 16 ? 3.8 : 2.1));

    // Positionner le curseur sur le niveau actif
    const focusLvl = hoveredLevel ?? inspectedLevel;
    const fp = points.find((p) => p.level === focusLvl) || points[points.length - 1];
    if (fp) {
      const fx = xScale(fp.level);
      root
        .select('line.spike-focus-line')
        .attr('x1', fx)
        .attr('x2', fx)
        .attr('y1', 0)
        .attr('y2', innerH);
      root
        .select('circle.spike-focus-dot-a')
        .attr('cx', fx)
        .attr('cy', yScale(fp.scoreA));
      root
        .select('circle.spike-focus-dot-b')
        .attr('cx', fx)
        .attr('cy', yScale(fp.scoreB));
    }

    // Interaction souris/clic pour inspecter chaque niveau 1..18
    const hitRect = root.select<SVGRectElement>('rect.spike-hit-area');
    hitRect
      .on('mousemove', (event) => {
        const [mx] = d3.pointer(event);
        const lvl = Math.max(1, Math.min(18, Math.round(xScale.invert(mx))));
        setHoveredLevel(lvl);
      })
      .on('mouseleave', () => setHoveredLevel(null))
      .on('click', (event) => {
        const [mx] = d3.pointer(event);
        const lvl = Math.max(1, Math.min(18, Math.round(xScale.invert(mx))));
        onSelectLevel(lvl);
      });
  }, [points, hoveredLevel, inspectedLevel, onSelectLevel, clipIdPrefix]);

  const deltaPts = activePoint ? activePoint.scoreB - activePoint.scoreA : 0;
  const deltaPct =
    activePoint && activePoint.scoreA > 0
      ? Math.round(((activePoint.scoreB - activePoint.scoreA) / activePoint.scoreA) * 1000) / 10
      : 0;

  return (
    <div className="space-y-3">
      <div className="w-full overflow-hidden">
        <svg
          ref={svgRef}
          viewBox="0 0 640 264"
          className="w-full h-auto block"
          role="img"
          aria-label={`Graphique D3 comparant les pics de puissance de niveau 1 à 18 entre ${labelA} et ${labelB}`}
        />
      </div>

      {/* Bandeau de lecture exacte du niveau survolé / sélectionné */}
      {activePoint && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
              Niv. {activePoint.level}
            </span>
            <span className="text-slate-400" aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-sky-600 dark:text-sky-400">
              A : <strong>{activePoint.scoreA} pts</strong> ({activePoint.dpsA}/s · {activePoint.ehpA} EHP)
            </span>
            <span className="text-slate-400" aria-hidden="true">vs</span>
            <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
              B : <strong>{activePoint.scoreB} pts</strong> ({activePoint.dpsB}/s · {activePoint.ehpB} EHP)
            </span>
          </div>
          <div className="font-mono tabular-nums font-semibold">
            {deltaPts === 0 ? (
              <span className="text-slate-500 dark:text-slate-400">Égalité parfaite</span>
            ) : deltaPts > 0 ? (
              <span className="text-amber-600 dark:text-amber-400">
                Build B +{deltaPts} pts ({deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`})
              </span>
            ) : (
              <span className="text-sky-600 dark:text-sky-400">
                Build A +{Math.abs(deltaPts)} pts ({Math.abs(deltaPct)}%)
              </span>
            )}
          </div>
        </div>
      )}

      {(activePoint?.milestoneTagA || activePoint?.milestoneTagB) && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
          {activePoint.milestoneTagA && (
            <span className="text-sky-600 dark:text-sky-400 font-medium">
              Spike A Niv.{activePoint.level} : {activePoint.milestoneTagA}
            </span>
          )}
          {activePoint.milestoneTagB && (
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              Spike B Niv.{activePoint.level} : {activePoint.milestoneTagB}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function BuildSideBySideCompareWidget({
  champion,
  role,
  runeTrees,
  threats,
  target,
  durationSec,
  spellCasts,
  currentLevel,
  onSelectLevel,
  presets,
}: BuildSideBySideCompareWidgetProps) {
  const [buildAId, setBuildAId] = useState<string>(() => presets[1]?.id || presets[0]?.id || 'recommended');
  const [buildBId, setBuildBId] = useState<string>(() => {
    const first = presets[1]?.id || presets[0]?.id;
    const alt = presets.find((p) => p.id !== first && p.id !== 'recommended') || presets[0];
    return alt?.id || 'sandbox';
  });
  const [curveMode, setCurveMode] = useState<SpikeCurveMode>('progressive');
  const [widgetLevel, setWidgetLevel] = useState<number>(currentLevel);

  useEffect(() => {
    setWidgetLevel(currentLevel);
  }, [currentLevel]);

  const presetA = useMemo(
    () => presets.find((p) => p.id === buildAId) || presets[1] || presets[0],
    [presets, buildAId],
  );
  const presetB = useMemo(
    () => presets.find((p) => p.id === buildBId) || presets[0],
    [presets, buildBId],
  );

  const handleSwap = () => {
    if (!presetA || !presetB) return;
    setBuildAId(presetB.id);
    setBuildBId(presetA.id);
  };

  const handleChooseLevel = (lvl: number) => {
    const clamped = Math.max(1, Math.min(18, lvl));
    setWidgetLevel(clamped);
    onSelectLevel?.(clamped);
  };

  // Calcul des 18 niveaux (Niv. 1 à 18) pour Build A et Build B
  const levelCurvePoints = useMemo<LevelPowerPoint[]>(() => {
    if (!presetA || !presetB) return [];
    const rows: LevelPowerPoint[] = [];

    for (let lvl = 1; lvl <= 18; lvl++) {
      const scaledTarget = scaleTargetForLevel(target, currentLevel, lvl);
      const progA = getItemsActiveAtLevel(presetA.items, lvl, curveMode);
      const progB = getItemsActiveAtLevel(presetB.items, lvl, curveMode);

      const stacksScale = curveMode === 'progressive' ? Math.max(0, Math.min(1, (lvl - 6) / 10)) : 1;
      const stacksA = Math.round(presetA.heartsteelStacksHp * stacksScale);
      const stacksB = Math.round(presetB.heartsteelStacksHp * stacksScale);

      const statsA = computeFullChampionBuildStats({
        champion,
        role,
        level: lvl,
        items: progA.activeItems,
        runeSelection: presetA.runeSelection,
        threats,
        heartsteelStacksHp: stacksA,
      });

      const statsB = computeFullChampionBuildStats({
        champion,
        role,
        level: lvl,
        items: progB.activeItems,
        runeSelection: presetB.runeSelection,
        threats,
        heartsteelStacksHp: stacksB,
      });

      const combatA = simulateCombatDamageAgainstTarget({
        champion,
        role,
        level: lvl,
        items: progA.activeItems,
        runeSelection: presetA.runeSelection,
        target: scaledTarget,
        durationSec,
        spellCasts,
        heartsteelStacksHp: stacksA,
        threats,
      });

      const combatB = simulateCombatDamageAgainstTarget({
        champion,
        role,
        level: lvl,
        items: progB.activeItems,
        runeSelection: presetB.runeSelection,
        target: scaledTarget,
        durationSec,
        spellCasts,
        heartsteelStacksHp: stacksB,
        threats,
      });

      const compBonusA = progA.upcomingGold * 0.008 * progA.upcomingRatio;
      const compBonusB = progB.upcomingGold * 0.008 * progB.upcomingRatio;

      const scoreA = computePowerIndex(statsA, combatA, lvl, compBonusA);
      const scoreB = computePowerIndex(statsB, combatB, lvl, compBonusB);

      const ehpA = Math.round((statsA.combat.physicalEhp + statsA.combat.magicEhp) / 2);
      const ehpB = Math.round((statsB.combat.physicalEhp + statsB.combat.magicEhp) / 2);

      rows.push({
        level: lvl,
        scoreA,
        scoreB,
        dpsA: combatA.realDps,
        dpsB: combatB.realDps,
        ehpA,
        ehpB,
        goldA: statsA.combat.totalGold,
        goldB: statsB.combat.totalGold,
        itemsCountA: progA.activeItems.length,
        itemsCountB: progB.activeItems.length,
        milestoneTagA: progA.unlockedLabel,
        milestoneTagB: progB.unlockedLabel,
        statsA,
        statsB,
        combatA,
        combatB,
      });
    }

    return rows;
  }, [
    presetA,
    presetB,
    target,
    currentLevel,
    curveMode,
    champion,
    role,
    threats,
    durationSec,
    spellCasts,
  ]);

  // Données du Radar D3 superposé au niveau inspecté (avec full build du preset comparé à ce niveau)
  const inspectedStatsAndRadar = useMemo(() => {
    if (!presetA || !presetB) return null;
    const scaledTarget = scaleTargetForLevel(target, currentLevel, widgetLevel);

    const statsA = computeFullChampionBuildStats({
      champion,
      role,
      level: widgetLevel,
      items: presetA.items,
      runeSelection: presetA.runeSelection,
      threats,
      heartsteelStacksHp: presetA.heartsteelStacksHp,
    });
    const statsB = computeFullChampionBuildStats({
      champion,
      role,
      level: widgetLevel,
      items: presetB.items,
      runeSelection: presetB.runeSelection,
      threats,
      heartsteelStacksHp: presetB.heartsteelStacksHp,
    });

    const combatA = simulateCombatDamageAgainstTarget({
      champion,
      role,
      level: widgetLevel,
      items: presetA.items,
      runeSelection: presetA.runeSelection,
      target: scaledTarget,
      durationSec,
      spellCasts,
      heartsteelStacksHp: presetA.heartsteelStacksHp,
      threats,
    });
    const combatB = simulateCombatDamageAgainstTarget({
      champion,
      role,
      level: widgetLevel,
      items: presetB.items,
      runeSelection: presetB.runeSelection,
      target: scaledTarget,
      durationSec,
      spellCasts,
      heartsteelStacksHp: presetB.heartsteelStacksHp,
      threats,
    });

    const computeRaw = (st: FullBuildStatBreakdown, cb: RealTimeCombatDamageResult) => {
      const damageRaw =
        cb.realDps * 1.45 +
        cb.totalMitigatedDamage * 0.12 +
        st.combat.abilityImpactIndex * 0.35 +
        st.combat.autoDps * 0.45;
      const defenseRaw =
        (st.combat.physicalEhp + st.combat.magicEhp) * 0.5 +
        cb.combatHealingTotal * 1.15 +
        (st.totals.aaDamageReductionPct + st.totals.critDamageReductionPct) * 35;
      const utilityRaw =
        120 +
        st.totals.abilityHaste * 14 +
        st.totals.antiHealPct * 6 +
        st.totals.tenacityPct * 12 +
        st.totals.healShieldPowerPct * 18 +
        st.totals.healShieldReceivedPct * 10 +
        st.totals.manaRegenPct * 1.8 +
        (st.totals.lifeStealPct + st.totals.omnivampPct) * 16 +
        st.combat.runeGoldValue * 0.12;
      const bonusMs = Math.max(0, st.totals.moveSpeed - st.sources.moveSpeed.base);
      const mobilityRaw =
        st.totals.moveSpeed * 0.9 +
        bonusMs * 3.5 +
        Math.min(2.5, st.totals.attackSpeed) * 45 +
        st.totals.abilityHaste * 1.4;
      return { damageRaw, defenseRaw, utilityRaw, mobilityRaw };
    };

    const rawA = computeRaw(statsA, combatA);
    const rawB = computeRaw(statsB, combatB);
    const norm = (bVal: number, aVal: number, floor: number) => {
      const ceil = Math.max(bVal, aVal, floor) * 1.08;
      return {
        b: Math.min(100, Math.max(8, Math.round((bVal / ceil) * 100))),
        a: Math.min(100, Math.max(8, Math.round((aVal / ceil) * 100))),
      };
    };

    const dmg = norm(rawB.damageRaw, rawA.damageRaw, 350 + widgetLevel * 95);
    const def = norm(rawB.defenseRaw, rawA.defenseRaw, 1800 + widgetLevel * 210);
    const uti = norm(rawB.utilityRaw, rawA.utilityRaw, 460 + widgetLevel * 24);
    const mob = norm(rawB.mobilityRaw, rawA.mobilityRaw, 460);

    const ehpA = Math.round((statsA.combat.physicalEhp + statsA.combat.magicEhp) / 2);
    const ehpB = Math.round((statsB.combat.physicalEhp + statsB.combat.magicEhp) / 2);

    const axes: RadarAxisMetric[] = [
      {
        key: 'damage',
        label: 'Dégâts',
        currentScore: dmg.b,
        referenceScore: dmg.a,
        currentDetail: `${combatB.realDps}/s DPS · ${combatB.totalMitigatedDamage} dég.`,
        referenceDetail: `${combatA.realDps}/s DPS · ${combatA.totalMitigatedDamage} dég.`,
      },
      {
        key: 'defense',
        label: 'Résistance',
        currentScore: def.b,
        referenceScore: def.a,
        currentDetail: `${ehpB} EHP moy. · ${statsB.totals.hp} PV`,
        referenceDetail: `${ehpA} EHP moy. · ${statsA.totals.hp} PV`,
      },
      {
        key: 'utility',
        label: 'Utilité',
        currentScore: uti.b,
        referenceScore: uti.a,
        currentDetail: `${statsB.totals.abilityHaste} Hâte (${statsB.totals.cooldownReductionPct}% CDR)`,
        referenceDetail: `${statsA.totals.abilityHaste} Hâte (${statsA.totals.cooldownReductionPct}% CDR)`,
      },
      {
        key: 'mobility',
        label: 'Mobilité',
        currentScore: mob.b,
        referenceScore: mob.a,
        currentDetail: `${statsB.totals.moveSpeed} Vit. · ${statsB.totals.attackSpeed.toFixed(2)} AS`,
        referenceDetail: `${statsA.totals.moveSpeed} Vit. · ${statsA.totals.attackSpeed.toFixed(2)} AS`,
      },
    ];

    const pointAtLvl = levelCurvePoints.find((p) => p.level === widgetLevel);

    return {
      statsA,
      statsB,
      combatA,
      combatB,
      ehpA,
      ehpB,
      scoreA: pointAtLvl?.scoreA ?? computePowerIndex(statsA, combatA, widgetLevel, 0),
      scoreB: pointAtLvl?.scoreB ?? computePowerIndex(statsB, combatB, widgetLevel, 0),
      axes,
    };
  }, [
    presetA,
    presetB,
    target,
    currentLevel,
    widgetLevel,
    champion,
    role,
    threats,
    durationSec,
    spellCasts,
    levelCurvePoints,
  ]);

  const phaseInsights = useMemo(() => {
    if (levelCurvePoints.length === 0) return null;
    const avgSlice = (from: number, to: number) => {
      const sub = levelCurvePoints.filter((p) => p.level >= from && p.level <= to);
      const a = sub.reduce((s, p) => s + p.scoreA, 0) / Math.max(1, sub.length);
      const b = sub.reduce((s, p) => s + p.scoreB, 0) / Math.max(1, sub.length);
      const pct = a > 0 ? Math.round(((b - a) / a) * 1000) / 10 : 0;
      return {
        winner: Math.abs(pct) < 1 ? 'Égalité' : pct > 0 ? 'Build B' : 'Build A',
        pct: Math.abs(pct),
      };
    };

    let crossover: string | null = null;
    for (let i = 1; i < levelCurvePoints.length; i++) {
      const prev = levelCurvePoints[i - 1];
      const curr = levelCurvePoints[i];
      if (prev.scoreA >= prev.scoreB && curr.scoreB > curr.scoreA) {
        crossover = `Build B passe devant au Niv. ${curr.level}`;
        break;
      }
      if (prev.scoreB >= prev.scoreA && curr.scoreA > curr.scoreB) {
        crossover = `Build A passe devant au Niv. ${curr.level}`;
        break;
      }
    }

    return {
      early: avgSlice(1, 6),
      mid: avgSlice(7, 13),
      late: avgSlice(14, 18),
      crossover,
    };
  }, [levelCurvePoints]);

  const runesA = useMemo(
    () => (presetA ? resolveRuneDetails(runeTrees, presetA.runeSelection) : null),
    [runeTrees, presetA],
  );
  const runesB = useMemo(
    () => (presetB ? resolveRuneDetails(runeTrees, presetB.runeSelection) : null),
    [runeTrees, presetB],
  );

  if (!presetA || !presetB || !inspectedStatsAndRadar || !runesA || !runesB) {
    return null;
  }

  const renderBuildCard = (
    side: 'A' | 'B',
    preset: CompareBuildPreset,
    selectedId: string,
    onChangeId: (next: string) => void,
    runes: ReturnType<typeof resolveRuneDetails>,
    stats: FullBuildStatBreakdown,
    combat: RealTimeCombatDamageResult,
    ehp: number,
    powerScore: number,
  ) => {
    const isA = side === 'A';
    const accentText = isA ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400';
    const borderTone = isA
      ? 'border-sky-500/30 bg-sky-500/[0.03] dark:bg-[#0D1320]'
      : 'border-amber-500/30 bg-amber-500/[0.03] dark:bg-[#131218]';

    return (
      <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${borderTone}`}>
        {/* Sélecteur & coût */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/80 dark:border-white/[0.08]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className={`text-xs font-bold whitespace-nowrap ${accentText}`}>
              Build {side}
            </span>
            <select
              aria-label={`Choisir le Build ${side} à comparer`}
              value={selectedId}
              onChange={(e) => onChangeId(e.target.value)}
              className="flex-1 min-w-[160px] h-8 px-2.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-white/[0.12] bg-white dark:bg-[#0A0D14] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {presets.map((p) => (
                <option key={`${side}-${p.id}`} value={p.id}>
                  {p.label} · {p.badge}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-300">
            {stats.combat.totalGold} po
          </span>
        </div>

        {/* 6 Objets */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              Équipement complet ({preset.items.length}/6)
            </span>
            <span className="font-mono tabular-nums">
              Efficacité or : {stats.combat.goldEfficiencyPct}%
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {Array.from({ length: 6 }, (_, idx) => {
              const item = preset.items[idx] || null;
              return (
                <div
                  key={`${side}-slot-${idx}`}
                  title={item ? `${item.name} (${item.gold.total} po)` : `Emplacement ${idx + 1} vide`}
                  className="rounded-lg border border-slate-200/80 dark:border-white/[0.08] bg-white/85 dark:bg-[#0B0E15] p-1.5 flex flex-col items-center text-center gap-1 min-w-0"
                >
                  {item ? (
                    <>
                      <SafeGameIcon
                        src={item.imageUrl}
                        alt={item.name}
                        fallbackLabel={item.name}
                        sizeClass="w-8 h-8"
                      />
                      <span className="text-[10px] leading-tight font-medium text-slate-700 dark:text-slate-200 truncate w-full">
                        {item.name}
                      </span>
                      <span className="text-[9px] font-mono tabular-nums text-amber-600 dark:text-amber-400">
                        {item.gold.total} po
                      </span>
                    </>
                  ) : (
                    <div className="h-[58px] flex items-center justify-center text-[10px] text-slate-400">
                      Vide
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Page de Runes complète (Principale + Secondaire + Éclats) */}
        <div className="space-y-2 pt-2 border-t border-slate-200/70 dark:border-white/[0.06]">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              Page de Runes ({runes.primaryTree?.name || 'Principal'} + {runes.secondaryTree?.name || 'Secondaire'})
            </span>
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Valeur runes : ~{stats.combat.runeGoldValue} po
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-[#0B0E15] px-3 py-2.5">
            {/* Fondamentale + 3 mineures */}
            <div className="flex items-center gap-2 min-w-0">
              {runes.keystone && (
                <div className="flex items-center gap-2 pr-2 border-r border-slate-200 dark:border-white/[0.08]">
                  <SafeGameIcon
                    src={runes.keystone.imageUrl}
                    alt={runes.keystone.name}
                    fallbackLabel={runes.keystone.name}
                    sizeClass="w-8 h-8 rounded-full"
                  />
                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[125px]">
                    {runes.keystone.name}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                {runes.primaryMinors.map((r) => (
                  <div key={`${side}-pm-${r.id}`} title={r.name}>
                    <SafeGameIcon
                      src={r.imageUrl}
                      alt={r.name}
                      fallbackLabel={r.name}
                      sizeClass="w-6 h-6 rounded-full"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 2 secondaires */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-white/[0.08]">
              {runes.secondaryMinors.map((r) => (
                <div key={`${side}-sm-${r.id}`} title={r.name}>
                  <SafeGameIcon
                    src={r.imageUrl}
                    alt={r.name}
                    fallbackLabel={r.name}
                    sizeClass="w-6 h-6 rounded-full"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 3 éclats de stats */}
          <div className="text-[11px] text-slate-600 dark:text-slate-300 font-mono tabular-nums">
            Éclats : {runes.shards.join(' · ')}
          </div>
        </div>

        {/* 4 métriques instantanées au niveau inspecté */}
        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-200/70 dark:border-white/[0.06] text-center">
          <div className="rounded-lg bg-white/80 dark:bg-[#0B0E15] border border-slate-200/70 dark:border-white/[0.06] px-2 py-1.5">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Puissance</div>
            <div className={`text-sm font-bold font-mono tabular-nums ${accentText}`}>
              {powerScore}
            </div>
          </div>
          <div className="rounded-lg bg-white/80 dark:bg-[#0B0E15] border border-slate-200/70 dark:border-white/[0.06] px-2 py-1.5">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">DPS réel</div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {combat.realDps}/s
            </div>
          </div>
          <div className="rounded-lg bg-white/80 dark:bg-[#0B0E15] border border-slate-200/70 dark:border-white/[0.06] px-2 py-1.5">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">EHP moy.</div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {ehp}
            </div>
          </div>
          <div className="rounded-lg bg-white/80 dark:bg-[#0B0E15] border border-slate-200/70 dark:border-white/[0.06] px-2 py-1.5">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Hâte / Vit.</div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {stats.totals.abilityHaste} · {stats.totals.moveSpeed}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      id="comparateur-cote-a-cote"
      className="rounded-2xl apple-surface p-5 sm:p-6 space-y-5 scroll-mt-24"
    >
      {/* En-tête du comparateur */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/[0.08]">
        <div className="space-y-1 min-w-0">
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4 text-sky-500 shrink-0" aria-hidden="true" />
            <span>
              Comparateur Côte à Côte · Runes, Objets, Radar &amp; Spikes (Niv. 1–18)
            </span>
          </h2>
          <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
            Comparez deux configurations complètes (6 objets + page de runes) sur le même radar D3 et observez leurs pics de puissance du niveau 1 à 18 contre {target.name}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Paliers rapides de niveau 1..18 */}
          <div
            className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 text-xs"
            role="group"
            aria-label="Niveau inspecté pour le comparateur"
          >
            {[1, 6, 11, 16, 18].map((lvl) => (
              <button
                key={`cmp-lvl-${lvl}`}
                type="button"
                onClick={() => handleChooseLevel(lvl)}
                className={`px-2 py-1 rounded font-mono tabular-nums transition-colors whitespace-nowrap ${
                  widgetLevel === lvl
                    ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-white font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                N.{lvl}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSwap}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-white/[0.12] bg-slate-50 dark:bg-[#141924] text-slate-800 dark:text-slate-100 hover:border-sky-500/50 transition-colors whitespace-nowrap"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" />
            <span>Inverser A ↔ B</span>
          </button>
        </div>
      </div>

      {/* 1. Affichage côte à côte des 2 builds complets (Runes + Objets) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {renderBuildCard(
          'A',
          presetA,
          presetA.id,
          setBuildAId,
          runesA,
          inspectedStatsAndRadar.statsA,
          inspectedStatsAndRadar.combatA,
          inspectedStatsAndRadar.ehpA,
          inspectedStatsAndRadar.scoreA,
        )}
        {renderBuildCard(
          'B',
          presetB,
          presetB.id,
          setBuildBId,
          runesB,
          inspectedStatsAndRadar.statsB,
          inspectedStatsAndRadar.combatB,
          inspectedStatsAndRadar.ehpB,
          inspectedStatsAndRadar.scoreB,
        )}
      </div>

      {/* 2. Superposition Radar D3 + Superposition Courbe de Spikes Niveau 1 à 18 */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        {/* Colonne Gauche : Radar D3 superposé */}
        <div className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Radar className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <span>Radar D3 superposé · Niv. {widgetLevel}</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Profil global au niveau {widgetLevel} : Build B (Ambre) face au Build A (Bleu).
            </p>
          </div>

          <BuildRadarChart
            axes={inspectedStatsAndRadar.axes}
            currentLabel={`Build B (${presetB.label})`}
            referenceLabel={`Build A (${presetA.label})`}
          />

          <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] pt-2 border-t border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <span className="inline-block w-3 h-3 rounded-sm bg-sky-500/25 border-2 border-dashed border-sky-500" />
              <span className="font-semibold truncate max-w-[140px]">A : {presetA.label}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <span className="inline-block w-3 h-3 rounded-sm bg-amber-500/40 border-2 border-amber-500" />
              <span className="font-semibold truncate max-w-[140px]">B : {presetB.label}</span>
            </div>
          </div>
        </div>

        {/* Colonne Droite : Courbe D3 des Spikes Niveau 1 à 18 */}
        <div className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-sky-500 shrink-0" aria-hidden="true" />
                <span>Pics de puissance (Spikes) · Niveau 1 à 18</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Survolez ou cliquez sur un niveau pour inspecter l’écart exact et actualiser le radar.
              </p>
            </div>

            <div
              role="group"
              aria-label="Mode de courbe des pics de puissance"
              className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-[#121722] border border-slate-200 dark:border-slate-800 self-start shrink-0"
            >
              <button
                type="button"
                onClick={() => setCurveMode('progressive')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  curveMode === 'progressive'
                    ? 'bg-white dark:bg-[#1B2233] text-slate-900 dark:text-white font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Powerspikes réels
              </button>
              <button
                type="button"
                onClick={() => setCurveMode('full')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  curveMode === 'full'
                    ? 'bg-white dark:bg-[#1B2233] text-slate-900 dark:text-white font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                6 objets complets
              </button>
            </div>
          </div>

          <SpikeLineOverlayChart
            points={levelCurvePoints}
            labelA={presetA.label}
            labelB={presetB.label}
            inspectedLevel={widgetLevel}
            onSelectLevel={handleChooseLevel}
          />

          {/* Synthèse par phase de jeu (Early / Mid / Late + Crossover) */}
          {phaseInsights && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-800 text-xs">
              {[
                { label: 'Early (Niv. 1–6)', data: phaseInsights.early },
                { label: 'Mid Spike (Niv. 7–13)', data: phaseInsights.mid },
                { label: 'Late (Niv. 14–18)', data: phaseInsights.late },
              ].map((ph) => (
                <div
                  key={ph.label}
                  className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111622] px-3 py-2 flex items-center justify-between gap-2"
                >
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {ph.label}
                  </span>
                  <span
                    className={`font-mono tabular-nums font-semibold text-[11px] ${
                      ph.data.winner === 'Build B'
                        ? 'text-amber-600 dark:text-amber-400'
                        : ph.data.winner === 'Build A'
                          ? 'text-sky-600 dark:text-sky-400'
                          : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {ph.data.winner === 'Égalité'
                      ? 'Égalité'
                      : `${ph.data.winner} +${ph.data.pct}%`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {phaseInsights?.crossover && (
            <div className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
              Point de bascule détecté :{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {phaseInsights.crossover}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
