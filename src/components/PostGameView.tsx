import { useMemo, useState } from 'react';
import { AlertTriangle, Brain, CheckCircle2, FileUp, Sparkles } from 'lucide-react';
import { analyzePostGameMatch } from '../engines/postGameEngine.ts';
import type { ChampionSummary, MatchRecord } from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import { SummonersRiftMap } from './SummonersRiftMap.tsx';
import { TimelineCurveChart } from './TimelineCurveChart.tsx';

interface PostGameViewProps {
  matches: MatchRecord[];
  selectedMatchId: string | null;
  champions: ChampionSummary[];
  patchVersion: string;
  onSelectMatchId: (id: string) => void;
  onImportMatch: (match: MatchRecord) => void;
}

export function PostGameView({
  matches,
  selectedMatchId,
  champions,
  patchVersion,
  onSelectMatchId,
  onImportMatch,
}: PostGameViewProps) {
  const activeMatch = useMemo(
    () => matches.find((m) => m.matchId === selectedMatchId) || matches[0] || null,
    [matches, selectedMatchId],
  );

  const analysis = useMemo(
    () => (activeMatch ? analyzePostGameMatch(activeMatch) : null),
    [activeMatch],
  );

  const [showImport, setShowImport] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiReview, setAiReview] = useState<{
    verdict?: string;
    placementReview?: string;
    farmingReview?: string;
    nextMatchFocus?: string[];
  } | null>(null);

  const getChampIcon = (championName: string) =>
    champions.find(
      (c) =>
        c.id.toLowerCase() === championName.toLowerCase() ||
        c.name.toLowerCase() === championName.toLowerCase(),
    )?.imageUrl;

  const handleImportSubmit = async () => {
    setImportError(null);
    setImporting(true);
    try {
      const parsed = JSON.parse(importJsonText);
      const res = await fetch('/api/match/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchJson: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import refusé.');
      onImportMatch(data);
      setShowImport(false);
      setImportJsonText('');
      setAiReview(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'JSON Match-V5 invalide.');
    } finally {
      setImporting(false);
    }
  };

  const handleGenerateAiReview = async () => {
    if (!activeMatch || !analysis) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/coach/postgame-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match: activeMatch, analysis }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur Gemini.');
      setAiReview(data);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Erreur lors du débriefing IA.');
    } finally {
      setAiLoading(false);
    }
  };

  if (!activeMatch || !analysis) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-8 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Aucun match synchronisé pour le moment. Synchronisez un Riot ID ou importez un JSON Match-V5.
        </p>
      </div>
    );
  }

  const p = activeMatch.player;

  return (
    <div className="space-y-6">
      {/* Barre de sélection de match & import */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <SafeGameIcon
              src={getChampIcon(p.championName)}
              alt={p.championName}
              fallbackLabel={p.championName}
              sizeClass="w-12 h-12"
            />
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Analyse Post-Game · {p.championName} ({p.kills}/{p.deaths}/{p.assists})
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span className={p.win ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400 font-semibold'}>
                  {p.win ? 'Victoire' : 'Défaite'}
                </span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span>{p.teamPosition}</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span className="font-mono tabular-nums">{Math.round(activeMatch.gameDurationSec / 60)} min</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span>Source : {activeMatch.source}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={activeMatch.matchId}
              onChange={(e) => {
                onSelectMatchId(e.target.value);
                setAiReview(null);
              }}
              aria-label="Choisir une partie"
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-slate-100"
            >
              {matches.map((m) => (
                <option key={m.matchId} value={m.matchId}>
                  {m.player.championName} ({m.player.win ? 'V' : 'D'} · {m.player.kills}/{m.player.deaths}/{m.player.assists})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowImport((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
              Importer JSON Match-V5
            </button>
          </div>
        </div>

        {showImport && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Collez un payload officiel Riot Match-V5 (`info.participants`)
            </label>
            <textarea
              rows={4}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder='{"metadata": {"matchId": "EUW1_..."}, "info": {"gameDuration": 1800, "participants": [...]}}'
              className="w-full p-3 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-slate-100"
            />
            {importError && <p className="text-xs text-rose-500">{importError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleImportSubmit}
                disabled={importing || !importJsonText.trim()}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 disabled:opacity-50"
              >
                {importing ? 'Import...' : 'Analyser ce match'}
              </button>
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="px-3 py-2 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Métriques clés Post-Game */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {[
          { label: 'CS / min', value: analysis.csPerMin.toFixed(1), sub: `${p.cs} sbires` },
          { label: 'CS @ 10 min', value: String(analysis.csAt10), sub: 'Cible : 75+' },
          { label: 'Écart Or @ 15m', value: `${analysis.goldDiffAt15 >= 0 ? '+' : ''}${analysis.goldDiffAt15}`, sub: 'vs vis-à-vis' },
          { label: 'Participation Kills', value: `${analysis.killParticipation}%`, sub: `${p.kills + p.assists} impliqués` },
          { label: 'Morts isolées', value: String(analysis.isolatedDeaths), sub: 'Sans couverture' },
          { label: 'Morts pré-objectif', value: String(analysis.preObjectiveDeaths), sub: '<45s avant drake/nash' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</div>
            <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {kpi.value}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{kpi.sub}</div>
          </div>
        ))}
      </section>

      {/* Carte de placement & Courbe de farming */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <section className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Carte des erreurs de placement (Faille de l’invocateur)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Cliquez sur un marqueur pour inspecter la zone exacte, l’isolement et le timing d’objectif.
            </p>
          </div>
          <SummonersRiftMap events={activeMatch.mapEvents} patchVersion={patchVersion} />
        </section>

        <section className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Courbe de farming &amp; différentiel d’or
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Comparaison minute par minute face à votre adversaire direct.
            </p>
          </div>
          <TimelineCurveChart splits={activeMatch.timelineSplits} />
        </section>
      </div>

      {/* Erreurs détectées & Débriefing IA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Diagnostic déterministe (Placement, Farming, Vision)
          </h2>

          {analysis.detectedMistakes.length === 0 ? (
            <div className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Aucune erreur majeure détectée sur les seuils standards.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              {analysis.detectedMistakes.map((err, idx) => (
                <div key={idx} className="p-4 space-y-2 bg-white dark:bg-[#121722]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <AlertTriangle
                        className={`w-3.5 h-3.5 ${
                          err.severity === 'Critique' ? 'text-rose-500' : 'text-amber-500'
                        }`}
                        aria-hidden="true"
                      />
                      {err.title}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        err.severity === 'Critique'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {err.category} · {err.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {err.evidence}
                  </p>
                  <p className="text-xs text-sky-700 dark:text-sky-400 leading-relaxed">
                    Exercice correctif : {err.drill}
                  </p>
                </div>
              ))}
            </div>
          )}

          {analysis.strengths.length > 0 && (
            <div className="pt-2 space-y-1.5">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Points forts observés
              </div>
              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {analysis.strengths.map((s, idx) => (
                  <li key={idx}>· {s}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Débriefing IA Gemini */}
        <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Brain className="w-4 h-4 text-amber-500" aria-hidden="true" />
                Débriefing stratégique personnalisé (Gemini)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Synthèse personnalisée basée sur les coordonnées et courbes exactes du match.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateAiReview}
              disabled={aiLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              {aiLoading ? 'Analyse en cours...' : 'Lancer le débriefing IA'}
            </button>
          </div>

          {aiError && (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/5 text-xs text-rose-600 dark:text-rose-400">
              {aiError}
            </div>
          )}

          {aiReview ? (
            <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs leading-relaxed">
              {aiReview.verdict && (
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {aiReview.verdict}
                </p>
              )}
              <div className="space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Analyse du placement
                </div>
                <p className="text-slate-600 dark:text-slate-300">{aiReview.placementReview}</p>
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Analyse du farming & tempo
                </div>
                <p className="text-slate-600 dark:text-slate-300">{aiReview.farmingReview}</p>
              </div>
              {aiReview.nextMatchFocus && aiReview.nextMatchFocus.length > 0 && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Objectifs pour la prochaine partie
                  </div>
                  <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                    {aiReview.nextMatchFocus.map((item, i) => (
                      <li key={i}>· {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            !aiLoading && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cliquez sur « Lancer le débriefing IA » pour recevoir une correction ciblée de vos zones de mort et de vos fenêtres de rappel sur cette partie.
              </p>
            )
          )}
        </section>
      </div>

      {/* Tableau complet des 10 joueurs et équipements */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Tableau complet de la partie (10 joueurs & équipements)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Équipement final, dégâts infligés, score de vision et rythme de farm de chaque joueur sur ce match.
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Patch {patchVersion}
          </span>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {[
            { teamId: 100, label: 'Équipe Bleue' },
            { teamId: 200, label: 'Équipe Rouge' },
          ].map((teamGroup) => {
            const teamPlayers = activeMatch.participants.filter((part) => part.teamId === teamGroup.teamId);
            if (teamPlayers.length === 0) return null;
            const teamWon = teamPlayers[0]?.win;
            return (
              <div key={teamGroup.teamId} className="overflow-x-auto">
                <div className="px-6 py-2.5 bg-slate-50 dark:bg-[#0D121C] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {teamGroup.label}
                  </span>
                  <span
                    className={`font-semibold ${
                      teamWon ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {teamWon ? 'Victoire' : 'Défaite'}
                  </span>
                </div>

                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-5 text-left font-medium">Joueur & Champion</th>
                      <th className="py-2.5 px-3 text-left font-medium">Rôle</th>
                      <th className="py-2.5 px-3 text-right font-medium">K / D / A</th>
                      <th className="py-2.5 px-3 text-right font-medium">CS</th>
                      <th className="py-2.5 px-3 text-right font-medium">Dégâts</th>
                      <th className="py-2.5 px-3 text-right font-medium">Vision</th>
                      <th className="py-2.5 px-5 text-left font-medium">Équipement final</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {teamPlayers.map((part, idx) => {
                      const isSelf = part.puuid === p.puuid;
                      const validItems = (part.items || []).filter((id) => id > 0);
                      const displayRiotId =
                        part.riotIdGameName && part.riotIdTagline
                          ? `${part.riotIdGameName}#${part.riotIdTagline}`
                          : part.riotIdGameName || part.championName;
                      return (
                        <tr
                          key={`${part.puuid}-${idx}`}
                          className={
                            isSelf
                              ? 'bg-amber-500/5 dark:bg-amber-500/10'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                          }
                        >
                          <td className="py-2.5 px-5">
                            <div className="flex items-center gap-2.5">
                              <SafeGameIcon
                                key={`pg-champ-${activeMatch.matchId}-${part.puuid}-${idx}`}
                                src={getChampIcon(part.championName)}
                                alt={part.championName}
                                fallbackLabel={part.championName}
                                sizeClass="w-8 h-8"
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 dark:text-white truncate">
                                  {part.championName}{' '}
                                  <span className="text-[11px] font-mono font-normal text-slate-400">
                                    Niv.{part.champLevel}
                                  </span>
                                  {isSelf && (
                                    <span className="ml-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                      (Vous)
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {displayRiotId}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-medium">
                            {part.teamPosition || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                            {part.kills}/{part.deaths}/{part.assists}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <div className="text-slate-900 dark:text-white">{part.cs}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {part.csPerMin}/min
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {part.totalDamageDealtToChampions.toLocaleString('fr-FR')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {part.visionScore}
                          </td>
                          <td className="py-2.5 px-5">
                            {validItems.length === 0 ? (
                              <span className="text-[11px] text-slate-400">Aucun objet</span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-1">
                                {validItems.map((itemId, itemIdx) => (
                                  <div
                                    key={`${part.puuid}-item-${itemIdx}-${itemId}`}
                                    title={`Objet #${itemId}`}
                                  >
                                    <SafeGameIcon
                                      key={`pg-item-${activeMatch.matchId}-${part.puuid}-${itemIdx}-${itemId}`}
                                      src={`https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/item/${itemId}.png`}
                                      alt={`Objet ${itemId}`}
                                      fallbackLabel={String(itemId)}
                                      sizeClass="w-7 h-7"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
