import { RefreshCw, Save, Settings } from 'lucide-react';
import { useState } from 'react';
import type { RiotPlatform, Role } from '../engines/types.ts';

interface SettingsViewProps {
  defaultRiotId: string;
  defaultRegion: RiotPlatform;
  defaultRole: Role;
  darkMode: boolean;
  patchVersion: string;
  riotConfigured: boolean;
  riotKeyStartsWithRgapi: boolean;
  riotKeyLength: number;
  geminiConfigured: boolean;
  onSavePreferences: (prefs: {
    riotId: string;
    region: RiotPlatform;
    role: Role;
    darkMode: boolean;
  }) => void;
  onRefreshDataDragon: () => Promise<void>;
}

const REGIONS: RiotPlatform[] = [
  'EUW1',
  'EUN1',
  'NA1',
  'KR',
  'BR1',
  'JP1',
  'OC1',
  'TR1',
  'LA1',
  'LA2',
  'ME1',
  'SG2',
  'TW2',
  'VN2',
];

const ROLES: Role[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

export function SettingsView({
  defaultRiotId,
  defaultRegion,
  defaultRole,
  darkMode,
  patchVersion,
  riotConfigured,
  riotKeyStartsWithRgapi,
  riotKeyLength,
  geminiConfigured,
  onSavePreferences,
  onRefreshDataDragon,
}: SettingsViewProps) {
  const [riotId, setRiotId] = useState(defaultRiotId);
  const [region, setRegion] = useState<RiotPlatform>(defaultRegion);
  const [role, setRole] = useState<Role>(defaultRole);
  const [themeDark, setThemeDark] = useState(darkMode);
  const [savedNotice, setSavedNotice] = useState(false);
  const [refreshingDd, setRefreshingDd] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSavePreferences({
      riotId: riotId.trim() || 'Boulvae#EUW',
      region,
      role,
      darkMode: themeDark,
    });
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleRefreshDd = async () => {
    setRefreshingDd(true);
    try {
      await onRefreshDataDragon();
    } finally {
      setRefreshingDd(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-500" aria-hidden="true" />
            Paramètres du profil & préférences
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Ces préférences sont enregistrées localement dans votre navigateur pour vous éviter de ressaisir votre Riot ID à chaque visite.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="pref-riot-id"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Riot ID par défaut (Pseudo#TAG)
              </label>
              <input
                id="pref-riot-id"
                type="text"
                value={riotId}
                onChange={(e) => setRiotId(e.target.value)}
                placeholder="Boulvae#EUW"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="pref-region"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Serveur par défaut
              </label>
              <select
                id="pref-region"
                value={region}
                onChange={(e) => setRegion(e.target.value as RiotPlatform)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white"
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="pref-role"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Rôle principal
              </label>
              <select
                id="pref-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={themeDark}
                onChange={(e) => setThemeDark(e.target.checked)}
                className="rounded border-slate-300 accent-amber-500"
              />
              Activer le mode sombre par défaut
            </label>

            <div className="flex items-center gap-3">
              {savedNotice && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Préférences enregistrées et synchronisées
                </span>
              )}
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 transition-colors"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                Enregistrer et synchroniser
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Synchronisation Data Dragon & État des services serveur */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Sources de données & état des services
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Vérification en lecture seule des variables serveur configurées dans votre environnement.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefreshDd}
            disabled={refreshingDd}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingDd ? 'animate-spin' : ''}`} aria-hidden="true" />
            Actualiser Data Dragon (Patch {patchVersion})
          </button>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
          <div className="p-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">Data Dragon Officiel</div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                Champions, objets, runes et minimap map11.png synchronisés automatiquement sans clé.
              </div>
            </div>
            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
              Patch {patchVersion}
            </span>
          </div>

          <div className="p-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">
                Variable serveur RIOT_API_KEY
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                {riotConfigured
                  ? `Détectée (${riotKeyLength} caractères, préfixe RGAPI- : ${riotKeyStartsWithRgapi ? 'Oui' : 'Non'}).`
                  : 'Non configurée côté serveur.'}
              </div>
            </div>
            <span
              className={`font-semibold shrink-0 ${
                riotConfigured && riotKeyStartsWithRgapi
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {riotConfigured ? 'Présente' : 'Absente'}
            </span>
          </div>

          <div className="p-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">
                Coach IA Gemini (côté serveur)
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                Analyse tactique post-game, builds et appels en direct via le serveur Express.
              </div>
            </div>
            <span
              className={`font-semibold shrink-0 ${
                geminiConfigured
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {geminiConfigured ? 'Prêt' : 'Non configuré'}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
          <div className="font-semibold text-slate-900 dark:text-white">
            Où mettre à jour votre nouvelle clé Riot régénérée ?
          </div>
          <p>
            1. Sur{' '}
            <a
              href="https://developer.riotgames.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-600 dark:text-amber-400 underline"
            >
              developer.riotgames.com
            </a>
            , vous n’avez <strong>aucun compte joueur (Riot ID) à ajouter</strong> : le bouton <strong>Copy</strong> vous donne une clé universelle capable d’interroger n’importe quel joueur comme <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">Boulvae#EUW</code>.
          </p>
          <p>
            2. Par sécurité, les clés secrètes ne se saisissent jamais dans l’interface web d’une application. Dans l’atelier Google AI Studio (autour de cet aperçu), ouvrez le panneau <strong>Settings &gt; Secrets</strong> (ou <strong>Variables d’environnement</strong>) et mettez à jour la variable <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">RIOT_API_KEY</code> avec la clé que vous venez de copier.
          </p>
        </div>
      </section>
    </div>
  );
}
