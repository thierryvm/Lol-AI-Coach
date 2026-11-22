import { useState } from 'react';
import { Check, Copy, RotateCcw, Shield, Swords, Zap } from 'lucide-react';
import type {
  ChampionSummary,
  LiveCoachSnapshot,
  LivePlayerEquipmentRow,
  SpectatorParticipant,
} from '../engines/types.ts';
import { resolveChampionDisplay } from '../utils/championDisplay.ts';
import {
  computeEffectiveSpellCooldown,
  getSummonerSpellById,
  getSummonerSpellIconUrl,
  inferDefaultEnemySpells,
  SUMMONER_SPELLS,
  type EnemySpellToastScope,
} from '../utils/summonerSpells.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import { SectionInfoTooltip } from './SectionInfoTooltip.tsx';

export interface ActiveSpellCooldownEntry {
  expiresAt: number;
  totalSec: number;
  championKey?: string;
  championDisplayName: string;
  spellId: number;
  spellNameFr: string;
  chatCode: string;
  team: 'ALLY' | 'ENEMY';
  spellIconUrl?: string;
}

interface LiveSummonerSpellsTrackerProps {
  allyPlayers: LivePlayerEquipmentRow[];
  enemyPlayers: LivePlayerEquipmentRow[];
  selfChampionName: string;
  spectatorParticipants?: SpectatorParticipant[];
  champions: ChampionSummary[];
  patchVersion: string;
  gameTimeSec: number;
  gameMode?: string;
  hasCosmicInsightSelf?: boolean;
  sourceLabel: LiveCoachSnapshot['source'];
  spellCooldowns: Record<string, ActiveSpellCooldownEntry>;
  spellTickNow: number;
  spellOverrides: Record<string, { spell1Id?: number; spell2Id?: number }>;
  onToggleSpell: (
    championKey: string,
    championDisplayName: string,
    spellId: number,
    spellNameFr: string,
    chatCode: string,
    durationSec: number,
    team: 'ALLY' | 'ENEMY',
  ) => void;
  onOverrideSpell: (
    championKey: string,
    slot: 'spell1Id' | 'spell2Id',
    spellId: number,
  ) => void;
  onResetAll: () => void;
  voiceAlertOnReady: boolean;
  onToggleVoiceAlert: (enabled: boolean) => void;
  toastAlertOnReady: boolean;
  onToggleToastAlert: (enabled: boolean) => void;
  toastAlertScope: EnemySpellToastScope;
  onChangeToastAlertScope: (scope: EnemySpellToastScope) => void;
  speechSupported: boolean;
  onCopyTimers: () => void;
  copiedTimers: boolean;
}

