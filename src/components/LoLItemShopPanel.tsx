import { useEffect, useMemo, useState } from 'react';
import {
  BookmarkPlus,
  Coins,
  FolderOpen,
  Info,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { extractRawDataDragonItemDetails, parseExactItemStats } from '../engines/buildSimulator.ts';
import type { GameModeContext, ItemData } from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';

export interface SavedItemSetEntry {
  id: string;
  name: string;
  championName: string;
  itemIds: (string | null)[];
  totalGold: number;
  updatedAt: number;
}

export const ITEM_SETS_STORAGE_KEY = 'lol_ai_coach_saved_item_sets_v1';

export function loadSavedItemSets(): SavedItemSetEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ITEM_SETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is SavedItemSetEntry =>
        Boolean(entry) &&
        typeof entry.id === 'string' &&
        typeof entry.name === 'string' &&
        Array.isArray(entry.itemIds),
    );
  } catch {
    return [];
  }
}

export function saveItemSetsToStorage(sets: SavedItemSetEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ITEM_SETS_STORAGE_KEY, JSON.stringify(sets.slice(0, 20)));
  } catch {
    // ignore storage quota errors
  }
}

type ShopCategory = 'all' | 'boots_starter' | 'components' | 'legendary' | 'recommended';
type StatFilterId =
  | 'ad'
  | 'ap'
  | 'as'
  | 'crit'
  | 'armor'
  | 'mr'
  | 'hp'
  | 'haste'
  | 'pen'
  | 'mana'
  | 'antiheal';

const STAT_FILTERS: Array<{ id: StatFilterId; label: string }> = [
  { id: 'ad', label: "Dégâts d'attaque" },
  { id: 'ap', label: 'Puissance (AP)' },
  { id: 'as', label: "Vitesse d'attaque" },
  { id: 'crit', label: 'Coups critiques' },
  { id: 'armor', label: 'Armure' },
  { id: 'mr', label: 'Rés. magique' },
  { id: 'hp', label: 'Points de vie' },
  { id: 'haste', label: 'Accélération' },
  { id: 'pen', label: 'Pénét. / Létalité' },
  { id: 'mana', label: 'Mana / Régén.' },
  { id: 'antiheal', label: 'Anti-soin' },
];

export interface LoLItemShopPanelProps {
  allItems: ItemData[];
  gameMode: GameModeContext;
  championName: string;
  slots: (ItemData | null)[];
  recommendedItemIds?: Set<string>;
  initialTargetSlotIdx?: number | null;
  initialInspectedItemId?: string | null;
  onAssignSlot: (slotIdx: number, item: ItemData | null) => void;
  onApplyItemSet?: (itemIds: (string | null)[]) => void;
  onResetToRecommended?: () => void;
  onExplainPassive?: (item: ItemData) => void;
  hasPassiveInfo?: (item: ItemData) => boolean;
  isModal?: boolean;
  onCloseModal?: () => void;
}

