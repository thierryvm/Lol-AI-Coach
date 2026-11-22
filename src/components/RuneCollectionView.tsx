import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Layers,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { RunePageSelection } from '../engines/runeEngine.ts';
import type { RuneSlotItem, RuneTree } from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import { getTreeTheme, RunicMonolithArt } from './VisualRunePage.tsx';

export interface SavedRunePageEntry {
  id: string;
  name: string;
  championId?: string;
  selection: RunePageSelection;
  updatedAt: number;
  /** ID réel de la page dans le client League of Legends (LCU /lol-perks/v1/pages) */
  lcuId?: number;
  /** Indique si cette page est actuellement équipée comme page active dans LoL */
  isLcuCurrent?: boolean;
  /** True si importée/synchronisée avec le client LoL */
  syncedFromClient?: boolean;
}

export const RUNE_PAGES_STORAGE_KEY = 'lol_ai_coach_saved_rune_pages_v1';
export const MAX_SAVED_RUNE_PAGES = 15;

export function loadSavedRunePages(): SavedRunePageEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RUNE_PAGES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is SavedRunePageEntry =>
          Boolean(entry) &&
          typeof entry.id === 'string' &&
          typeof entry.name === 'string' &&
          Boolean(entry.selection) &&
          typeof entry.selection.primaryTreeId === 'number',
      )
      .slice(0, MAX_SAVED_RUNE_PAGES);
  } catch {
    return [];
  }
}

export function saveRunePagesToStorage(pages: SavedRunePageEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      RUNE_PAGES_STORAGE_KEY,
      JSON.stringify(pages.slice(0, MAX_SAVED_RUNE_PAGES)),
    );
  } catch {
    // ignore storage quota errors
  }
}

interface RuneCollectionCardProps {
  page: SavedRunePageEntry;
  pTree: RuneTree | null;
  sTree: RuneTree | null;
  keystone: RuneSlotItem | null;
  isSelected: boolean;
  deleteMode: boolean;
  lcuConnected: boolean;
  onSelectPage: (page: SavedRunePageEntry) => void;
  onDeletePage: (pageId: string) => void;
  onActivateInClient?: (page: SavedRunePageEntry) => void;
}