function formatClock(sec: number): string {
  const safe = Math.max(0, Math.round(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function LiveSummonerSpellsTracker({
  allyPlayers,
  enemyPlayers,
  selfChampionName,
  spectatorParticipants = [],
  champions,
  patchVersion,
  gameTimeSec,
  gameMode,
  hasCosmicInsightSelf = false,
  sourceLabel,
  spellCooldowns,
  spellTickNow,
  spellOverrides,
  onToggleSpell,
  onOverrideSpell,
  onResetAll,
  voiceAlertOnReady,
  onToggleVoiceAlert,
  toastAlertOnReady,
  onToggleToastAlert,
  toastAlertScope,
  onChangeToastAlertScope,
  speechSupported,
  onCopyTimers,
  copiedTimers,
}: LiveSummonerSpellsTrackerProps) {
  const [teamFilter, setTeamFilter] = useState<'ALL' | 'ENEMY' | 'ALLY'>('ALL');
  const [editingPlayerKey, setEditingPlayerKey] = useState<string | null>(null);

  const isAram = gameMode?.toUpperCase() === 'ARAM';
  const activeCooldownEntries = Object.entries(spellCooldowns).filter(
    ([, entry]) => entry.expiresAt > spellTickNow,
  );
  const activeCount = activeCooldownEntries.length;

  const resolvePlayerTracker = (player: LivePlayerEquipmentRow, team: 'ALLY' | 'ENEMY') => {
    const champDisp = resolveChampionDisplay(champions, player.championName);
    const matchingSpectator = spectatorParticipants.find((sp) => {
      if (champDisp.champion && Number(champDisp.champion.key) === sp.championId) return true;
      return sp.riotId.toLowerCase() === player.riotId.toLowerCase();
    });
    const [fallback1, fallback2] = inferDefaultEnemySpells(player.position);
    const trackerKey = `${team}:${player.championName}`;
    const override = spellOverrides[trackerKey] || spellOverrides[player.championName];

    const spell1Id =
      override?.spell1Id ?? player.spell1Id ?? matchingSpectator?.spell1Id ?? fallback1;
    const spell2Id =
      override?.spell2Id ?? player.spell2Id ?? matchingSpectator?.spell2Id ?? fallback2;

    const spell1 = getSummonerSpellById(spell1Id);
    const spell2 = getSummonerSpellById(spell2Id);
    const isSelf = player.championName.toLowerCase() === selfChampionName.toLowerCase();
    const itemIds = player.items.map((it) => it.itemId);
    const opts = {
      hasCosmicInsight: isSelf && hasCosmicInsightSelf,
      isAram,
    };

    const eff1 = computeEffectiveSpellCooldown(spell1.cooldownSec, itemIds, opts);
    const eff2 = computeEffectiveSpellCooldown(spell2.cooldownSec, itemIds, opts);

    return {
      player,
      team,
      trackerKey,
      champDisp,
      isSelf,
      spell1,
      spell2,
      eff1,
      eff2,
    };
  };

  const resolvedAllies = allyPlayers.map((p) => resolvePlayerTracker(p, 'ALLY'));
  const resolvedEnemies = enemyPlayers.map((p) => resolvePlayerTracker(p, 'ENEMY'));

  const visibleTeams = [
    ...(teamFilter === 'ALL' || teamFilter === 'ALLY'
      ? [
          {
            id: 'ALLY' as const,
            title: `Votre équipe (${resolvedAllies.length})`,
            icon: Shield,
            accentClass: 'text-sky-500',
            borderClass: 'border-sky-500/20',
            rows: resolvedAllies,
            emptyText: 'Aucun joueur allié détecté.',
          },
        ]
      : []),
    ...(teamFilter === 'ALL' || teamFilter === 'ENEMY'
      ? [
          {
            id: 'ENEMY' as const,
            title: `Équipe adverse (${resolvedEnemies.length})`,
            icon: Swords,
            accentClass: 'text-rose-500',
            borderClass: 'border-rose-500/20',
            rows: resolvedEnemies,
            emptyText:
              'Aucun champion adverse dans cette session (Outil d’entraînement solo sans bot IA). Testez le décompte sur vos propres sorts dans la colonne Votre équipe !',
          },
        ]
      : []),
  ];

  const totalPlayersDisplayed = resolvedAllies.length + resolvedEnemies.length;

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4">
      {/* En-tête */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <span>
                Sorts d’Invocateur des {totalPlayersDisplayed} joueurs &amp; Cooldowns temps réel
              </span>
            </h2>
            {activeCount > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-mono tabular-nums font-semibold">
                {activeCount} en recharge
              </span>
            )}
            <SectionInfoTooltip
              title="Synchronisation Riot API & Règles Vanguard"
              description="Sorts choisis par les 10 joueurs (Live Client Data + Spectator-V5), Bottes de lucidité (-10%), Savoir cosmique et hâte ARAM calculés automatiquement. Riot Vanguard interdit à toute app légale de lire l’instant exact où un joueur appuie sur Flash/TP : démarrez le décompte en 1 clic ou au micro (« Aatrox plus de flash »)."
              usageTip="Cliquez sur « Copier timers » pour coller l’heure exacte de retour (ex: Aatrox F 21:45) dans le chat de votre équipe."
            />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Source : {sourceLabel} · Sorts, Bottes de lucidité{isAram ? ' et hâte ARAM' : ''} synchronisés auto · Décompte temps réel en 1 clic ou au micro.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Filtre d'équipe */}
          <div
            className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] p-0.5 text-[11px]"
            role="group"
            aria-label="Filtrer les équipes"
          >
            {(
              [
                { id: 'ALL', label: '10 joueurs' },
                { id: 'ENEMY', label: 'Adversaires' },
                { id: 'ALLY', label: 'Alliés' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTeamFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  teamFilter === tab.id
                    ? 'bg-white dark:bg-[#1A2233] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {speechSupported && (
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] text-slate-700 dark:text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={voiceAlertOnReady}
                onChange={(e) => onToggleVoiceAlert(e.target.checked)}
                className="rounded border-slate-300 accent-amber-500"
              />
              <span>Alerte vocale fin CD</span>
            </label>
          )}

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] text-slate-700 dark:text-slate-200">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={toastAlertOnReady}
                onChange={(e) => onToggleToastAlert(e.target.checked)}
                className="rounded border-slate-300 accent-rose-500"
              />
              <span>Notif toast ennemi prêt</span>
            </label>
            {toastAlertOnReady && (
              <select
                value={toastAlertScope}
                onChange={(e) =>
                  onChangeToastAlertScope(e.target.value as EnemySpellToastScope)
                }
                aria-label="Sorts ennemis déclenchant une notification toast"
                className="ml-1 pl-1.5 pr-1 py-0.5 text-[10.5px] font-semibold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121722] text-slate-800 dark:text-slate-100"
              >
                <option value="KEY">Sorts clés</option>
                <option value="FLASH_ONLY">Flash seul</option>
              </select>
            )}
          </div>

          {activeCount > 0 && (
            <>
              <button
                type="button"
                onClick={onCopyTimers}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors whitespace-nowrap"
              >
                {copiedTimers ? (
                  <Check className="w-3 h-3" aria-hidden="true" />
                ) : (
                  <Copy className="w-3 h-3" aria-hidden="true" />
                )}
                <span>{copiedTimers ? 'Timers copiés !' : 'Copier timers (chat LoL)'}</span>
              </button>
              <button
                type="button"
                onClick={onResetAll}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                title="Réinitialiser tous les chronomètres actifs"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                <span>RAZ</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Grille 2 colonnes (Votre équipe vs Équipe adverse) */}
      <div
        className={`grid grid-cols-1 ${
          visibleTeams.length === 2 ? 'xl:grid-cols-2' : ''
        } gap-4`}
      >
        {visibleTeams.map((teamBlock) => {
          const TeamIcon = teamBlock.icon;
          return (
            <div
              key={teamBlock.id}
              className={`rounded-xl border ${teamBlock.borderClass} bg-slate-50/70 dark:bg-[#0D121C] p-3.5 space-y-2.5`}
            >
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                  <TeamIcon className={`w-3.5 h-3.5 ${teamBlock.accentClass}`} aria-hidden="true" />
                  <span>{teamBlock.title}</span>
                </div>
                <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  Cliquer un sort pour lancer/annuler le CD
                </span>
              </div>

              {teamBlock.rows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-[#121722]/60 p-5 text-center text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {teamBlock.emptyText}
                </div>
              ) : (
                <div className="space-y-2">
                  {teamBlock.rows.map(
                    ({ player, trackerKey, champDisp, isSelf, spell1, spell2, eff1, eff2 }) => {
                      const key1 = `${player.championName}:${spell1.id}`;
                      const key2 = `${player.championName}:${spell2.id}`;
                      const entry1 = spellCooldowns[key1];
                      const entry2 = spellCooldowns[key2];
                      const left1 =
                        entry1 && entry1.expiresAt > spellTickNow
                          ? Math.ceil((entry1.expiresAt - spellTickNow) / 1000)
                          : 0;
                      const left2 =
                        entry2 && entry2.expiresAt > spellTickNow
                          ? Math.ceil((entry2.expiresAt - spellTickNow) / 1000)
                          : 0;
                      const isEditing = editingPlayerKey === trackerKey;
                      const modifiers: string[] = [];
                      if (eff1.hasLucidityBoots) modifiers.push('Lucidité');
                      if (eff1.hasCosmicInsight) modifiers.push('Cosmique');
                      if (eff1.isAram) modifiers.push('ARAM');

                      return (
                        <div
                          key={trackerKey}
                          className={`rounded-lg border p-2.5 space-y-2 transition-colors ${
                            isSelf
                              ? 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722]'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                            {/* Identité joueur */}
                            <div className="flex items-center gap-2.5 min-w-0 sm:w-44 shrink-0">
                              <SafeGameIcon
                                src={champDisp.imageUrl}
                                alt={champDisp.displayName}
                                fallbackLabel={champDisp.displayName}
                                sizeClass="w-8 h-8 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1 text-xs font-semibold text-slate-900 dark:text-white truncate">
                                  <span className="truncate">{champDisp.displayName}</span>
                                  {isSelf && (
                                    <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                                      (Vous)
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                  <span className="font-mono tabular-nums">N.{player.level}</span>
                                  {player.position && player.position !== '-' && (
                                    <span>· {player.position}</span>
                                  )}
                                  {modifiers.length > 0 && (
                                    <span className="font-medium text-sky-600 dark:text-sky-400">
                                      · {modifiers.join(' + ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingPlayerKey((prev) =>
                                    prev === trackerKey ? null : trackerKey,
                                  )
                                }
                                title="Modifier les sorts suivis (ex: Grimoire déchaîné)"
                                className={`px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colors shrink-0 ${
                                  isEditing
                                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                              >
                                ⇄
                              </button>
                            </div>

                            {/* 2 Boutons Sorts d'Invocateur */}
                            <div className="grid grid-cols-2 gap-2 flex-1 min-w-0">
                              {[
                                {
                                  spell: spell1,
                                  eff: eff1,
                                  left: left1,
                                  entry: entry1,
                                  activeBorder:
                                    teamBlock.id === 'ENEMY'
                                      ? 'border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                                      : 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                                  barColor:
                                    teamBlock.id === 'ENEMY' ? 'bg-rose-500' : 'bg-amber-500',
                                },
                                {
                                  spell: spell2,
                                  eff: eff2,
                                  left: left2,
                                  entry: entry2,
                                  activeBorder:
                                    teamBlock.id === 'ENEMY'
                                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                      : 'border-sky-500/60 bg-sky-500/10 text-sky-700 dark:text-sky-300',
                                  barColor:
                                    teamBlock.id === 'ENEMY' ? 'bg-amber-500' : 'bg-sky-500',
                                },
                              ].map((slot, slotIdx) => {
                                const totalSec = slot.entry?.totalSec || slot.eff.cooldownSec;
                                const pctLeft =
                                  slot.left > 0 && totalSec > 0
                                    ? Math.min(100, Math.max(4, Math.round((slot.left / totalSec) * 100)))
                                    : 0;
                                const readyAtGameSec = gameTimeSec + slot.left;

                                return (
                                  <button
                                    key={`${trackerKey}-slot-${slotIdx}`}
                                    type="button"
                                    onClick={() =>
                                      onToggleSpell(
                                        player.championName,
                                        champDisp.displayName,
                                        slot.spell.id,
                                        slot.spell.nameFr,
                                        slot.spell.chatCode,
                                        slot.eff.cooldownSec,
                                        teamBlock.id,
                                      )
                                    }
                                    title={
                                      slot.left > 0
                                        ? `${slot.spell.nameFr} en recharge (${formatClock(slot.left)}, prêt à ${formatClock(readyAtGameSec)}) — Cliquer pour annuler`
                                        : `Démarrer le chrono ${slot.spell.nameFr} (${formatClock(slot.eff.cooldownSec)})`
                                    }
                                    className={`relative overflow-hidden flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-left transition-colors min-w-0 ${
                                      slot.left > 0
                                        ? slot.activeBorder
                                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] text-slate-800 dark:text-slate-100 hover:border-amber-500/50'
                                    }`}
                                  >
                                    <SafeGameIcon
                                      src={getSummonerSpellIconUrl(slot.spell.id, patchVersion)}
                                      alt={slot.spell.nameFr}
                                      fallbackLabel={slot.spell.shortLabel}
                                      sizeClass={`w-6 h-6 rounded shrink-0 ${
                                        slot.left > 0 ? 'opacity-65 grayscale-[40%]' : ''
                                      }`}
                                    />
                                    <div className="min-w-0 flex-1">
                                      {slot.left > 0 ? (
                                        <>
                                          <div className="flex items-baseline justify-between gap-1">
                                            <span className="text-xs font-mono tabular-nums font-bold leading-tight">
                                              {formatClock(slot.left)}
                                            </span>
                                            <span className="text-[9.5px] font-mono tabular-nums opacity-80 truncate">
                                              @{formatClock(readyAtGameSec)}
                                            </span>
                                          </div>
                                          <div className="text-[10px] truncate opacity-85 leading-tight">
                                            {slot.spell.shortLabel}
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="text-[11px] font-semibold truncate leading-tight">
                                              {slot.spell.shortLabel}
                                            </span>
                                            <span
                                              className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                                              title="Sort disponible"
                                              aria-hidden="true"
                                            />
                                          </div>
                                          <div className="text-[10px] font-mono tabular-nums text-slate-400 leading-tight">
                                            Prêt · {formatClock(slot.eff.cooldownSec)}
                                          </div>
                                        </>
                                      )}
                                    </div>

                                    {slot.left > 0 && (
                                      <div
                                        className={`absolute bottom-0 left-0 h-0.5 ${slot.barColor} transition-all duration-500`}
                                        style={{ width: `${pctLeft}%` }}
                                        aria-hidden="true"
                                      />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {isEditing && (
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                              <select
                                value={spell1.id}
                                aria-label={`Sort 1 de ${champDisp.displayName}`}
                                onChange={(e) =>
                                  onOverrideSpell(
                                    player.championName,
                                    'spell1Id',
                                    Number(e.target.value),
                                  )
                                }
                                className="px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D121C] text-slate-800 dark:text-slate-100"
                              >
                                {SUMMONER_SPELLS.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    Sort 1 : {s.nameFr}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={spell2.id}
                                aria-label={`Sort 2 de ${champDisp.displayName}`}
                                onChange={(e) =>
                                  onOverrideSpell(
                                    player.championName,
                                    'spell2Id',
                                    Number(e.target.value),
                                  )
                                }
                                className="px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D121C] text-slate-800 dark:text-slate-100"
                              >
                                {SUMMONER_SPELLS.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    Sort 2 : {s.nameFr}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
