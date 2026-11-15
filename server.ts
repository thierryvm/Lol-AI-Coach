import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { parseLiveClientSnapshot } from './src/engines/liveCoachEngine.ts';
import type { LiveClientAllGameData, LiveCoachSnapshot, RiotPlatform, Role } from './src/engines/types.ts';
import {
  generateBuildCoachingRationale,
  generateCareerGlobalSynthesis,
  generateLiveCoachingCall,
  generatePostGameCoaching,
} from './server/aiCoachService.ts';
import { SAMPLE_LIVE_CLIENT_PAYLOAD } from './server/referenceData.ts';
import {
  checkActiveRiotGame,
  fetchRiotMatchById,
  getChampionDetail,
  getDDragonBootstrap,
  getRiotKeyDiagnostics,
  normalizeRiotMatch,
  syncRiotPlayerProfile,
} from './server/riotService.ts';

const PORT = Number(process.env.PORT || 3000);

// Stockage en mémoire du dernier snapshot reçu depuis le pont Live Client Data (127.0.0.1:2999)
let latestLiveSnapshot: LiveCoachSnapshot = parseLiveClientSnapshot(
  SAMPLE_LIVE_CLIENT_PAYLOAD,
  'Simulation Live Client Data',
  'MID',
);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // --- Statut système & configuration API ---
  app.get('/api/riot/status', async (_req, res) => {
    try {
      const dd = await getDDragonBootstrap();
      const keyDiag = getRiotKeyDiagnostics();
      res.json({
        riotApiConfigured: keyDiag.configured,
        riotKeyStartsWithRgapi: keyDiag.startsWithRgapi,
        riotKeyLength: keyDiag.length,
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
        patchVersion: dd.version,
        championCount: dd.champions.length,
        itemCount: dd.items.length,
        fetchedAt: dd.fetchedAt,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erreur de vérification du statut Riot/Data Dragon.',
      });
    }
  });

  // --- Data Dragon Officiel (Patch live) ---
  app.get('/api/ddragon/bootstrap', async (req, res) => {
    try {
      const refresh = req.query.refresh === '1';
      const data = await getDDragonBootstrap(refresh);
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Impossible de contacter Data Dragon.',
      });
    }
  });

  app.get('/api/ddragon/champion/:id', async (req, res) => {
    try {
      const detail = await getChampionDetail(req.params.id);
      res.json(detail);
    } catch (err) {
      res.status(404).json({
        error: err instanceof Error ? err.message : 'Champion introuvable dans Data Dragon.',
      });
    }
  });

  // --- Synchronisation Joueur & Match-V5 ---
  app.get('/api/riot/player', async (req, res) => {
    try {
      const gameName = String(req.query.gameName || 'Faker').trim();
      const tagLine = String(req.query.tagLine || 'EUW').trim();
      const region = (String(req.query.region || 'EUW1').toUpperCase() as RiotPlatform) || 'EUW1';
      const force = req.query.force === '1';
      const count = req.query.count ? Number(req.query.count) : 15;

      const profile = await syncRiotPlayerProfile(gameName, tagLine, region, force, count);
      res.json(profile);
    } catch (err) {
      const status = (err as Error & { status?: number }).status || 500;
      const keyDiag = getRiotKeyDiagnostics();
      let message = err instanceof Error ? err.message : 'Erreur lors de la synchronisation Riot.';
      if (status === 404) {
        message = 'Riot ID introuvable sur cette région. Vérifiez le format Pseudo#TAG et le serveur.';
      } else if (status === 403 || status === 401) {
        if (!keyDiag.startsWithRgapi) {
          message = `La variable RIOT_API_KEY détectée (longueur ${keyDiag.length}) ne commence pas par "RGAPI-". Vérifiez que vous avez bien collé votre Development API Key depuis developer.riotgames.com (et non votre mot de passe ou un autre identifiant), puis redémarrez le serveur.`;
        } else {
          message = `Riot Games a refusé la clé (HTTP ${status}, format RGAPI-... valide de longueur ${keyDiag.length}). Cause fréquente : la clé Development API Key a expiré (durée 24h) ou a été régénérée sur developer.riotgames.com. Régénérez la clé sur developer.riotgames.com et mettez à jour RIOT_API_KEY dans Settings > Secrets.`;
        }
      } else if (status === 429) {
        message = 'Limite de requêtes Riot API atteinte (429). Réessayez dans quelques secondes.';
      }
      res.status(status).json({ error: message });
    }
  });

  app.get('/api/riot/active-game', async (req, res) => {
    try {
      const gameName = String(req.query.gameName || 'Boulvae').trim();
      const tagLine = String(req.query.tagLine || 'EUW').trim();
      const region = (String(req.query.region || 'EUW1').toUpperCase() as RiotPlatform) || 'EUW1';
      const activeGame = await checkActiveRiotGame(gameName, tagLine, region);
      res.json(activeGame);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erreur Spectator-V5.',
      });
    }
  });

  app.get('/api/riot/match/:matchId', async (req, res) => {
    try {
      const matchId = String(req.params.matchId || '').trim();
      const gameName = String(req.query.gameName || 'Boulvae').trim();
      const tagLine = String(req.query.tagLine || 'EUW').trim();
      const region = (String(req.query.region || 'EUW1').toUpperCase() as RiotPlatform) || 'EUW1';
      if (!matchId) {
        return res.status(400).json({ error: 'Identifiant de partie requis.' });
      }
      const match = await fetchRiotMatchById(matchId, gameName, tagLine, region);
      return res.json(match);
    } catch (err) {
      const status = (err as Error & { status?: number }).status || 500;
      let message = err instanceof Error ? err.message : 'Erreur lors du chargement de la partie.';
      if (status === 404) {
        message =
          'Partie introuvable dans Riot Match-V5 (404). Si c’est une partie Personnalisée ou Outil d’entraînement, utilisez l’import local LCU (/history) depuis le Tableau de bord.';
      } else if (status === 429) {
        message = 'Limite de requêtes Riot API atteinte (429). Réessayez dans quelques secondes.';
      }
      return res.status(status).json({ error: message });
    }
  });

  // Import manuel d'un JSON Match-V5 (+ timeline optionnelle)
  app.post('/api/match/import', (req, res) => {
    try {
      const { matchJson, timelineJson, targetPuuid } = req.body || {};
      if (!matchJson) {
        return res.status(400).json({ error: 'Le payload matchJson est requis.' });
      }
      const normalized = normalizeRiotMatch(
        matchJson,
        targetPuuid || matchJson?.metadata?.participants?.[0] || '',
        timelineJson,
        'Import Match-V5',
      );
      return res.json(normalized);
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Format JSON Match-V5 invalide.',
      });
    }
  });

  // --- Live Client Data API Bridge (127.0.0.1:2999) ---
  app.get('/api/live/latest', (_req, res) => {
    res.json(latestLiveSnapshot);
  });

  app.post('/api/live/ingest', (req, res) => {
    try {
      const body = req.body || {};
      const rawData: LiveClientAllGameData = body.allgamedata || body;
      const role: Role = body.role || 'MID';
      const isSimulation = Boolean(body.simulation);

      if (!rawData || (!rawData.allPlayers && !rawData.activePlayer)) {
        return res.status(400).json({
          error: 'JSON Live Client Data invalide : activePlayer ou allPlayers manquant.',
        });
      }

      latestLiveSnapshot = parseLiveClientSnapshot(
        rawData,
        isSimulation ? 'Simulation Live Client Data' : 'Live Client Data (127.0.0.1:2999)',
        role,
      );
      return res.json(latestLiveSnapshot);
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Erreur d’analyse du flux Live Client Data.',
      });
    }
  });

  // --- Coaching IA Gemini (Server-side uniquement) ---
  app.post('/api/coach/build-rationale', async (req, res) => {
    try {
      const result = await generateBuildCoachingRationale(req.body);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erreur lors de l’analyse Gemini du build.',
      });
    }
  });

  app.post('/api/coach/postgame-review', async (req, res) => {
    try {
      const result = await generatePostGameCoaching(req.body);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erreur lors du débriefing Gemini post-game.',
      });
    }
  });

  app.post('/api/coach/live-advice', async (req, res) => {
    try {
      const snapshot: LiveCoachSnapshot = req.body?.snapshot || latestLiveSnapshot;
      const result = await generateLiveCoachingCall(snapshot);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erreur lors du coaching temps réel Gemini.',
      });
    }
  });

  app.post('/api/coach/career-synthesis', async (req, res) => {
    try {
      const { riotId, region, dataset } = req.body || {};
      if (!dataset || !dataset.gamesAnalyzed) {
        return res.status(400).json({
          error: 'Aucun historique de matchs disponible pour générer la synthèse globale.',
        });
      }
      const result = await generateCareerGlobalSynthesis({
        riotId: String(riotId || 'Joueur'),
        region: String(region || 'EUW1'),
        dataset,
      });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Erreur lors de la synthèse globale Gemini.',
      });
    }
  });

  // --- Vite Dev Middleware ou Static Prod ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LoL AI Coach server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