function RuneCollectionCard({
  page,
  pTree,
  sTree,
  keystone,
  isSelected,
  deleteMode,
  lcuConnected,
  onSelectPage,
  onDeletePage,
  onActivateInClient,
}: RuneCollectionCardProps) {
  const [cardImgFailed, setCardImgFailed] = useState(false);
  const [keystoneOverlayFailed, setKeystoneOverlayFailed] = useState(false);
  const theme = getTreeTheme(pTree);
  const treeId = pTree?.id || 8000;

  // Résoudre les noms des runes pour la liste au survol (façon Gwen Top dans l'officiel)
  const runePreviewLines = useMemo(() => {
    const primaryNames: string[] = [];
    if (keystone?.name) primaryNames.push(keystone.name);
    for (const minorId of page.selection.primaryMinorIds) {
      const found = pTree?.slots?.flatMap((s) => s.runes).find((r) => r.id === minorId);
      if (found) primaryNames.push(found.name);
    }
    const secondaryNames: string[] = [];
    for (const secId of page.selection.secondaryMinorIds) {
      const found = sTree?.slots?.flatMap((s) => s.runes).find((r) => r.id === secId);
      if (found) secondaryNames.push(found.name);
    }
    return { primaryNames, secondaryNames };
  }, [page.selection, pTree, sTree, keystone]);

  const inventoryCardSrc = `/assets/runes/${treeId}/inventory_card.jpg`;
  const keystoneConstructSrc = keystone
    ? `/assets/runes/${treeId}/keystones/${keystone.id}.png`
    : null;

  return (
    <div
      className={`group relative aspect-[3/4] overflow-hidden border transition-[transform,border-color,box-shadow] duration-200 ${
        deleteMode
          ? 'border-rose-400/70 hover:border-rose-300'
          : isSelected
            ? 'border-[#C8AA6E] ring-1 ring-[#C8AA6E] shadow-[0_0_24px_rgba(200,170,110,0.3)]'
            : 'border-[#785A28]/60 hover:border-[#C8AA6E] hover:-translate-y-0.5'
      }`}
      style={{ background: theme.backdropGradient }}
    >
      <button
        type="button"
        onClick={() => {
          if (deleteMode) {
            onDeletePage(page.id);
          } else {
            onSelectPage(page);
          }
        }}
        className="w-full h-full text-left flex flex-col justify-between focus:outline-none"
      >
        {/* Fond officiel Riot inventory_card.jpg + monument keystone OU fallback RunicMonolithArt */}
        <div className="absolute inset-0 pointer-events-none transition-transform duration-300 group-hover:scale-105">
          {!cardImgFailed ? (
            <>
              <img
                src={inventoryCardSrc}
                alt={pTree?.name || 'Fond de page'}
                onError={() => setCardImgFailed(true)}
                className="w-full h-full object-cover object-center"
              />
              {keystoneConstructSrc && !keystoneOverlayFailed && (
                <img
                  src={keystoneConstructSrc}
                  alt=""
                  aria-hidden="true"
                  onError={() => setKeystoneOverlayFailed(true)}
                  className="absolute inset-0 w-full h-full object-contain scale-[1.08] -translate-y-4 opacity-95"
                />
              )}
            </>
          ) : (
            <RunicMonolithArt
              primaryTree={pTree}
              secondaryTree={sTree}
              keystoneRune={keystone}
              theme={theme}
              cardMode
            />
          )}
        </div>

        {/* Overlay sombre au survol affichant la liste des runes (exactement comme Gwen Top sur le client) */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[#020A13]/82 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-3.5 pt-9 flex flex-col justify-start gap-2 pointer-events-none"
        >
          <div>
            <div className={`text-[10px] font-bold uppercase tracking-wider ${theme.textClass}`}>
              {pTree?.name || 'Voie principale'}
            </div>
            <ul className="mt-0.5 space-y-0.5">
              {runePreviewLines.primaryNames.slice(0, 4).map((rn, idx) => (
                <li
                  key={`p-${idx}`}
                  className="text-[10px] text-[#F0E6D2]/90 truncate flex items-center gap-1.5"
                >
                  <span className="w-1 h-1 rotate-45 bg-[#C8AA6E] shrink-0" />
                  <span className="truncate">{rn}</span>
                </li>
              ))}
            </ul>
          </div>
          {sTree && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#A09B8C]">
                {sTree.name}
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {runePreviewLines.secondaryNames.slice(0, 2).map((rn, idx) => (
                  <li
                    key={`s-${idx}`}
                    className="text-[10px] text-[#C8C3B4] truncate flex items-center gap-1.5"
                  >
                    <span className="w-1 h-1 rotate-45 bg-[#A09B8C] shrink-0" />
                    <span className="truncate">{rn}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Vignette sombre en bas pour lisibilité du titre façon Collection officielle */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#01070E] via-[#01070E]/85 to-transparent pointer-events-none"
        />

        {/* Badges haut de carte : Sync LoL / Active / Supprimer */}
        <div className="relative z-10 p-2.5 flex items-center justify-between gap-1">
          <div>
            {page.lcuId && !deleteMode && (
              <span
                title="Page présente dans votre client League of Legends"
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                  page.isLcuCurrent
                    ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-200'
                    : 'bg-[#010A13]/85 border-sky-400/50 text-sky-300'
                }`}
              >
                <Radio className="w-2.5 h-2.5" aria-hidden="true" />
                {page.isLcuCurrent ? 'Équipée LoL' : 'Client LoL'}
              </span>
            )}
          </div>

          <div>
            {isSelected && !deleteMode && (
              <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#010A13]/90 border border-[#C8AA6E] text-[#F0E6D2]">
                Ouverte
              </span>
            )}
            {deleteMode && (
              <span className="inline-flex p-1.5 rounded-full bg-rose-600/90 text-white shadow">
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            )}
          </div>
        </div>

        {/* Pied de carte : Titre majuscule + Icône Fondamentale + Crête Secondaire */}
        <div className="relative z-10 p-3.5 space-y-2.5">
          <div className="text-xs font-bold uppercase tracking-wider text-[#F0E6D2] truncate drop-shadow">
            {page.name}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {keystone && (
                <div className="w-8 h-8 rounded-full bg-[#030912] ring-1 ring-[#C8AA6E]/80 flex items-center justify-center shrink-0">
                  <SafeGameIcon
                    src={keystone.imageUrl}
                    alt={keystone.name}
                    fallbackLabel={keystone.name}
                    sizeClass="w-7 h-7"
                    className="rounded-full border-0"
                  />
                </div>
              )}
              {sTree && (
                <div className="w-6 h-6 rounded-full bg-[#030912]/90 border border-[#785A28]/70 flex items-center justify-center shrink-0">
                  <SafeGameIcon
                    src={sTree.imageUrl}
                    alt={sTree.name}
                    fallbackLabel={sTree.name}
                    sizeClass="w-4 h-4"
                    className="rounded-full border-0"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </button>

      {/* Bouton rapide pour équiper cette page directement dans le Client LoL */}
      {!deleteMode && lcuConnected && page.lcuId && !page.isLcuCurrent && onActivateInClient && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onActivateInClient(page);
          }}
          title="Définir comme page active dans votre client League of Legends"
          className="absolute bottom-3 right-3 z-20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider border border-sky-400/60 bg-[#041426]/95 text-sky-200 hover:bg-sky-500 hover:text-slate-950 transition-colors opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
        >
          Activer LoL
        </button>
      )}
    </div>
  );
}

interface RuneCollectionViewProps {
  pages: SavedRunePageEntry[];
  activePageId: string | null;
  runeTrees: RuneTree[];
  currentChampionName: string;
  lcuConnected?: boolean;
  isInsideIframe?: boolean;
  syncFeedback?: string | null;
  onSelectPage: (page: SavedRunePageEntry) => void;
  onCreateNewPage: () => void;
  onSaveCurrentMetaAsPage: () => void;
  onDeletePage: (pageId: string) => void;
  onSyncFromClient?: () => void;
  onDownloadBridge?: () => void;
  onActivateInClient?: (page: SavedRunePageEntry) => void;
}

export function RuneCollectionView({
  pages,
  activePageId,
  runeTrees,
  currentChampionName,
  lcuConnected = false,
  isInsideIframe = false,
  syncFeedback = null,
  onSelectPage,
  onCreateNewPage,
  onSaveCurrentMetaAsPage,
  onDeletePage,
  onSyncFromClient,
  onDownloadBridge,
  onActivateInClient,
}: RuneCollectionViewProps) {
  const [search, setSearch] = useState('');
  const [treeFilterId, setTreeFilterId] = useState<number | 'all'>('all');
  const [deleteMode, setDeleteMode] = useState(false);

  const filteredPages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pages.filter((p) => {
      if (treeFilterId !== 'all' && p.selection.primaryTreeId !== treeFilterId) {
        return false;
      }
      if (!q) return true;
      const pTree = runeTrees.find((t) => t.id === p.selection.primaryTreeId);
      const keystone = pTree?.slots?.[0]?.runes.find((r) => r.id === p.selection.keystoneId);
      const haystack = `${p.name} ${p.championId || ''} ${pTree?.name || ''} ${keystone?.name || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [pages, search, treeFilterId, runeTrees]);

  const atLimit = pages.length >= MAX_SAVED_RUNE_PAGES;
  const syncedCount = pages.filter((p) => Boolean(p.lcuId)).length;

  return (
    <section className="relative rounded-xl border border-[#785A28]/70 bg-[#010A13] overflow-hidden shadow-2xl">
      {/* Halo subtil bleu-nuit façon onglet Collection > Runes */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 20% 0%, rgba(10, 200, 185, 0.08) 0%, transparent 45%), radial-gradient(circle at 80% 100%, rgba(200, 170, 110, 0.08) 0%, transparent 50%)',
        }}
      />

      {/* Barre d'outils supérieure fidèle à la Collection officielle */}
      <div className="relative z-10 px-5 py-4 border-b border-[#C8AA6E]/25 bg-[#010A13]/90 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Champ Chercher */}
          <div className="relative w-full sm:w-56">
            <Search
              className="w-3.5 h-3.5 text-[#A09B8C] absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Chercher"
              aria-label="Chercher une page de runes"
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-[#010A13] border border-[#785A28]/80 text-[#F0E6D2] placeholder-[#5B5A56] focus:outline-none focus:border-[#C8AA6E]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Effacer la recherche"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A09B8C] hover:text-[#F0E6D2]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtres par Voie avec soulignement doré */}
          <div className="flex items-center gap-3 overflow-x-auto">
            <button
              type="button"
              onClick={() => setTreeFilterId('all')}
              title="Toutes les voies"
              className={`relative pb-1.5 px-1 flex items-center justify-center transition-opacity ${
                treeFilterId === 'all'
                  ? 'text-[#F0E6D2] opacity-100'
                  : 'text-[#A09B8C] opacity-55 hover:opacity-100'
              }`}
            >
              <Layers className="w-4 h-4 text-[#C8AA6E]" aria-hidden="true" />
              {treeFilterId === 'all' && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#C8AA6E]" />
              )}
            </button>

            {runeTrees.map((tree) => {
              const active = treeFilterId === tree.id;
              return (
                <button
                  key={`col-filter-${tree.id}`}
                  type="button"
                  onClick={() => setTreeFilterId(active ? 'all' : tree.id)}
                  title={`Filtrer : ${tree.name}`}
                  className={`relative pb-1.5 px-1 transition-[opacity,transform] duration-150 ${
                    active ? 'opacity-100 scale-105' : 'opacity-45 hover:opacity-100'
                  }`}
                >
                  <SafeGameIcon
                    src={tree.imageUrl}
                    alt={tree.name}
                    fallbackLabel={tree.name}
                    sizeClass="w-5 h-5"
                    className="rounded-full border-0"
                  />
                  {active && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#C8AA6E]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Compteur X / 15 + Bouton NOUVELLE PAGE + Bascule Poubelle */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="text-sm font-mono tabular-nums tracking-wider">
            <span className="font-bold text-[#F0E6D2]">{pages.length}</span>
            <span className="text-[#5B5A56] mx-1">/</span>
            <span className="text-[#A09B8C]">{MAX_SAVED_RUNE_PAGES}</span>
          </div>

          <button
            type="button"
            disabled={atLimit}
            onClick={onSaveCurrentMetaAsPage}
            title={`Enregistrer la page conseillée pour ${currentChampionName}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold border border-[#C8AA6E]/45 bg-[#091428] text-[#C8AA6E] hover:border-[#C8AA6E] hover:text-[#F0E6D2] disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Importer méta {currentChampionName}</span>
          </button>

          <button
            type="button"
            disabled={atLimit}
            onClick={onCreateNewPage}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.12em] border border-[#C8AA6E] bg-[#1E2328] text-[#F0E6D2] hover:bg-[#2A3036] disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 text-[#C8AA6E]" aria-hidden="true" />
            <span>NOUVELLE PAGE</span>
          </button>

          {/* Switch Mode Suppression */}
          <button
            type="button"
            role="switch"
            aria-checked={deleteMode}
            onClick={() => setDeleteMode((v) => !v)}
            title={
              deleteMode
                ? 'Désactiver le mode suppression'
                : 'Activer le mode suppression de pages'
            }
            aria-label="Activer ou désactiver le mode suppression"
            className={`relative inline-flex items-center w-14 h-7 rounded-full border transition-colors p-0.5 ${
              deleteMode
                ? 'border-rose-400 bg-rose-500/20 justify-end'
                : 'border-[#785A28] bg-[#091428] justify-start'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors ${
                deleteMode
                  ? 'border-rose-300 bg-rose-500 text-white'
                  : 'border-[#C8AA6E]/80 bg-[#1E2328] text-[#C8AA6E]'
              }`}
            >
              <Trash2 className="w-3 h-3" aria-hidden="true" />
            </span>
          </button>
        </div>
      </div>

      {/* Barre de connexion bidirectionnelle LCU Client LoL */}
      <div className="relative z-10 px-5 py-2.5 border-b border-[#C8AA6E]/15 bg-[#040E1A]/90 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-[#C8C3B4] min-w-0">
          {lcuConnected ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
              <span>
                <strong className="text-emerald-300">Client LoL connecté en direct (v3.4)</strong> —{' '}
                {syncedCount} page{syncedCount > 1 ? 's' : ''} synchronisée{syncedCount > 1 ? 's' : ''}.
                Toute modification, création ou suppression s’applique directement dans League of Legends.
              </span>
            </>
          ) : (
            <>
              <Radio className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              <span>
                <strong className="text-amber-300">Synchronisation directe LoL (v3.4)</strong> —{' '}
                {isInsideIframe
                  ? 'Ouvrez l’appli hors iframe (nouvel onglet) ou utilisez le bouton Sync / Ctrl+V avec le pont v3.4 pour importer et modifier toutes vos pages LoL.'
                  : 'Lancez le nouveau lol-coach-bridge.bat (v3.4) sur Windows puis cliquez sur Synchroniser pour lire et modifier toutes vos pages LoL en direct.'}
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onSyncFromClient && (
            <button
              type="button"
              onClick={onSyncFromClient}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold border border-sky-400/50 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />
              <span>{lcuConnected ? 'Actualiser depuis LoL' : 'Synchroniser client LoL'}</span>
            </button>
          )}
          {onDownloadBridge && (
            <button
              type="button"
              onClick={onDownloadBridge}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold border border-[#C8AA6E]/55 bg-[#091428] text-[#F0E6D2] hover:border-[#C8AA6E] transition-colors whitespace-nowrap"
            >
              <Download className="w-3 h-3 text-[#C8AA6E]" aria-hidden="true" />
              <span>Pont Windows v3.4 (.bat)</span>
            </button>
          )}
        </div>
      </div>

      {/* Grille des cartes portraits officielles */}
      <div className="relative z-10 p-5 space-y-4">
        {syncFeedback && (
          <div className="px-3.5 py-2 border border-sky-400/45 bg-sky-500/10 text-xs text-sky-200">
            {syncFeedback}
          </div>
        )}

        {deleteMode && (
          <div className="px-3.5 py-2 border border-rose-400/45 bg-rose-500/10 text-xs text-rose-200 flex items-center justify-between gap-2">
            <span>
              Mode suppression actif : cliquez sur une page de runes pour la supprimer
              {lcuConnected ? ' (y compris dans votre client League of Legends).' : '.'}
            </span>
            <button
              type="button"
              onClick={() => setDeleteMode(false)}
              className="font-semibold text-rose-100 underline shrink-0"
            >
              Terminer
            </button>
          </div>
        )}

        {filteredPages.length === 0 ? (
          <div className="py-14 text-center space-y-3">
            <p className="text-sm text-[#A09B8C]">
              {pages.length === 0
                ? 'Aucune page sauvegardée pour le moment.'
                : 'Aucune page ne correspond à ce filtre.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {(search || treeFilterId !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setTreeFilterId('all');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold border border-[#C8AA6E]/60 text-[#F0E6D2] hover:bg-[#C8AA6E]/15"
                >
                  Réinitialiser la recherche
                </button>
              )}
              {!atLimit && (
                <button
                  type="button"
                  onClick={onCreateNewPage}
                  className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider border border-[#C8AA6E] bg-[#1E2328] text-[#F0E6D2]"
                >
                  Créer une page
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredPages.map((page) => {
              const pTree =
                runeTrees.find((t) => t.id === page.selection.primaryTreeId) || runeTrees[0] || null;
              const sTree =
                runeTrees.find((t) => t.id === page.selection.secondaryTreeId) || null;
              const keystone: RuneSlotItem | null =
                pTree?.slots?.[0]?.runes.find((r) => r.id === page.selection.keystoneId) || null;

              return (
                <RuneCollectionCard
                  key={page.id}
                  page={page}
                  pTree={pTree}
                  sTree={sTree}
                  keystone={keystone}
                  isSelected={activePageId === page.id}
                  deleteMode={deleteMode}
                  lcuConnected={lcuConnected}
                  onSelectPage={onSelectPage}
                  onDeletePage={onDeletePage}
                  onActivateInClient={onActivateInClient}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
