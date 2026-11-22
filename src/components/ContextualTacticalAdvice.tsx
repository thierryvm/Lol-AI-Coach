import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Swords,
} from 'lucide-react';
import {
  buildContextualTacticalTips,
  type ContextualTacticalTip,
} from '../engines/contextualAdviceEngine.ts';
import type {
  CareerAiSynthesis,
  CareerSynthesisDataset,
  ChampionSummary,
  MatchRecord,
  Role,
} from '../engines/types.ts';
import { SectionInfoTooltip } from './SectionInfoTooltip.tsx';
import type { ToastItem } from './ToastContainer.tsx';
import { formatChampionDisplayName } from '../utils/championDisplay.ts';

const DAILY_TIP_ACK_STORAGE_KEY = 'lol_ai_coach_daily_tip_ack_v1';

function readDailyAck(dayKey: string, riotId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(DAILY_TIP_ACK_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return Boolean(parsed[`${dayKey}:${riotId.toLowerCase()}`]);
  } catch {
    return false;
  }
}

function writeDailyAck(dayKey: string, riotId: string, acked: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(DAILY_TIP_ACK_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    parsed[`${dayKey}:${riotId.toLowerCase()}`] = acked;
    localStorage.setItem(DAILY_TIP_ACK_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // ignore storage errors
  }
}

interface ContextualTacticalAdviceProps {
  careerSynthesis: CareerAiSynthesis | null;
  dataset: CareerSynthesisDataset;
  matches: MatchRecord[];
  champions: ChampionSummary[];
  riotId: string;
  dominantRole?: Role;
  aiLoading?: boolean;
  geminiConfigured?: boolean;
  onGenerateCareerSynthesis?: () => void;
  onNavigateToBuilds?: (championName?: string) => void;
  onNotify?: (toast: Omit<ToastItem, 'id'>) => void;
}

export function ContextualTacticalAdvice({
  careerSynthesis,
  dataset,
  matches,
  champions,
  riotId,
  dominantRole = 'SUPPORT',
  aiLoading = false,
  geminiConfigured = true,
  onGenerateCareerSynthesis,
  onNavigateToBuilds,
  onNotify,
}: ContextualTacticalAdviceProps) {
  const bundle = useMemo(
    () =>
      buildContextualTacticalTips({
        careerSynthesis,
        dataset,
        matches,
        champions,
        riotId,
        dominantRole,
      }),
    [careerSynthesis, dataset, matches, champions, riotId, dominantRole],
  );

  const [offset, setOffset] = useState(0);
  const [ackedToday, setAckedToday] = useState(() => readDailyAck(bundle.dayKey, riotId));

  useEffect(() => {
    setOffset(0);
    setAckedToday(readDailyAck(bundle.dayKey, riotId));
  }, [bundle.dayKey, riotId, bundle.tips.length]);

  if (bundle.tips.length === 0) {
    return null;
  }

  const activeIdx = (bundle.dailyIndex + offset + bundle.tips.length) % bundle.tips.length;
  const activeTip: ContextualTacticalTip = bundle.tips[activeIdx];

  const todayFormatted = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });

  const handleToggleAck = () => {
    const next = !ackedToday;
    setAckedToday(next);
    writeDailyAck(bundle.dayKey, riotId, next);
    if (next) {
      onNotify?.({
        variant: 'goal',
        title: 'Objectif tactique du jour verrouillé',
        description: `Focus activé (${activeTip.category}) : ${activeTip.headline}`,
      });
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.06] via-white to-white dark:from-amber-500/[0.08] dark:via-[#121722] dark:to-[#121722] p-5 sm:p-6 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <span>Conseil Tactique Contextuel · Astuce du {todayFormatted}</span>
            </h2>
            <SectionInfoTooltip
              title="Conseil Tactique Contextuel"
              description="Exploite votre Synthèse Globale IA et vos performances par classe de champions pour extraire chaque jour une recommandation immédiate dès la connexion."
              usageTip="Parcourez les autres conseils détectés avec les flèches ou cochez « Appliqué aujourd'hui » avant de lancer votre prochaine file."
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            <span className="font-sans font-semibold text-amber-700 dark:text-amber-400">
              {activeTip.category}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {activeTip.sourceKind === 'careerSynthesis'
                ? 'Source : Synthèse Globale IA'
                : 'Source : Analyse carrière locale'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{activeTip.evidenceLabel}</span>
          </div>
        </div>

        {/* Navigation entre conseils & statut quotidien */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {bundle.tips.length > 1 && (
            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-[#0D121C] p-0.5">
              <button
                type="button"
                onClick={() => setOffset((prev) => prev - 1)}
                aria-label="Conseil précédent"
                className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <span className="px-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                {activeIdx + 1}/{bundle.tips.length}
              </span>
              <button
                type="button"
                onClick={() => setOffset((prev) => prev + 1)}
                aria-label="Conseil suivant"
                className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleToggleAck}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
              ackedToday
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D121C] text-slate-700 dark:text-slate-200 hover:border-amber-500/60'
            }`}
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            {ackedToday ? 'Focus validé pour aujourd’hui' : 'Appliquer aujourd’hui'}
          </button>
        </div>
      </div>

      {/* Corps du conseil personnalisé */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-[#0D121C]/90 p-4 space-y-2.5">
        <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white leading-snug">
          « {activeTip.headline} »
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed flex items-start gap-2">
          <Compass className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{activeTip.actionStep}</span>
        </p>
      </div>

      {/* Actions contextuelles rapides */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {!bundle.usesAiSynthesis ? (
          <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
            <span>
              Astuce calculée depuis ton historique local. Génère la <strong>Synthèse Globale IA</strong> pour affiner ce conseil avec ton diagnostic long terme.
            </span>
          </div>
        ) : (
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Actualisé automatiquement à chaque connexion selon votre dernière Synthèse Globale IA.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 shrink-0 ml-auto">
          {!bundle.usesAiSynthesis && onGenerateCareerSynthesis && geminiConfigured && (
            <button
              type="button"
              onClick={onGenerateCareerSynthesis}
              disabled={aiLoading || dataset.gamesAnalyzed === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {aiLoading ? 'Génération...' : 'Enrichir avec la Synthèse IA'}
            </button>
          )}
          {activeTip.championTarget && onNavigateToBuilds && (
            <button
              type="button"
              onClick={() => onNavigateToBuilds(activeTip.championTarget)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors whitespace-nowrap"
            >
              <Swords className="w-3.5 h-3.5" aria-hidden="true" />
              Optimiser {formatChampionDisplayName(champions, activeTip.championTarget)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
