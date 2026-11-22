import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { ChampionSummary } from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';

export interface StoredMatchupNote {
  text: string;
  updatedAt: number;
}

export type MatchupNotesStorageMap = Record<string, StoredMatchupNote>;

export function parseStoredMatchupNotes(raw: string | null): MatchupNotesStorageMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: MatchupNotesStorageMap = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string') {
        if (val.trim()) out[key] = { text: val, updatedAt: 0 };
      } else if (val && typeof val === 'object') {
        const rec = val as { text?: unknown; updatedAt?: unknown };
        if (typeof rec.text === 'string' && rec.text.trim()) {
          out[key] = {
            text: rec.text,
            updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : 0,
          };
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

interface MatchupNotesModalProps {
  open: boolean;
  onClose: () => void;
  notesMap: MatchupNotesStorageMap;
  champions: ChampionSummary[];
  activePlayerChampId: string;
  activeEnemyChampId: string | null;
  onSaveNote: (key: string, text: string) => void;
  onDeleteNote: (key: string) => void;
  onLoadMatchup: (champAId: string, champBId: string) => void;
}

function formatNoteDate(ts: number): string {
  if (!ts) return 'Sauvegarde locale';
  try {
    return new Date(ts).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Sauvegarde locale';
  }
}

export function MatchupNotesModal({
  open,
  onClose,
  notesMap,
  champions,
  activePlayerChampId,
  activeEnemyChampId,
  onSaveNote,
  onDeleteNote,
  onLoadMatchup,
}: MatchupNotesModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyActivePlayer, setOnlyActivePlayer] = useState(false);

  // Édition inline d'une note existante
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // Création rapide d'un nouveau mémo pour n'importe quel duel
  const [showNewForm, setShowNewForm] = useState(false);
  const [newChampAId, setNewChampAId] = useState(activePlayerChampId);
  const [newChampBId, setNewChampBId] = useState(activeEnemyChampId || 'general');
  const [newNoteText, setNewNoteText] = useState('');

  // Possibilité d'annuler la dernière suppression (undo)
  const [lastDeleted, setLastDeleted] = useState<{
    key: string;
    label: string;
    note: StoredMatchupNote;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setNewChampAId(activePlayerChampId);
    setNewChampBId(activeEnemyChampId || 'general');
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingKey) {
          setEditingKey(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, editingKey, activePlayerChampId, activeEnemyChampId, onClose]);

  const sortedChampions = useMemo(
    () => [...champions].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [champions],
  );

  const champMap = useMemo(() => {
    const map = new Map<string, ChampionSummary>();
    for (const c of champions) map.set(c.id, c);
    return map;
  }, [champions]);

  const activeMatchupKey = `${activePlayerChampId}__${activeEnemyChampId || 'general'}`;
  const activePlayerName = champMap.get(activePlayerChampId)?.name || activePlayerChampId;

  const entries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return Object.entries(notesMap)
      .filter(([, val]) => val.text.trim().length > 0)
      .map(([key, val]) => {
        const [champAId, champBId = 'general'] = key.split('__');
        const champA = champMap.get(champAId);
        const champB = champBId !== 'general' ? champMap.get(champBId) : undefined;
        const champAName = champA?.name || champAId;
        const champBName = champB?.name || 'Draft général';
        return {
          key,
          champAId,
          champBId,
          champAName,
          champBName,
          champAIcon: champA?.imageUrl,
          champBIcon: champB?.imageUrl,
          text: val.text,
          updatedAt: val.updatedAt,
          isCurrent: key === activeMatchupKey,
        };
      })
      .filter((item) => {
        if (onlyActivePlayer && item.champAId !== activePlayerChampId) return false;
        if (!q) return true;
        return (
          item.champAName.toLowerCase().includes(q) ||
          item.champBName.toLowerCase().includes(q) ||
          item.text.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.isCurrent && !b.isCurrent) return -1;
        if (!a.isCurrent && b.isCurrent) return 1;
        return b.updatedAt - a.updatedAt || a.champAName.localeCompare(b.champAName, 'fr');
      });
  }, [notesMap, champMap, activeMatchupKey, activePlayerChampId, onlyActivePlayer, searchQuery]);

  const totalCount = useMemo(
    () => Object.values(notesMap).filter((v) => v.text.trim().length > 0).length,
    [notesMap],
  );

  const handleStartEdit = (key: string, currentText: string) => {
    setEditingKey(key);
    setEditingText(currentText);
  };

  const handleSaveEdit = (key: string) => {
    const cleaned = editingText.trim();
    if (!cleaned) {
      const prev = notesMap[key];
      if (prev) {
        const [a, b] = key.split('__');
        const nameA = champMap.get(a)?.name || a;
        const nameB = b && b !== 'general' ? champMap.get(b)?.name || b : 'Draft général';
        setLastDeleted({ key, label: `${nameA} vs ${nameB}`, note: prev });
      }
      onDeleteNote(key);
    } else {
      onSaveNote(key, cleaned);
    }
    setEditingKey(null);
    setEditingText('');
  };

  const handleDeleteWithUndo = (key: string, label: string) => {
    const prev = notesMap[key];
    if (prev) {
      setLastDeleted({ key, label, note: prev });
    }
    if (editingKey === key) {
      setEditingKey(null);
    }
    onDeleteNote(key);
  };

  const handleCreateNewNote = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newNoteText.trim();
    if (!cleaned || !newChampAId) return;
    const targetKey = `${newChampAId}__${newChampBId || 'general'}`;
    onSaveNote(targetKey, cleaned);
    setNewNoteText('');
    setShowNewForm(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.16, ease: 'easeOut' } }}
          exit={{ opacity: 0, transition: { duration: 0.11, ease: 'easeOut' } }}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Gestionnaire des mémos de match-ups"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 6 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] },
            }}
            exit={{
              opacity: 0,
              scale: 0.97,
              y: 4,
              transition: { duration: 0.12, ease: [0.23, 1, 0.32, 1] },
            }}
            className="w-full max-w-3xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
          >
            {/* En-tête */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
                  <span>Carnet de Match-ups ({totalCount})</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Créez, modifiez ou supprimez vos notes par duel. Stockées localement et injectées dans vos plans IA.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowNewForm((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                    showNewForm
                      ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'border-amber-500/50 bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{showNewForm ? 'Fermer l’ajout' : 'Nouvelle note'}</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fermer le carnet de match-ups"
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Formulaire de création rapide pour n'importe quel duel */}
            {showNewForm && (
              <form
                onSubmit={handleCreateNewNote}
                className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E131D] space-y-3 shrink-0"
              >
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Ajouter un mémo pour n’importe quel duel
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label
                      htmlFor="new-memo-champ-a"
                      className="block text-[11px] font-medium text-slate-500 dark:text-slate-400"
                    >
                      Votre champion
                    </label>
                    <select
                      id="new-memo-champ-a"
                      value={newChampAId}
                      onChange={(e) => setNewChampAId(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white"
                    >
                      {sortedChampions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="new-memo-champ-b"
                      className="block text-[11px] font-medium text-slate-500 dark:text-slate-400"
                    >
                      Adversaire direct
                    </label>
                    <select
                      id="new-memo-champ-b"
                      value={newChampBId}
                      onChange={(e) => setNewChampBId(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white"
                    >
                      <option value="general">Draft général (tous adversaires)</option>
                      {sortedChampions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <textarea
                  rows={2}
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Rédigez vos points clés (trade niveau 2, sort à garder, objectif de build...)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewForm(false)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={!newNoteText.trim()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 disabled:opacity-45"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Ajouter au carnet</span>
                  </button>
                </div>
              </form>
            )}

            {/* Barre de recherche & filtre */}
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#0E131D]/60 flex flex-col sm:flex-row sm:items-center gap-2.5 shrink-0">
              <div className="relative flex-1">
                <Search
                  className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher par champion ou mot-clé (ex: Leona, dash, niveau 2...)"
                  aria-label="Rechercher dans mes mémos"
                  className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Effacer la recherche"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setOnlyActivePlayer((v) => !v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  onlyActivePlayer
                    ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-600 dark:text-slate-300 hover:border-slate-400'
                }`}
              >
                Uniquement {activePlayerName}
              </button>
            </div>

            {/* Bannière d'annulation après suppression */}
            {lastDeleted && (
              <div className="mx-5 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 flex items-center justify-between gap-3 text-xs shrink-0">
                <span className="text-slate-700 dark:text-slate-200 truncate">
                  Mémo <strong>{lastDeleted.label}</strong> supprimé.
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onSaveNote(lastDeleted.key, lastDeleted.note.text);
                      setLastDeleted(null);
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300 hover:underline"
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    <span>Annuler</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLastDeleted(null)}
                    aria-label="Fermer la notification"
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Liste des mémos */}
            <div className="p-5 overflow-y-auto thin-scrollbar space-y-3 flex-1">
              {entries.length === 0 ? (
                <div className="py-12 text-center space-y-2.5">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {totalCount === 0
                      ? 'Votre carnet de match-ups est encore vide.'
                      : 'Aucun mémo ne correspond à votre recherche.'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    {totalCount === 0
                      ? 'Cliquez sur « Nouvelle note » ci-dessus ou rédigez un mémo directement sous la composition adverse.'
                      : 'Essayez un autre mot-clé ou désactivez le filtre actif.'}
                  </p>
                </div>
              ) : (
                entries.map((entry) => {
                  const isEditing = editingKey === entry.key;
                  return (
                    <div
                      key={entry.key}
                      className={`rounded-xl border p-3.5 space-y-2.5 transition-[border-color,background-color] duration-150 ${
                        entry.isCurrent
                          ? 'border-amber-500/50 bg-amber-500/5'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D121C]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex items-center -space-x-1.5 shrink-0">
                            <SafeGameIcon
                              src={entry.champAIcon}
                              alt={entry.champAName}
                              fallbackLabel={entry.champAName}
                              sizeClass="w-7 h-7 ring-2 ring-white dark:ring-[#121722]"
                            />
                            {entry.champBId !== 'general' && (
                              <SafeGameIcon
                                src={entry.champBIcon}
                                alt={entry.champBName}
                                fallbackLabel={entry.champBName}
                                sizeClass="w-7 h-7 ring-2 ring-white dark:ring-[#121722]"
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                              <span className="truncate">
                                {entry.champAName} vs {entry.champBName}
                              </span>
                              {entry.isCurrent && (
                                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                  · Duel actif
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                              {formatNoteDate(entry.updatedAt)}
                            </div>
                          </div>
                        </div>

                        {!isEditing && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!entry.isCurrent && (
                              <button
                                type="button"
                                onClick={() => {
                                  onLoadMatchup(entry.champAId, entry.champBId);
                                  onClose();
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121722] text-slate-700 dark:text-slate-200 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 whitespace-nowrap"
                              >
                                <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                                <span>Charger ce duel</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleStartEdit(entry.key, entry.text)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121722] text-slate-700 dark:text-slate-200 hover:border-sky-500 hover:text-sky-600 dark:hover:text-sky-400 whitespace-nowrap"
                            >
                              <Pencil className="w-3 h-3" aria-hidden="true" />
                              <span>Modifier</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteWithUndo(
                                  entry.key,
                                  `${entry.champAName} vs ${entry.champBName}`,
                                )
                              }
                              aria-label={`Supprimer le mémo ${entry.champAName} vs ${entry.champBName}`}
                              className="p-1.5 rounded-lg border border-transparent text-slate-400 hover:text-rose-500 hover:border-rose-500/30 hover:bg-rose-500/5 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="space-y-2 pt-1">
                          <textarea
                            rows={3}
                            autoFocus
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-amber-500/60 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              Astuce : laissez vide pour supprimer ce mémo.
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingKey(null);
                                  setEditingText('');
                                }}
                                className="px-3 py-1 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                Annuler
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(entry.key)}
                                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400"
                              >
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Enregistrer</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                          {entry.text}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
