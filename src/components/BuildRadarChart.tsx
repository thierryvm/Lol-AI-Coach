import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';

export interface RadarAxisMetric {
  key: 'damage' | 'defense' | 'utility' | 'mobility';
  label: string;
  currentScore: number;
  referenceScore: number;
  currentDetail: string;
  referenceDetail: string;
}

interface BuildRadarChartProps {
  axes: RadarAxisMetric[];
  currentLabel: string;
  referenceLabel: string;
}

const SVG_WIDTH = 440;
const SVG_HEIGHT = 340;
const CENTER_X = SVG_WIDTH / 2;
const CENTER_Y = SVG_HEIGHT / 2 + 2;
const RADIUS = 94;
const GRID_LEVELS = [25, 50, 75, 100];
const TRANSITION_MS = 520;

export function BuildRadarChart({
  axes,
  currentLabel,
  referenceLabel,
}: BuildRadarChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredAxisKey, setHoveredAxisKey] = useState<RadarAxisMetric['key'] | null>(null);
  const [recentShifts, setRecentShifts] = useState<
    Array<{ key: RadarAxisMetric['key']; label: string; delta: number }>
  >([]);

  // Scores instantanés en cours d'animation (pour repartir sans saut en cas d'interruption rapide)
  const liveCurrScoresRef = useRef<number[] | null>(null);
  const liveRefScoresRef = useRef<number[] | null>(null);
  // Derniers scores cibles validés (pour détecter exactement quels axes viennent de bouger)
  const prevTargetCurrRef = useRef<number[] | null>(null);

  const hoveredAxis = useMemo(
    () => axes.find((a) => a.key === hoveredAxisKey) || null,
    [axes, hoveredAxisKey],
  );

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || axes.length === 0) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReducedMotion ? 0 : TRANSITION_MS;

    const svg = d3.select(svgEl);
    const angleSlice = (Math.PI * 2) / axes.length;
    const rScale = d3.scaleLinear().domain([0, 100]).range([0, RADIUS]);

    const pointAt = (index: number, score: number): [number, number] => {
      const angle = index * angleSlice - Math.PI / 2;
      const r = rScale(Math.max(0, Math.min(100, score)));
      return [Math.cos(angle) * r, Math.sin(angle) * r];
    };

    const polygonLine = d3
      .line<[number, number]>()
      .x((d) => d[0])
      .y((d) => d[1])
      .curve(d3.curveLinearClosed);

    // 1. Initialisation unique des couches SVG persistantes (pour permettre les transitions fluides)
    let root = svg.select<SVGGElement>('g.radar-root');
    const isInitialMount = root.empty();

    if (isInitialMount) {
      root = svg
        .append('g')
        .attr('class', 'radar-root')
        .attr('transform', `translate(${CENTER_X}, ${CENTER_Y})`);

      // Grilles concentriques statiques (25 / 50 / 75 / 100)
      const gridGroup = root.append('g').attr('class', 'radar-grid');
      GRID_LEVELS.forEach((level) => {
        const ringPoints = axes.map((_, i) => pointAt(i, level));
        gridGroup
          .append('path')
          .datum(ringPoints)
          .attr('d', polygonLine)
          .attr(
            'class',
            level === 100
              ? 'fill-slate-200/20 dark:fill-slate-800/25 stroke-slate-300 dark:stroke-slate-700'
              : 'fill-none stroke-slate-200 dark:stroke-slate-800',
          )
          .attr('stroke-width', level === 100 ? 1.25 : 1)
          .attr('stroke-dasharray', level === 100 ? null : '3,3');

        gridGroup
          .append('text')
          .attr('x', 4)
          .attr('y', -rScale(level) + 3)
          .attr('class', 'fill-slate-400 dark:fill-slate-500 text-[9px] font-mono tabular-nums')
          .text(`${level}`);
      });

      const axesGroup = root.append('g').attr('class', 'radar-axes');
      axes.forEach((axis, i) => {
        const [outerX, outerY] = pointAt(i, 100);
        axesGroup
          .append('line')
          .attr('x1', 0)
          .attr('y1', 0)
          .attr('x2', outerX)
          .attr('y2', outerY)
          .attr('class', 'stroke-slate-300 dark:stroke-slate-700')
          .attr('stroke-width', 1);
      });

      // Polygones Référence puis Actuel initialisés à 0 pour l'entrée fluide
      const zeroPath = polygonLine(axes.map((_, i) => pointAt(i, 0))) || '';

      root
        .append('path')
        .attr('class', 'radar-ref-area')
        .attr('d', zeroPath)
        .attr('fill', 'rgba(14, 165, 233, 0.14)')
        .attr('stroke', '#0ea5e9')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,3');

      root
        .append('path')
        .attr('class', 'radar-curr-area')
        .attr('d', zeroPath)
        .attr('fill', 'rgba(245, 158, 11, 0.24)')
        .attr('stroke', '#f59e0b')
        .attr('stroke-width', 2.4);

      root.append('g').attr('class', 'radar-pulse-layer');
      root.append('g').attr('class', 'radar-ref-vertices');
      root.append('g').attr('class', 'radar-curr-vertices');
    }

    const targetCurrScores = axes.map((a) => Math.max(0, Math.min(100, a.currentScore)));
    const targetRefScores = axes.map((a) => Math.max(0, Math.min(100, a.referenceScore)));

    const zeroScores = axes.map(() => 0);
    const startCurrScores =
      liveCurrScoresRef.current && liveCurrScoresRef.current.length === axes.length
        ? [...liveCurrScoresRef.current]
        : zeroScores;
    const startRefScores =
      liveRefScoresRef.current && liveRefScoresRef.current.length === axes.length
        ? [...liveRefScoresRef.current]
        : zeroScores;

    // Détection des axes qui ont changé depuis la dernière configuration (hors montage initial)
    const prevCurr = prevTargetCurrRef.current;
    const shifts: Array<{ key: RadarAxisMetric['key']; label: string; delta: number }> = [];
    if (prevCurr && prevCurr.length === axes.length) {
      axes.forEach((ax, idx) => {
        const diff = Math.round(targetCurrScores[idx] - prevCurr[idx]);
        if (diff !== 0) {
          shifts.push({ key: ax.key, label: ax.label, delta: diff });
        }
      });
    }
    if (shifts.length > 0) {
      setRecentShifts(shifts);
    }

    // 2. Mise à jour fluide des libellés d'axes et compteur animé (D3 tween)
    const axesGroup = root.select<SVGGElement>('g.radar-axes');
    const axisLabels = axesGroup
      .selectAll<SVGTextElement, RadarAxisMetric>('text.radar-axis-label')
      .data(axes, (d) => d.key)
      .join((enter) => {
        const textEl = enter
          .append('text')
          .attr('class', 'radar-axis-label cursor-pointer select-none')
          .attr('dominant-baseline', 'central');

        textEl.append('tspan').attr('class', 'axis-title-tspan fill-slate-800 dark:fill-slate-100 text-[12px] font-semibold').attr('dy', '-0.35em');
        textEl.append('tspan').attr('class', 'axis-score-tspan text-[10px] font-mono tabular-nums').attr('dy', '1.25em');
        return textEl;
      });

    axisLabels
      .on('mouseenter', (_, d) => setHoveredAxisKey(d.key))
      .on('mouseleave', () => setHoveredAxisKey(null))
      .each(function (axis, i) {
        const angle = i * angleSlice - Math.PI / 2;
        const labelDist = RADIUS + 20;
        const lx = Math.cos(angle) * labelDist;
        const ly = Math.sin(angle) * labelDist;
        const anchor =
          Math.abs(Math.cos(angle)) < 0.2
            ? 'middle'
            : Math.cos(angle) > 0
              ? 'start'
              : 'end';

        const textSel = d3.select(this);
        textSel.attr('x', lx).attr('y', ly).attr('text-anchor', anchor);
        textSel.select('tspan.axis-title-tspan').attr('x', lx).text(axis.label);

        const delta = axis.currentScore - axis.referenceScore;
        const scoreTspan = textSel
          .select<SVGTSpanElement>('tspan.axis-score-tspan')
          .attr('x', lx)
          .attr(
            'class',
            delta > 0
              ? 'axis-score-tspan fill-emerald-600 dark:fill-emerald-400 text-[10px] font-mono font-semibold tabular-nums'
              : delta < 0
                ? 'axis-score-tspan fill-rose-600 dark:fill-rose-400 text-[10px] font-mono font-semibold tabular-nums'
                : 'axis-score-tspan fill-slate-500 dark:fill-slate-400 text-[10px] font-mono tabular-nums',
          );

        const fromC = startCurrScores[i] ?? 0;
        const toC = targetCurrScores[i];
        const fromR = startRefScores[i] ?? 0;
        const toR = targetRefScores[i];

        if (duration === 0) {
          scoreTspan.text(
            `${toC} vs ${toR}${delta !== 0 ? ` (${delta > 0 ? `+${delta}` : delta})` : ''}`,
          );
        } else {
          scoreTspan
            .interrupt('score-text')
            .transition('score-text')
            .duration(duration)
            .ease(d3.easeCubicOut)
            .tween('text', function () {
              const iCurr = d3.interpolateNumber(fromC, toC);
              const iRef = d3.interpolateNumber(fromR, toR);
              return (t) => {
                const cVal = Math.round(iCurr(t));
                const rVal = Math.round(iRef(t));
                const dVal = cVal - rVal;
                this.textContent = `${cVal} vs ${rVal}${
                  dVal !== 0 ? ` (${dVal > 0 ? `+${dVal}` : dVal})` : ''
                }`;
              };
            });
        }
      });

    // 3. Morphing D3 fluide des deux polygones (Référence & Actuel)
    const refArea = root.select<SVGPathElement>('path.radar-ref-area');
    const currArea = root.select<SVGPathElement>('path.radar-curr-area');

    if (duration === 0) {
      liveRefScoresRef.current = targetRefScores;
      liveCurrScoresRef.current = targetCurrScores;
      refArea.attr('d', polygonLine(targetRefScores.map((s, i) => pointAt(i, s))) || '');
      currArea.attr('d', polygonLine(targetCurrScores.map((s, i) => pointAt(i, s))) || '');
    } else {
      refArea
        .interrupt('ref-area')
        .transition('ref-area')
        .duration(duration)
        .ease(d3.easeCubicOut)
        .attrTween('d', () => {
          const interp = d3.interpolateArray(startRefScores, targetRefScores);
          return (t) => {
            const interpolated = interp(t);
            liveRefScoresRef.current = interpolated;
            return polygonLine(interpolated.map((s, i) => pointAt(i, s))) || '';
          };
        });

      currArea
        .interrupt('curr-area')
        .transition('curr-area')
        .duration(duration)
        .ease(d3.easeCubicOut)
        .attrTween('d', () => {
          const interp = d3.interpolateArray(startCurrScores, targetCurrScores);
          return (t) => {
            const interpolated = interp(t);
            liveCurrScoresRef.current = interpolated;
            return polygonLine(interpolated.map((s, i) => pointAt(i, s))) || '';
          };
        });
    }

    // 4. Transition fluide des sommets (cercles Référence & Actuel) + halo sur les axes modifiés
    const refVerticesGroup = root.select<SVGGElement>('g.radar-ref-vertices');
    const currVerticesGroup = root.select<SVGGElement>('g.radar-curr-vertices');
    const pulseLayer = root.select<SVGGElement>('g.radar-pulse-layer');

    const refCircles = refVerticesGroup
      .selectAll<SVGCircleElement, RadarAxisMetric>('circle.radar-ref-dot')
      .data(axes, (d) => d.key)
      .join((enter) =>
        enter
          .append('circle')
          .attr('class', 'radar-ref-dot stroke-white dark:stroke-[#0D121C] cursor-pointer')
          .attr('r', 3.5)
          .attr('fill', '#0ea5e9')
          .attr('stroke-width', 1.5)
          .attr('cx', (_, i) => pointAt(i, startRefScores[i] ?? 0)[0])
          .attr('cy', (_, i) => pointAt(i, startRefScores[i] ?? 0)[1]),
      );

    refCircles
      .on('mouseenter', (_, d) => setHoveredAxisKey(d.key))
      .on('mouseleave', () => setHoveredAxisKey(null));

    if (duration === 0) {
      refCircles
        .attr('cx', (_, i) => pointAt(i, targetRefScores[i])[0])
        .attr('cy', (_, i) => pointAt(i, targetRefScores[i])[1]);
    } else {
      refCircles
        .interrupt('ref-dot')
        .transition('ref-dot')
        .duration(duration)
        .ease(d3.easeCubicOut)
        .attr('cx', (_, i) => pointAt(i, targetRefScores[i])[0])
        .attr('cy', (_, i) => pointAt(i, targetRefScores[i])[1]);
    }

    const currCircles = currVerticesGroup
      .selectAll<SVGCircleElement, RadarAxisMetric>('circle.radar-curr-dot')
      .data(axes, (d) => d.key)
      .join((enter) =>
        enter
          .append('circle')
          .attr('class', 'radar-curr-dot stroke-white dark:stroke-[#0D121C] cursor-pointer')
          .attr('r', 5)
          .attr('fill', '#f59e0b')
          .attr('stroke-width', 1.75)
          .attr('tabindex', 0)
          .attr('role', 'img')
          .attr('cx', (_, i) => pointAt(i, startCurrScores[i] ?? 0)[0])
          .attr('cy', (_, i) => pointAt(i, startCurrScores[i] ?? 0)[1]),
      );

    currCircles
      .attr(
        'aria-label',
        (axis) =>
          `${axis.label} : ${currentLabel} ${axis.currentScore}/100 contre ${referenceLabel} ${axis.referenceScore}/100`,
      )
      .on('mouseenter', (_, d) => setHoveredAxisKey(d.key))
      .on('mouseleave', () => setHoveredAxisKey(null))
      .on('focus', (_, d) => setHoveredAxisKey(d.key))
      .on('blur', () => setHoveredAxisKey(null));

    if (duration === 0) {
      currCircles
        .attr('cx', (_, i) => pointAt(i, targetCurrScores[i])[0])
        .attr('cy', (_, i) => pointAt(i, targetCurrScores[i])[1]);
    } else {
      currCircles.each(function (axis, i) {
        const [tx, ty] = pointAt(i, targetCurrScores[i]);
        const didChange =
          prevCurr !== null && Math.abs(targetCurrScores[i] - (prevCurr[i] ?? 0)) >= 1;

        const circleSel = d3.select(this);
        const posTransition = circleSel
          .interrupt('curr-dot')
          .transition('curr-dot')
          .duration(duration)
          .ease(d3.easeCubicOut)
          .attr('cx', tx)
          .attr('cy', ty);

        if (didChange) {
          posTransition
            .attr('r', 7.5)
            .transition()
            .duration(220)
            .ease(d3.easeCubicOut)
            .attr('r', 5);

          // Onde discrète sur le sommet modifié pour visualiser l'impact de l'objet ou de la rune
          const deltaVal = targetCurrScores[i] - (prevCurr[i] ?? 0);
          const pulseStroke = deltaVal > 0 ? '#10b981' : '#f59e0b';
          pulseLayer
            .append('circle')
            .attr('data-axis', axis.key)
            .attr('cx', tx)
            .attr('cy', ty)
            .attr('r', 5)
            .attr('fill', 'none')
            .attr('stroke', pulseStroke)
            .attr('stroke-width', 2)
            .attr('opacity', 0.85)
            .transition()
            .delay(Math.round(duration * 0.45))
            .duration(460)
            .ease(d3.easeCubicOut)
            .attr('r', 17)
            .attr('opacity', 0)
            .remove();
        }
      });
    }

    prevTargetCurrRef.current = targetCurrScores;
  }, [axes, currentLabel, referenceLabel]);

  return (
    <div className="relative w-full flex flex-col items-center overflow-hidden">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full max-w-[440px] h-auto block"
        role="img"
        aria-label={`Graphique radar D3 comparant ${currentLabel} et ${referenceLabel} sur Dégâts, Résistance, Utilité et Mobilité`}
      />

      {recentShifts.length > 0 && (
        <div
          aria-live="polite"
          className="mt-0.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400"
        >
          <span className="font-sans text-slate-500 dark:text-slate-400">Dernière variation :</span>
          {recentShifts.map((sh) => (
            <span
              key={`shift-${sh.key}`}
              className={
                sh.delta > 0
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                  : 'text-rose-600 dark:text-rose-400 font-semibold'
              }
            >
              {sh.label} {sh.delta > 0 ? `+${sh.delta}` : sh.delta}
            </span>
          ))}
        </div>
      )}

      {hoveredAxis ? (
        <div className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] px-3 py-2 text-[11px] space-y-1">
          <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-white">
            <span>{hoveredAxis.label}</span>
            <span className="font-mono tabular-nums">
              {hoveredAxis.currentScore}/100 vs {hoveredAxis.referenceScore}/100
            </span>
          </div>
          <div className="text-amber-600 dark:text-amber-400 font-mono tabular-nums">
            {currentLabel} : {hoveredAxis.currentDetail}
          </div>
          <div className="text-sky-600 dark:text-sky-400 font-mono tabular-nums">
            {referenceLabel} : {hoveredAxis.referenceDetail}
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 text-center">
          Survolez un sommet du radar pour afficher le détail chiffré exact.
        </p>
      )}
    </div>
  );
}
