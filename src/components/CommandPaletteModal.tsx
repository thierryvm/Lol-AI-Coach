import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  BookOpen,
  Compass,
  History,
  LayoutDashboard,
  Moon,
  NotebookPen,
  Search,
  Settings,
  Sun,
  Swords,
  X,
} from 'lucide-react';
import { parseStoredMatchupNotes } from './MatchupNotesModal.tsx';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import type { ChampionSummary, MatchRecord } from '../engines/types.ts';
import { resolveChampionDisplay } from '../utils/championDisplay.ts';

const MATCHUP_NOTES_STORAGE_KEY = 'lol_ai_coach_matchup_notes_v1';

export type CommandNavTab =
  | 'dashboard'
  | 'builds'
  | 'postgame'
  | 'live'
  | 'champions'
  | 'guide'
  | 'settings';

interface CommandActionItem {
  id: string;
  group: 'Navigation' | 'Champions (Build)' | 'Champions (Fiche)' | 'Parties archivées' | 'Mémos de duel';
  title: string;
  subtitle: string;
  iconUrl?: string;
  fallbackLabel?: string;
  badge?: string;
  run: () => void;
}

interface CommandPaletteModalProps {
  open: boolean;
  onClose: () => void;
  champions: ChampionSummary[];
  matches: MatchRecord[];
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onNavigateTab: (tab: CommandNavTab) => void;
  onOpenBuildForChampion: (championName: string, enemyName?: string) => void;
  onOpenEncyclopediaChampion: (championId: string) => void;
  onOpenMatchPostGame: (match: MatchRecord) => void;
}

