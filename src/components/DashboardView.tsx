import { useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Crosshair,
  Download,
  Eye,
  FolderSync,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  X,
} from 'lucide-react';
import type { ChampionSummary, MatchRecord, PlayerProfileResponse } from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import {
  downloadWindowsBridgeBat,
  formatMatchQueueLabel,
  normalizeLcuHistoryToMatches,
  UNIVERSAL_HISTORY_CLIPBOARD_CMD,
} from '../utils/liveBridge.ts';

interface DashboardViewProps {
  profile: PlayerProfileResponse | null;
  loading: boolean;
  error: string | null;
  riotConfigured: boolean;
  champions: ChampionSummary[];
  patchVersion: string;
  onRetrySync: () => void;
  onDismissError: () => void;
  onMergeLocalMatches: (matches: MatchRecord[]) => number;
  onSelectMatchForReview: (match: MatchRecord) => void;
  onNavigateToBuilds: (championName?: string) => void;
  onNavigateToLive: () => void;
}

export function DashboardView({
  profile,
  loading,
  error,
  riotConfigured,
  champions,
  patchVersion,
  onRetrySync,
  onDismissError,
  onMergeLocalMatches,
  onSelectMatchForReview,
  onNavigateToBuilds,
  onNavigateToLive,
}: DashboardViewProps) {
  const [showLocalImport, setShowLocalImport] = useState(false);
  const [localImporting, setLocalImporting] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [pasteHistoryJson, setPasteHistoryJson] = useState('');
  const [copiedHistCmd, setCopiedHistCmd] = useState(false);

  const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

  const getChampIcon = (championName: string) => {
    const found = champions.find(
      (c) =>
        c.id.toLowerCase() === championName.toLowerCase() ||
        c.name.toLowerCase() === championName.toLowerCase(),
    );
    return found?.imageUrl;
  };

  const applyRawHistoryJson = (rawObj: any) => {
    const converted = normalizeLcuHistoryToMatches(rawObj, champions, profile?.riotId || '');
    if (converted.length === 0) {
      setLocalErr(
        'Aucune partie trouvée dans ce JSON (vérifiez que League of Legends est ouvert et utilisez la commande /history).',
      );
      return;
    }
    const added = onMergeLocalMatches(converted);
    setPasteHistoryJson('');
    setShowLocalImport(false);
    setLocalMsg(
      added > 0
        ? `${added} partie(s) locale(s) ajoutée(s) à votre historique (incluant vos parties Personnalisées) !`
        : `${converted.length} partie(s) lues depuis le client LoL (déjà présentes dans votre historique).`,
    );
  };

  const handleFetchLocalHistory = async () => {
    setLocalImporting(true);
    setLocalErr(null);
    setLocalMsg(null);
    try {
      const res = await fetch('http://127.0.0.1:38421/history');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Historique client indisponible.');
      applyRawHistoryJson(data);
    } catch {
      setShowLocalImport(true);
      setLocalErr(
        isInsideIframe
          ? 'Accès à 127.0.0.1:38421 bloqué dans l’aperçu iframe : copiez la commande ci-dessous dans PowerShell puis faites Ctrl+V (ou ouvrez l’app hors iframe).'
          : 'Pont local 127.0.0.1:38421 non détecté. Téléchargez et lancez lol-coach-bridge.bat v3.1 puis réessayez.',
      );
    } finally {
      setLocalImporting(false);
    }
  };

  const handleCopyHistCmd = async () => {
    try {
      await navigator.clipboard.writeText(UNIVERSAL_HISTORY_CLIPBOARD_CMD);
      setCopiedHistCmd(true);
      window.setTimeout(() => setCopiedHistCmd(false), 2000);
    } catch {
      setLocalErr('Sélectionnez la commande et copiez avec Ctrl+C.');
    }
  };

  if (loading && !profile) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] animate-pulse"
            />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] animate-pulse" />
      </div>
    );
  }

  // Si aucune donnée n'est encore chargée et qu'une erreur survient
  if (error && !profile) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-rose-600 dark:text-rose-400">
            Erreur de synchronisation Riot API
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{error}</p>
        </div>
        <button
          type="button"
          onClick={onRetrySync}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Réessayer maintenant
        </button>
      </div>
    );
  }

  if (!profile) return null;

  const { tendencies, rankedSolo, matches, activeGame } = profile;

  return (
    <div className="space-y-6">
      {/* Bannière d'erreur non-bloquante : conserve le profil et les parties déjà synchronisées */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">
              Erreur de synchronisation Riot API
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{error}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRetrySync}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Réessayer
            </button>
            <button
              type="button"
              onClick={onDismissError}
              aria-label="Fermer l'alerte"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {!riotConfigured && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
          <div className="font-semibold text-amber-700 dark:text-amber-400">
            Mode aperçu : clé serveur RIOT_API_KEY non renseignée
          </div>
          <p className="leading-relaxed">
            Pour synchroniser automatiquement toutes les vraies parties de{' '}
            <span className="font-mono font-semibold">{profile.riotId}</span> (sans aucun import JSON manuel), créez une clé sur{' '}
            <a
              href="https://developer.riotgames.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-600 dark:text-amber-400 underline underline-offset-2 hover:text-amber-500"
            >
              developer.riotgames.com
            </a>{' '}
            (connexion avec votre compte Riot habituel), puis ajoutez-la sous le nom{' '}
            <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">RIOT_API_KEY</code> dans{' '}
            <strong>Settings &gt; Secrets</strong>.
          </p>
        </section>
      )}

      {/* En-tête Profil & Provenance claire */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4">
            <SafeGameIcon
              src={`https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/profileicon/${profile.profileIconId}.png`}
              alt={`Icône d'invocateur ${profile.riotId}`}
              fallbackLabel={profile.riotId}
              sizeClass="w-14 h-14"
            />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                {profile.riotId}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                <span>Serveur {profile.region}</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span className="font-mono tabular-nums">Niveau {profile.level}</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span>
                  {rankedSolo
                    ? `${rankedSolo.tier} ${rankedSolo.rank} (${rankedSolo.lp} LP)`
                    : 'Non classé Solo/Duo'}
                </span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span>Source : {profile.source}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {activeGame.inGame && (
              <button
                type="button"
                onClick={onNavigateToLive}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
              >
                Partie en cours détectée · Ouvrir Coach Live
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigateToBuilds(matches[0]?.player.championName)}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              Préparer un build contre la meta
            </button>
          </div>
        </div>
      </section>

      {/* Grille des 4 KPIs principaux */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Taux de victoire récent</span>
            <TrendingUp className="w-4 h-4 text-amber-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {tendencies.winRate}%
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Calculé sur {tendencies.gamesAnalyzed} parties analysées
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Rythme de farming moyen</span>
            <Crosshair className="w-4 h-4 text-sky-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {tendencies.avgCsPerMin} <span className="text-sm font-normal text-slate-400">CS/min</span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Cible recommandée : 7.0+ CS/min
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Morts isolées / sur-extension</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {Math.round(tendencies.enemyJungleDeathRate * 100)}%
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Moyenne de {tendencies.avgDeaths} morts par match
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Contrôle de vision</span>
            <Eye className="w-4 h-4 text-emerald-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {tendencies.avgVisionPerMin} <span className="text-sm font-normal text-slate-400">/ min</span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {Math.round(tendencies.preObjectiveDeathRate * 100)}% de morts avant objectif
          </p>
        </div>
      </section>

      {/* Historique des parties synchronisées */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Historique de jeu &amp; détection d’erreurs
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Riot Match-V5 synchronise vos parties en matchmaking (Classée, Partie Accélérée, Draft, ARAM). Les parties « Personnalisée » restent locales sur votre PC.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleFetchLocalHistory}
              disabled={localImporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <FolderSync className={`w-3.5 h-3.5 text-sky-500 ${localImporting ? 'animate-spin' : ''}`} aria-hidden="true" />
              {localImporting ? 'Lecture client...' : 'Importer parties locales (Personnalisées)'}
            </button>
          </div>
        </div>

        {(localMsg || localErr || showLocalImport) && (
          <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] space-y-2.5 text-xs">
            {localMsg && (
              <div className="text-emerald-600 dark:text-emerald-400 font-medium">{localMsg}</div>
            )}
            {localErr && (
              <div className="text-rose-600 dark:text-rose-400">{localErr}</div>
            )}
            {showLocalImport && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600 dark:text-slate-300">
                  <span>
                    Lancez <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">lol-coach-bridge.bat</code> (v3.1), puis copiez l’historique local et collez avec <strong>Ctrl+V</strong> :
                  </span>
                  <button
                    type="button"
                    onClick={downloadWindowsBridgeBat}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    Télécharger pont v3.1
                  </button>
                </div>
                <div className="relative">
                  <pre className="p-2 pr-20 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
                    {UNIVERSAL_HISTORY_CLIPBOARD_CMD}
                  </pre>
                  <button
                    type="button"
                    onClick={handleCopyHistCmd}
                    className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    {copiedHistCmd ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    {copiedHistCmd ? 'Copié' : 'Copier'}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={pasteHistoryJson}
                  onChange={(e) => setPasteHistoryJson(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted && pasted.trim().startsWith('{')) {
                      e.preventDefault();
                      try {
                        applyRawHistoryJson(JSON.parse(pasted));
                      } catch {
                        setLocalErr('JSON invalide collé dans la zone.');
                      }
                    }
                  }}
                  placeholder="Cliquez ici et faites Ctrl+V pour importer vos parties Personnalisées du client LoL..."
                  className="w-full p-2 text-[11px] font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-slate-100"
                />
              </div>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-3 px-6 text-left font-medium">Champion, Rôle &amp; Mode</th>
                <th className="py-3 px-4 text-left font-medium">Issue</th>
                <th className="py-3 px-4 text-right font-medium">K / D / A</th>
                <th className="py-3 px-4 text-right font-medium">Farming</th>
                <th className="py-3 px-4 text-right font-medium">Vision</th>
                <th className="py-3 px-4 text-right font-medium">Durée &amp; Date</th>
                <th className="py-3 px-6 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {matches.map((m) => {
                const durMin = Math.round(m.gameDurationSec / 60);
                const p = m.player;
                const queueLabel = formatMatchQueueLabel(
                  m.queueId,
                  m.gameMode,
                  m.queueId === 0 ? 'CUSTOM_GAME' : undefined,
                );
                const dateLabel = m.gameCreation
                  ? new Date(m.gameCreation).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                    })
                  : '';

                return (
                  <tr
                    key={m.matchId}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-3">
                        <SafeGameIcon
                          src={getChampIcon(p.championName)}
                          alt={p.championName}
                          fallbackLabel={p.championName}
                          sizeClass="w-9 h-9"
                        />
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <span>{p.championName}</span>
                            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                              {queueLabel}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {p.teamPosition !== 'UNKNOWN' ? p.teamPosition : 'Libre'}
                            {m.laneOpponent ? ` vs ${m.laneOpponent.championName}` : ''}
                            <span aria-hidden="true" className="mx-1.5">·</span>
                            Patch {m.gameVersion}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-xs font-semibold ${
                          p.win
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {p.win ? 'Victoire' : 'Défaite'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {p.kills}/{p.deaths}/{p.assists}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      <div className="text-slate-900 dark:text-slate-100">{p.cs} CS</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {p.csPerMin.toFixed(1)}/min
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {p.visionScore}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      <div className="text-slate-700 dark:text-slate-300">{durMin} min</div>
                      {dateLabel && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {dateLabel}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectMatchForReview(m)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                      >
                        Analyser
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