export function LoLItemShopPanel({
  allItems,
  gameMode,
  championName,
  slots,
  recommendedItemIds,
  initialTargetSlotIdx = 0,
  initialInspectedItemId = null,
  onAssignSlot,
  onApplyItemSet,
  onResetToRecommended,
  onExplainPassive,
  hasPassiveInfo,
  isModal = false,
  onCloseModal,
}: LoLItemShopPanelProps) {
  const resolveDefaultSlotIdx = (val: number | null | undefined): number => {
    if (typeof val === 'number' && val >= 0 && val < slots.length) return val;
    const firstEmpty = slots.findIndex((s) => !s);
    return firstEmpty !== -1 ? firstEmpty : Math.max(0, slots.length - 1);
  };

  const [activeTab, setActiveTab] = useState<'shop' | 'sets'>('shop');
  const [category, setCategory] = useState<ShopCategory>('all');
  const [selectedStatFilters, setSelectedStatFilters] = useState<StatFilterId[]>([]);
  const [search, setSearch] = useState('');
  const [targetSlotIdx, setTargetSlotIdx] = useState<number>(() =>
    resolveDefaultSlotIdx(initialTargetSlotIdx),
  );

  const [savedSets, setSavedSets] = useState<SavedItemSetEntry[]>(() => loadSavedItemSets());
  const [newSetName, setNewSetName] = useState('');
  const [setFeedback, setSetFeedback] = useState<string | null>(null);

  // Index global complet par ID et par nom pour résoudre fidèlement from/into Data Dragon
  const { itemById, mapFilteredItems } = useMemo(() => {
    const mapKey = gameMode === 'ARAM' ? '12' : '11';
    const byId = new Map<string, ItemData>();
    const validList: ItemData[] = [];

    for (const it of allItems) {
      byId.set(it.id, it);
      if (
        Number(it.id) < 100000 &&
        it.gold.purchasable &&
        it.gold.total > 0 &&
        !it.tags.includes('Consumable') &&
        !it.tags.includes('Trinket') &&
        (!it.maps || it.maps[mapKey] !== false)
      ) {
        validList.push(it);
      }
    }

    // Dédupliquer pour la grille d'achat
    const dedup = new Map<string, ItemData>();
    for (const it of validList) {
      const k = it.name.trim().toLowerCase();
      const prev = dedup.get(k);
      if (!prev || Number(it.id) < Number(prev.id)) {
        dedup.set(k, it);
      }
    }

    const sorted = Array.from(dedup.values()).sort((a, b) => b.gold.total - a.gold.total);
    return { itemById: byId, mapFilteredItems: sorted };
  }, [allItems, gameMode]);

  const initialSelectedItem = useMemo(() => {
    if (initialInspectedItemId && itemById.has(initialInspectedItemId)) {
      return itemById.get(initialInspectedItemId) || null;
    }
    const slotItem =
      (typeof initialTargetSlotIdx === 'number' ? slots[initialTargetSlotIdx] : null) ||
      slots.find(Boolean) ||
      null;
    return slotItem || mapFilteredItems[0] || null;
  }, [initialInspectedItemId, itemById, slots, initialTargetSlotIdx, mapFilteredItems]);

  const [inspectedItemId, setInspectedItemId] = useState<string | null>(
    initialSelectedItem?.id || null,
  );

  useEffect(() => {
    setTargetSlotIdx(resolveDefaultSlotIdx(initialTargetSlotIdx));
  }, [initialTargetSlotIdx]);

  useEffect(() => {
    if (initialInspectedItemId && itemById.has(initialInspectedItemId)) {
      setInspectedItemId(initialInspectedItemId);
    }
  }, [initialInspectedItemId, itemById]);

  const inspectedItem = useMemo(
    () =>
      (inspectedItemId ? itemById.get(inspectedItemId) : null) ||
      initialSelectedItem ||
      mapFilteredItems[0] ||
      null,
    [inspectedItemId, itemById, initialSelectedItem, mapFilteredItems],
  );

  const equippedIds = useMemo(
    () => new Set(slots.filter((s): s is ItemData => Boolean(s)).map((s) => s.id)),
    [slots],
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mapFilteredItems.filter((it) => {
      if (q) {
        const hay = `${it.name} ${it.plaintext}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (category === 'boots_starter') {
        const isBootOrStarter =
          it.tags.includes('Boots') ||
          (it.gold.total <= 500 && !it.from?.length) ||
          it.tags.includes('Lane');
        if (!isBootOrStarter) return false;
      } else if (category === 'components') {
        const isComp =
          !it.tags.includes('Boots') &&
          it.gold.total > 200 &&
          it.gold.total < 1900 &&
          Boolean(it.into && it.into.length > 0);
        if (!isComp) return false;
      } else if (category === 'legendary') {
        const isLeg = !it.tags.includes('Boots') && it.gold.total >= 2000 && (!it.into || it.into.length === 0);
        if (!isLeg) return false;
      } else if (category === 'recommended') {
        if (!recommendedItemIds?.has(it.id)) return false;
      }

      if (selectedStatFilters.length > 0) {
        const st = parseExactItemStats(it);
        const txt = `${it.name} ${it.description}`.toLowerCase();
        for (const f of selectedStatFilters) {
          if (f === 'ad' && st.ad <= 0) return false;
          if (f === 'ap' && st.ap <= 0) return false;
          if (f === 'as' && st.attackSpeedPct <= 0) return false;
          if (f === 'crit' && st.critChancePct <= 0) return false;
          if (f === 'armor' && st.armor <= 0) return false;
          if (f === 'mr' && st.mr <= 0) return false;
          if (f === 'hp' && st.hp <= 0) return false;
          if (f === 'haste' && st.abilityHaste <= 0) return false;
          if (
            f === 'pen' &&
            st.lethality <= 0 &&
            st.armorPenPct <= 0 &&
            st.magicPenFlat <= 0 &&
            st.magicPenPct <= 0
          ) {
            return false;
          }
          if (f === 'mana' && st.mana <= 0 && st.manaRegenPct <= 0) return false;
          if (
            f === 'antiheal' &&
            !txt.match(/hémorragie|blessures graves|épineuse|thornmail|mortal|morello|bourreau/)
          ) {
            return false;
          }
        }
      }

      return true;
    });
  }, [mapFilteredItems, search, category, selectedStatFilters, recommendedItemIds]);

  const toggleStatFilter = (id: StatFilterId) => {
    setSelectedStatFilters((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // Résoudre Construit vers (into) et Recette de fabrication (from)
  const inspectedDetails = useMemo(() => {
    if (!inspectedItem) return null;
    const raw = extractRawDataDragonItemDetails(inspectedItem);

    const intoItems: ItemData[] = (inspectedItem.into || [])
      .map((id) => itemById.get(id))
      .filter((x): x is ItemData => Boolean(x))
      .filter((x) => x.gold.purchasable && Number(x.id) < 100000)
      .slice(0, 10);

    const fromItems: Array<{ item: ItemData; subFrom: ItemData[] }> = (inspectedItem.from || [])
      .map((id) => itemById.get(id))
      .filter((x): x is ItemData => Boolean(x))
      .map((child) => ({
        item: child,
        subFrom: (child.from || [])
          .map((subId) => itemById.get(subId))
          .filter((x): x is ItemData => Boolean(x)),
      }));

    return { raw, intoItems, fromItems };
  }, [inspectedItem, itemById]);

  const totalSlotsGold = useMemo(
    () => slots.reduce((acc, s) => acc + (s?.gold.total || 0), 0),
    [slots],
  );

  const handleEquipToTarget = (item: ItemData) => {
    onAssignSlot(targetSlotIdx, item);
    if (isModal && onCloseModal) {
      onCloseModal();
    }
  };

  const handleEquipNextEmpty = (item: ItemData) => {
    const emptyIdx = slots.findIndex((s) => !s);
    const chosenIdx = emptyIdx !== -1 ? emptyIdx : targetSlotIdx;
    onAssignSlot(chosenIdx, item);
    setTargetSlotIdx(chosenIdx);
  };

  const handleSaveCurrentItemSet = () => {
    const cleanName = newSetName.trim() || `${championName} · Ensemble S16`;
    const newEntry: SavedItemSetEntry = {
      id: `itemset-${Date.now()}`,
      name: cleanName,
      championName,
      itemIds: slots.map((s) => s?.id || null),
      totalGold: totalSlotsGold,
      updatedAt: Date.now(),
    };
    const next = [newEntry, ...savedSets].slice(0, 20);
    setSavedSets(next);
    saveItemSetsToStorage(next);
    setNewSetName('');
    setSetFeedback(`Ensemble « ${cleanName} » enregistré.`);
    window.setTimeout(() => setSetFeedback(null), 2500);
  };

  const handleDeleteItemSet = (setId: string) => {
    const next = savedSets.filter((s) => s.id !== setId);
    setSavedSets(next);
    saveItemSetsToStorage(next);
  };

  return (
    <section className="relative rounded-xl border border-[#785A28]/80 bg-[#010A13] text-[#F0E6D2] overflow-hidden shadow-2xl">
      {/* Ornements Hextech aux coins */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#C8AA6E]/75 z-20"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#C8AA6E]/75 z-20"
      />

      {/* En-tête Boutique officielle LoL */}
      <div className="px-4 py-3 border-b border-[#C8AA6E]/25 bg-[#040E1A] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-[#C8AA6E]" aria-hidden="true" />
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#F0E6D2]">
              {isModal && inspectedItem
                ? `Recette & Boutique LoL · ${inspectedItem.name}`
                : 'Boutique & Ensembles d’Objets (Client LoL)'}
            </h3>
          </div>

          <div className="inline-flex border border-[#785A28] bg-[#010A13]">
            <button
              type="button"
              onClick={() => setActiveTab('shop')}
              className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
                activeTab === 'shop'
                  ? 'bg-[#1E2B3E] text-[#F0E6D2] border-b-2 border-[#C8AA6E]'
                  : 'text-[#A09B8C] hover:text-[#F0E6D2]'
              }`}
            >
              Tous les objets &amp; Recettes
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sets')}
              className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider border-l border-[#785A28]/60 transition-colors whitespace-nowrap ${
                activeTab === 'sets'
                  ? 'bg-[#1E2B3E] text-[#F0E6D2] border-b-2 border-[#C8AA6E]'
                  : 'text-[#A09B8C] hover:text-[#F0E6D2]'
              }`}
            >
              Ensembles sauvegardés ({savedSets.length})
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs font-mono tabular-nums text-[#C8AA6E] px-2.5 py-1 border border-[#785A28]/60 bg-[#091428]">
            Build : {totalSlotsGold} po
          </div>

          {onResetToRecommended && (
            <button
              type="button"
              onClick={onResetToRecommended}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold border border-[#C8AA6E]/45 bg-[#091428] text-[#F0E6D2] hover:border-[#C8AA6E] transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3 text-[#C8AA6E]" aria-hidden="true" />
              <span>Build Conseillé IA</span>
            </button>
          )}

          {isModal && onCloseModal && (
            <button
              type="button"
              onClick={onCloseModal}
              aria-label="Fermer la boutique"
              className="p-1.5 border border-[#785A28]/70 text-[#A09B8C] hover:text-[#F0E6D2] hover:border-[#C8AA6E]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {activeTab === 'shop' ? (
        <>
          {/* Barre de recherche et catégories rapides */}
          <div className="px-4 py-2.5 border-b border-[#C8AA6E]/15 bg-[#030B15] flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
            <div className="relative w-full md:w-72">
              <Search
                className="w-3.5 h-3.5 text-[#A09B8C] absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Chercher un objet (ex: Cœuracier, Zhonya, Pioche...)"
                className="w-full pl-9 pr-8 py-1.5 text-xs bg-[#010A13] border border-[#785A28]/75 text-[#F0E6D2] placeholder-[#5B5A56] focus:outline-none focus:border-[#C8AA6E]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Effacer"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A09B8C] hover:text-[#F0E6D2]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  { id: 'all', label: 'Tous' },
                  { id: 'boots_starter', label: 'Départ & Bottes' },
                  { id: 'components', label: 'Composants' },
                  { id: 'legendary', label: 'Légendaires' },
                  ...(recommendedItemIds && recommendedItemIds.size > 0
                    ? [{ id: 'recommended', label: 'Conseillés IA' } as const]
                    : []),
                ] as Array<{ id: ShopCategory; label: string }>
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`px-2.5 py-1 text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                    category === cat.id
                      ? 'border-[#C8AA6E] bg-[#1E2B3E] text-[#F0E6D2]'
                      : 'border-transparent text-[#A09B8C] hover:text-[#F0E6D2] hover:border-[#785A28]/60'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Corps principal 3 colonnes façon Boutique LoL : Filtres Stats | Grille d'objets | Inspecteur & Recette */}
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* COLONNE GAUCHE : Filtres de statistiques */}
            <aside className="lg:col-span-2 border-b lg:border-b-0 lg:border-r border-[#C8AA6E]/20 bg-[#020A14] p-3 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#C8AA6E]">
                <span>Statistiques</span>
                {selectedStatFilters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedStatFilters([])}
                    className="text-[#0AC8B9] hover:underline font-normal normal-case"
                  >
                    Effacer
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1">
                {STAT_FILTERS.map((sf) => {
                  const active = selectedStatFilters.includes(sf.id);
                  return (
                    <button
                      key={sf.id}
                      type="button"
                      onClick={() => toggleStatFilter(sf.id)}
                      className={`px-2 py-1 text-left text-[11px] border transition-colors truncate ${
                        active
                          ? 'border-[#0AC8B9] bg-[#0AC8B9]/15 text-[#F0E6D2] font-semibold'
                          : 'border-transparent text-[#A09B8C] hover:text-[#F0E6D2] hover:bg-white/[0.03]'
                      }`}
                    >
                      {sf.label}
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* COLONNE CENTRALE : Grille d'objets Data Dragon avec prix en or */}
            <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-[#C8AA6E]/20 p-3.5 flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between text-[11px] text-[#A09B8C]">
                <span>
                  {filteredItems.length} objet{filteredItems.length > 1 ? 's' : ''} · Clic = Recette ·
                  Double-clic = Équiper
                </span>
                <span className="font-mono tabular-nums text-[#0AC8B9]">
                  Cible : Empl. {targetSlotIdx + 1}
                </span>
              </div>

              {filteredItems.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <p className="text-xs text-[#A09B8C]">
                    Aucun objet ne correspond aux filtres sélectionnés.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setCategory('all');
                      setSelectedStatFilters([]);
                    }}
                    className="px-3 py-1 text-xs font-semibold border border-[#C8AA6E] text-[#F0E6D2]"
                  >
                    Réinitialiser les filtres
                  </button>
                </div>
              ) : (
                <div className="max-h-[410px] overflow-y-auto thin-scrollbar pr-1 grid grid-cols-5 sm:grid-cols-6 gap-2.5 content-start">
                  {filteredItems.map((it) => {
                    const isSelected = inspectedItem?.id === it.id;
                    const isEquipped = equippedIds.has(it.id);
                    const isRec = recommendedItemIds?.has(it.id);

                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => setInspectedItemId(it.id)}
                        onDoubleClick={() => handleEquipToTarget(it)}
                        title={`${it.name} (${it.gold.total} po)`}
                        className={`group relative flex flex-col items-center p-1 border transition-[border-color,background-color,transform] duration-100 focus:outline-none ${
                          isSelected
                            ? 'border-[#C8AA6E] bg-[#1E2B3E] ring-1 ring-[#C8AA6E]/70'
                            : isEquipped
                              ? 'border-[#0AC8B9]/75 bg-[#091428]'
                              : 'border-[#785A28]/35 bg-[#06101D] hover:border-[#C8AA6E]/75'
                        }`}
                      >
                        <SafeGameIcon
                          src={it.imageUrl}
                          alt={it.name}
                          fallbackLabel={it.name}
                          sizeClass="w-10 h-10"
                          className="rounded-none border-0"
                        />
                        <span className="mt-1 text-[10px] font-mono tabular-nums text-[#C8AA6E] leading-none">
                          {it.gold.total}
                        </span>
                        {isEquipped && (
                          <span
                            title="Équipé dans votre build"
                            className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-[#0AC8B9]"
                          />
                        )}
                        {!isEquipped && isRec && (
                          <span
                            title="Recommandé par le moteur IA"
                            className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-amber-400"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* COLONNE DROITE : Inspecteur Officiel LoL + Recette from/into + Équiper */}
            <div className="lg:col-span-5 bg-[#030C18] p-4 flex flex-col justify-between gap-4">
              {inspectedItem && inspectedDetails ? (
                <>
                  <div className="space-y-3.5">
                    {/* Construit vers (into) */}
                    {inspectedDetails.intoItems.length > 0 && (
                      <div className="space-y-1.5 pb-2.5 border-b border-[#C8AA6E]/15">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#A09B8C]">
                          Construit vers ({inspectedDetails.intoItems.length})
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {inspectedDetails.intoItems.map((up) => (
                            <button
                              key={`into-${up.id}`}
                              type="button"
                              onClick={() => setInspectedItemId(up.id)}
                              title={`${up.name} (${up.gold.total} po)`}
                              className="p-0.5 border border-[#785A28]/50 bg-[#091428] hover:border-[#C8AA6E] transition-colors"
                            >
                              <SafeGameIcon
                                src={up.imageUrl}
                                alt={up.name}
                                fallbackLabel={up.name}
                                sizeClass="w-7 h-7"
                                className="rounded-none border-0"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Arbre de fabrication interactif (Recette from -> Objet) */}
                    <div className="rounded-lg border border-[#785A28]/55 bg-[#010811] p-3 space-y-2.5">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#C8AA6E]">
                        <span>Arbre de fabrication (Recette)</span>
                        {inspectedItem.gold.base > 0 && inspectedDetails.fromItems.length > 0 && (
                          <span className="font-mono tabular-nums text-[#A09B8C]">
                            Coût de fusion : +{inspectedItem.gold.base} po
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[#A09B8C] leading-snug">
                        Achetez d’abord les composants du bas, puis complétez l’objet final. Cliquez sur un
                        composant pour voir son propre arbre.
                      </p>

                      <div className="flex flex-col items-center">
                        {/* Nœud racine (Objet inspecté) */}
                        <div className="flex flex-col items-center">
                          <div className="p-0.5 border-2 border-[#C8AA6E] bg-[#091428] shadow-[0_0_14px_rgba(200,170,110,0.3)]">
                            <SafeGameIcon
                              src={inspectedItem.imageUrl}
                              alt={inspectedItem.name}
                              fallbackLabel={inspectedItem.name}
                              sizeClass="w-10 h-10"
                              className="rounded-none border-0"
                            />
                          </div>
                          <span className="mt-1 text-[10px] font-mono tabular-nums text-[#F0E6D2]">
                            {inspectedItem.gold.total}
                          </span>
                        </div>

                        {/* Enfants Niveau 1 (from) */}
                        {inspectedDetails.fromItems.length > 0 ? (
                          <>
                            <div className="w-[1px] h-3 bg-[#785A28]/80" />
                            <div className="relative flex flex-wrap items-start justify-center gap-4 pt-2 border-t border-[#785A28]/60">
                              {inspectedDetails.fromItems.map((branch, idx) => (
                                <div
                                  key={`from-${branch.item.id}-${idx}`}
                                  className="flex flex-col items-center"
                                >
                                  <button
                                    type="button"
                                    onClick={() => setInspectedItemId(branch.item.id)}
                                    title={`${branch.item.name} (${branch.item.gold.total} po)`}
                                    className="p-0.5 border border-[#785A28]/75 bg-[#091428] hover:border-[#C8AA6E] transition-colors"
                                  >
                                    <SafeGameIcon
                                      src={branch.item.imageUrl}
                                      alt={branch.item.name}
                                      fallbackLabel={branch.item.name}
                                      sizeClass="w-8 h-8"
                                      className="rounded-none border-0"
                                    />
                                  </button>
                                  <span className="mt-0.5 text-[10px] font-mono tabular-nums text-[#C8AA6E]">
                                    {branch.item.gold.total}
                                  </span>

                                  {/* Sous-composants Niveau 2 */}
                                  {branch.subFrom.length > 0 && (
                                    <div className="mt-1.5 pt-1.5 border-t border-[#785A28]/45 flex items-center gap-1.5">
                                      {branch.subFrom.map((sub, sIdx) => (
                                        <button
                                          key={`sub-${sub.id}-${sIdx}`}
                                          type="button"
                                          onClick={() => setInspectedItemId(sub.id)}
                                          title={`${sub.name} (${sub.gold.total} po)`}
                                          className="flex flex-col items-center group"
                                        >
                                          <div className="p-0.5 border border-[#785A28]/50 bg-[#050C17] group-hover:border-[#C8AA6E]">
                                            <SafeGameIcon
                                              src={sub.imageUrl}
                                              alt={sub.name}
                                              fallbackLabel={sub.name}
                                              sizeClass="w-6 h-6"
                                              className="rounded-none border-0"
                                            />
                                          </div>
                                          <span className="text-[9px] font-mono tabular-nums text-[#A09B8C]">
                                            {sub.gold.total}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="mt-1 text-[11px] text-[#5B5A56]">
                            Objet de base (aucun composant requis)
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Fiche détaillée : Nom, Prix, Statistiques & Passifs */}
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <SafeGameIcon
                            src={inspectedItem.imageUrl}
                            alt={inspectedItem.name}
                            fallbackLabel={inspectedItem.name}
                            sizeClass="w-10 h-10"
                            className="rounded-none border border-[#C8AA6E]/70"
                          />
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-[#F0E6D2] truncate">
                              {inspectedItem.name}
                            </h4>
                            <div className="text-[11px] font-mono tabular-nums text-[#C8AA6E]">
                              {inspectedItem.gold.total} po{' '}
                              <span className="text-[#5B5A56]">
                                (revente {inspectedItem.gold.sell} po)
                              </span>
                            </div>
                          </div>
                        </div>

                        {onExplainPassive && (!hasPassiveInfo || hasPassiveInfo(inspectedItem)) && (
                          <button
                            type="button"
                            onClick={() => onExplainPassive(inspectedItem)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold border border-[#C8AA6E]/45 bg-[#091428] text-[#C8AA6E] hover:border-[#C8AA6E] hover:text-[#F0E6D2] shrink-0"
                          >
                            <Info className="w-3 h-3" aria-hidden="true" />
                            <span>Passif IA</span>
                          </button>
                        )}
                      </div>

                      {inspectedDetails.raw.parsedStatsLines.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#0AC8B9] font-medium">
                          {inspectedDetails.raw.parsedStatsLines.map((line, i) => (
                            <span key={i}>{line}</span>
                          ))}
                        </div>
                      )}

                      {inspectedDetails.raw.passives.length > 0 && (
                        <div className="max-h-28 overflow-y-auto thin-scrollbar pr-1 space-y-1.5 text-[11px] leading-relaxed text-[#C8C3B4]">
                          {inspectedDetails.raw.passives.map((pas, idx) => (
                            <div key={idx}>
                              <span className="font-bold text-[#F0E6D2]">
                                {pas.isActive ? 'Actif' : 'Passif'} — {pas.name} :
                              </span>{' '}
                              {pas.text}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Boutons d'action : Équiper dans le slot ciblé ou suivant */}
                  <div className="pt-2 border-t border-[#C8AA6E]/20 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleEquipToTarget(inspectedItem)}
                      className="flex-1 px-3 py-2 text-xs font-bold uppercase tracking-wider border border-[#C8AA6E] bg-[#1E2B3E] text-[#F0E6D2] hover:bg-[#C8AA6E] hover:text-[#010A13] transition-colors whitespace-nowrap"
                    >
                      Équiper (Empl. {targetSlotIdx + 1})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEquipNextEmpty(inspectedItem)}
                      title="Ajouter à l'emplacement libre suivant"
                      className="px-3 py-2 text-xs font-semibold border border-[#785A28] bg-[#091428] text-[#C8AA6E] hover:border-[#C8AA6E] hover:text-[#F0E6D2] transition-colors whitespace-nowrap"
                    >
                      + Empl. libre
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-xs text-[#A09B8C]">
                  Sélectionnez un objet dans la grille pour voir sa recette et ses statistiques.
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* ONGLET ENSEMBLES D'OBJETS SAUVEGARDÉS (façon client LoL Collection > Objets) */
        <div className="p-4 space-y-4">
          <div className="rounded-lg border border-[#785A28]/60 bg-[#030C18] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs font-bold uppercase tracking-wider text-[#F0E6D2]">
                Sauvegarder les 6 emplacements actuels ({totalSlotsGold} po)
              </div>
              <div className="text-[11px] text-[#A09B8C]">
                Créez un ensemble réutilisable pour {championName} et rechargez-le dans le simulateur en 1 clic.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={40}
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                placeholder={`${championName} · Anti-Tank`}
                className="px-3 py-1.5 text-xs bg-[#010A13] border border-[#785A28]/80 text-[#F0E6D2] placeholder-[#5B5A56] focus:outline-none focus:border-[#C8AA6E]"
              />
              <button
                type="button"
                onClick={handleSaveCurrentItemSet}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider border border-[#C8AA6E] bg-[#1E2B3E] text-[#F0E6D2] hover:bg-[#C8AA6E] hover:text-[#010A13] transition-colors whitespace-nowrap"
              >
                <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sauvegarder</span>
              </button>
            </div>
          </div>

          {setFeedback && (
            <div className="px-3 py-2 border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-300">
              {setFeedback}
            </div>
          )}

          {savedSets.length === 0 ? (
            <div className="py-10 text-center space-y-2 text-xs text-[#A09B8C]">
              <FolderOpen className="w-6 h-6 mx-auto text-[#785A28]" aria-hidden="true" />
              <p>Aucun ensemble d’objets sauvegardé pour l’instant.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {savedSets.map((setEntry) => (
                <div
                  key={setEntry.id}
                  className="rounded-lg border border-[#785A28]/60 bg-[#050E1B] p-3 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold uppercase tracking-wider text-[#F0E6D2] truncate">
                        {setEntry.name}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-[#C8AA6E]">
                        {setEntry.championName} · {setEntry.totalGold} po
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteItemSet(setEntry.id)}
                      aria-label={`Supprimer ${setEntry.name}`}
                      className="p-1 text-[#A09B8C] hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {setEntry.itemIds.map((id, idx) => {
                        const it = id ? itemById.get(id) : null;
                        return it ? (
                          <SafeGameIcon
                            key={`${setEntry.id}-${idx}`}
                            src={it.imageUrl}
                            alt={it.name}
                            fallbackLabel={it.name}
                            sizeClass="w-8 h-8"
                            className="rounded-none border border-[#785A28]/70"
                          />
                        ) : (
                          <div
                            key={`${setEntry.id}-${idx}`}
                            className="w-8 h-8 border border-[#785A28]/30 bg-[#010A13]"
                          />
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (onApplyItemSet) {
                          onApplyItemSet(setEntry.itemIds);
                        } else {
                          setEntry.itemIds.forEach((id, idx) => {
                            onAssignSlot(idx, id ? itemById.get(id) || null : null);
                          });
                        }
                        setActiveTab('shop');
                      }}
                      className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider border border-[#C8AA6E]/70 bg-[#091428] text-[#F0E6D2] hover:bg-[#C8AA6E] hover:text-[#010A13] transition-colors whitespace-nowrap"
                    >
                      Charger
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Barre inférieure persistante des 6 Emplacements (Inventaire actif) */}
      <div className="px-4 py-3 border-t border-[#C8AA6E]/25 bg-[#040E1A] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#A09B8C] mr-1">
            Inventaire (6 empl.) :
          </span>
          {slots.map((it, idx) => {
            const isTarget = targetSlotIdx === idx;
            return (
              <div key={`shop-slot-${idx}`} className="relative group">
                <button
                  type="button"
                  onClick={() => {
                    setTargetSlotIdx(idx);
                    if (it) setInspectedItemId(it.id);
                  }}
                  title={
                    it
                      ? `Emplacement ${idx + 1} : ${it.name} (${it.gold.total} po)`
                      : `Cibler l'emplacement ${idx + 1} (vide)`
                  }
                  className={`w-10 h-10 flex items-center justify-center border transition-all ${
                    isTarget
                      ? 'border-[#0AC8B9] ring-1 ring-[#0AC8B9] bg-[#0E1E36]'
                      : 'border-[#785A28]/70 bg-[#010A13] hover:border-[#C8AA6E]'
                  }`}
                >
                  {it ? (
                    <SafeGameIcon
                      src={it.imageUrl}
                      alt={it.name}
                      fallbackLabel={it.name}
                      sizeClass="w-8 h-8"
                      className="rounded-none border-0"
                    />
                  ) : (
                    <Plus className="w-3.5 h-3.5 text-[#5B5A56]" aria-hidden="true" />
                  )}
                </button>
                {it && (
                  <button
                    type="button"
                    onClick={() => onAssignSlot(idx, null)}
                    aria-label={`Retirer ${it.name}`}
                    className="hidden group-hover:flex absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white items-center justify-center shadow"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="text-[11px] text-[#A09B8C] flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-[#C8AA6E] shrink-0" aria-hidden="true" />
          <span>Synchronisé en direct avec le calculateur de stats &amp; DPS</span>
        </div>
      </div>
    </section>
  );
}