export function CommandPaletteModal({
  open,
  onClose,
  champions,
  matches,
  darkMode,
  onToggleDarkMode,
  onNavigateTab,
  onOpenBuildForChampion,
  onOpenEncyclopediaChampion,
  onOpenMatchPostGame,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  const savedNotes = useMemo(() => {
    if (!open || typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(MATCHUP_NOTES_STORAGE_KEY);
      if (!raw) return [];
      const parsed = parseStoredMatchupNotes(raw);
      return Object.entries(parsed).map(([key, entry]) => {
        const [myChamp, enemyChampId = 'general'] = key.split('__');
        const enemyChamp = enemyChampId === 'general' ? 'Draft général' : enemyChampId;
        return {
          key,
          myChamp: myChamp || 'Champion',
          enemyChamp,
          enemyChampId: enemyChampId === 'general' ? undefined : enemyChampId,
          note: entry.text,
        };
      });
    } catch {
      return [];
    }
  }, [open]);

  const results = useMemo<CommandActionItem[]>(() => {
    const q = query.trim().toLowerCase();
    const list: CommandActionItem[] = [];

    const navActions: CommandActionItem[] = [
      {
        id: 'nav-live',
        group: 'Navigation',
        title: 'En partie · Live',
        subtitle: 'Télémétrie live, sorts ennemis (gameEvent), synergie combo, voix et contre-objets',
        badge: 'En partie',
        run: () => onNavigateTab('live'),
      },
      {
        id: 'nav-postgame',
        group: 'Navigation',
        title: 'Après la partie · Analyse Post-Game',
        subtitle: 'Carte tactique des morts, courbes d’évolution, débriefing IA et export CSV/JSON',
        badge: 'Post-Game',
        run: () => onNavigateTab('postgame'),
      },
      {
        id: 'nav-dashboard',
        group: 'Navigation',
        title: 'Aujourd’hui · Vue générale & Entraînement',
        subtitle: 'Conseil du jour, KPIs, Score de forme, recommandations et Synthèse Globale IA',
        badge: 'Session',
        run: () => onNavigateTab('dashboard'),
      },
      {
        id: 'nav-builds',
        group: 'Navigation',
        title: 'Avant la partie · Builds, Runes & Boutique LoL',
        subtitle: 'Contre-picks, boutique officielle & Recette, éditeur/synchro LCU des runes et simulateur',
        badge: 'Prépa',
        run: () => onNavigateTab('builds'),
      },
      {
        id: 'nav-champions',
        group: 'Navigation',
        title: 'Encyclopédie des Champions',
        subtitle: 'Stats niveaux 1–18, sorts et profils de dégâts par rôle',
        badge: 'Prépa',
        run: () => onNavigateTab('champions'),
      },
      {
        id: 'nav-guide',
        group: 'Navigation',
        title: 'Mode d’emploi · Guide interactif',
        subtitle: 'Parcours pas à pas, checklists et guide complet à jour de LoL AI Coach',
        badge: 'Aide',
        run: () => onNavigateTab('guide'),
      },
      {
        id: 'nav-settings',
        group: 'Navigation',
        title: 'Réglages & Compte',
        subtitle: 'Riot ID, profils Famille & Amis, fournisseur IA et pont Windows v3.4',
        badge: 'Compte',
        run: () => onNavigateTab('settings'),
      },
      {
        id: 'action-theme',
        group: 'Navigation',
        title: darkMode ? 'Passer au mode clair' : 'Passer au mode sombre',
        subtitle: 'Changer immédiatement l’apparence de l’interface',
        badge: 'Thème',
        run: onToggleDarkMode,
      },
    ];

    if (!q) {
      list.push(...navActions.slice(0, 5));
      for (const m of matches.slice(0, 4)) {
        const pDisp = resolveChampionDisplay(champions, m.player.championName);
        list.push({
          id: `match-${m.matchId}`,
          group: 'Parties archivées',
          title: `${pDisp.displayName} (${m.player.win ? 'Victoire' : 'Défaite'} · ${m.player.kills}/${m.player.deaths}/${m.player.assists})`,
          subtitle: `${m.player.teamPosition || 'Libre'} · ${Math.round(m.gameDurationSec / 60)} min · Ouvrir l’analyse Post-Game`,
          iconUrl: pDisp.imageUrl,
          fallbackLabel: pDisp.displayName,
          badge: m.player.win ? 'V' : 'D',
          run: () => onOpenMatchPostGame(m),
        });
      }
      for (const n of savedNotes.slice(0, 3)) {
        const myDisp = resolveChampionDisplay(champions, n.myChamp);
        const enemyDisp = n.enemyChampId
          ? resolveChampionDisplay(champions, n.enemyChamp).displayName
          : n.enemyChamp;
        list.push({
          id: `note-${n.key}`,
          group: 'Mémos de duel',
          title: `Mémo : ${myDisp.displayName} vs ${enemyDisp}`,
          subtitle: n.note,
          iconUrl: myDisp.imageUrl,
          fallbackLabel: myDisp.displayName,
          badge: 'Note',
          run: () => onOpenBuildForChampion(n.myChamp, n.enemyChampId),
        });
      }
      return list;
    }

    for (const item of navActions) {
      if (`${item.title} ${item.subtitle}`.toLowerCase().includes(q)) {
        list.push(item);
      }
    }

    // Recherche Champions (Build + Fiche encyclopédie)
    const matchedChamps = champions
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q),
      )
      .slice(0, 6);

    for (const c of matchedChamps) {
      list.push({
        id: `build-${c.id}`,
        group: 'Champions (Build)',
        title: `Préparer un build sur ${c.name}`,
        subtitle: `${c.tags.join(' · ')} — Ouvrir dans Builds & Match-ups`,
        iconUrl: c.imageUrl,
        fallbackLabel: c.name,
        badge: 'Build',
        run: () => onOpenBuildForChampion(c.name),
      });
      list.push({
        id: `champ-${c.id}`,
        group: 'Champions (Fiche)',
        title: `Fiche complète de ${c.name}`,
        subtitle: `${c.title} — Stats niveaux 1–18 et compétences`,
        iconUrl: c.imageUrl,
        fallbackLabel: c.name,
        badge: 'Fiche',
        run: () => onOpenEncyclopediaChampion(c.id),
      });
    }

    // Recherche Parties archivées
    const matchedMatches = matches
      .filter((m) => {
        const pDisp = resolveChampionDisplay(champions, m.player.championName);
        const oppDisp = m.laneOpponent
          ? resolveChampionDisplay(champions, m.laneOpponent.championName).displayName
          : '';
        return `${m.player.championName} ${pDisp.displayName} ${m.player.teamPosition} ${m.laneOpponent?.championName || ''} ${oppDisp} ${m.matchId}`
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 6);

    for (const m of matchedMatches) {
      const pDisp = resolveChampionDisplay(champions, m.player.championName);
      const oppName = m.laneOpponent
        ? resolveChampionDisplay(champions, m.laneOpponent.championName).displayName
        : '';
      list.push({
        id: `match-${m.matchId}`,
        group: 'Parties archivées',
        title: `${pDisp.displayName} (${m.player.win ? 'Victoire' : 'Défaite'} · ${m.player.kills}/${m.player.deaths}/${m.player.assists})`,
        subtitle: `${m.player.teamPosition || 'Libre'}${oppName ? ` vs ${oppName}` : ''} · ${Math.round(m.gameDurationSec / 60)} min`,
        iconUrl: pDisp.imageUrl,
        fallbackLabel: pDisp.displayName,
        badge: m.player.win ? 'V' : 'D',
        run: () => onOpenMatchPostGame(m),
      });
    }

    // Recherche Mémos de duel
    for (const n of savedNotes) {
      const myDisp = resolveChampionDisplay(champions, n.myChamp);
      const enemyDisplay = n.enemyChampId
        ? resolveChampionDisplay(champions, n.enemyChamp).displayName
        : n.enemyChamp;
      if (`${n.myChamp} ${myDisp.displayName} ${n.enemyChamp} ${enemyDisplay} ${n.note}`.toLowerCase().includes(q)) {
        list.push({
          id: `note-${n.key}`,
          group: 'Mémos de duel',
          title: `Mémo : ${myDisp.displayName} vs ${enemyDisplay}`,
          subtitle: n.note,
          iconUrl: myDisp.imageUrl,
          fallbackLabel: myDisp.displayName,
          badge: 'Note',
          run: () => onOpenBuildForChampion(n.myChamp, n.enemyChampId),
        });
      }
    }

    return list.slice(0, 14);
  }, [
    query,
    champions,
    matches,
    savedNotes,
    darkMode,
    onToggleDarkMode,
    onNavigateTab,
    onOpenBuildForChampion,
    onOpenEncyclopediaChampion,
    onOpenMatchPostGame,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) =>
          results.length > 0 ? (prev - 1 + results.length) % results.length : 0,
        );
      } else if (e.key === 'Enter' && results[activeIndex]) {
        e.preventDefault();
        results[activeIndex].run();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, results, activeIndex, onClose]);

  const renderLeadingIcon = (item: CommandActionItem) => {
    if (item.iconUrl) {
      return (
        <SafeGameIcon
          src={item.iconUrl}
          alt={item.title}
          fallbackLabel={item.fallbackLabel || item.title}
          sizeClass="w-7 h-7"
        />
      );
    }
    if (item.id === 'nav-dashboard') return <LayoutDashboard className="w-4 h-4 text-amber-500" />;
    if (item.id === 'nav-builds') return <Swords className="w-4 h-4 text-amber-500" />;
    if (item.id === 'nav-postgame') return <History className="w-4 h-4 text-sky-500" />;
    if (item.id === 'nav-live') return <Activity className="w-4 h-4 text-emerald-500" />;
    if (item.id === 'nav-champions') return <BookOpen className="w-4 h-4 text-amber-500" />;
    if (item.id === 'nav-guide') return <Compass className="w-4 h-4 text-amber-500" />;
    if (item.id === 'nav-settings') return <Settings className="w-4 h-4 text-slate-400" />;
    if (item.id === 'action-theme') {
      return darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-amber-600" />;
    }
    if (item.group === 'Mémos de duel') return <NotebookPen className="w-4 h-4 text-amber-500" />;
    return <History className="w-4 h-4 text-sky-500" />;
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Recherche rapide LoL AI Coach"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.15 } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-[2px]"
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: { duration: 0.16, ease: [0.23, 1, 0.32, 1] },
            }}
            exit={{
              opacity: 0,
              scale: 0.96,
              y: -6,
              transition: { duration: 0.11, ease: [0.23, 1, 0.32, 1] },
            }}
            className="relative w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E131D] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <Search className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un champion, une partie, un mémo ou un onglet..."
                className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer la recherche rapide"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[56vh] overflow-y-auto p-2 space-y-1 thin-scrollbar">
              {results.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                  Aucun résultat pour « {query} ». Essayez un nom de champion (ex : Tahm, Sona) ou un onglet.
                </div>
              ) : (
                results.map((item, idx) => {
                  const isActive = idx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => {
                        item.run();
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                        isActive
                          ? 'bg-amber-500/12 border border-amber-500/35'
                          : 'border border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center shrink-0">
                          {renderLeadingIcon(item)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {item.subtitle}
                          </div>
                        </div>
                      </div>
                      {item.badge && (
                        <span
                          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded shrink-0 ${
                            item.badge === 'V'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : item.badge === 'D'
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>↑↓ pour naviguer · Entrée pour ouvrir · Échap pour fermer</span>
              <span className="font-mono">Ctrl+K / ⌘K</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
