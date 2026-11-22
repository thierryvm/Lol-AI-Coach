import {
  KEY_ENEMY_SUMMONER_SPELL_IDS,
  inferDefaultEnemySpells,
  resolveSummonerSpell,
} from '../utils/summonerSpells.ts';
import type {
  LiveClientAllGameData,
  LiveClientRawGameEvent,
  LiveCoachSnapshot,
  LiveGameEventCategory,
  LiveParsedGameEvent,
  LivePlayerEquipmentRow,
  Role,
} from './types.ts';

function targetCsForRole(role: Role): number {
  switch (role) {
    case 'SUPPORT':
      return 1.5;
    case 'JUNGLE':
      return 6.2;
    default:
      return 7.5;
  }
}

function normalizeSpellSlot(rawSlot?: string): string | undefined {
  if (!rawSlot) return undefined;
  const upper = rawSlot.trim().toUpperCase();
  if (upper === 'A' || upper === 'Q' || upper === 'SPELL1' || upper === '0') return 'Q';
  if (upper === 'Z' || upper === 'W' || upper === 'SPELL2' || upper === '1') return 'W';
  if (upper === 'E' || upper === 'SPELL3' || upper === '2') return 'E';
  if (upper === 'R' || upper === 'ULT' || upper === 'ULTIMATE' || upper === 'SPELL4' || upper === '3') {
    return 'R';
  }
  if (upper === 'D' || upper === 'SUMMONER1' || upper === 'SUMMONER_1' || upper === '4') return 'D';
  if (upper === 'F' || upper === 'SUMMONER2' || upper === 'SUMMONER_2' || upper === '5') return 'F';
  return upper;
}

function formatEventClock(sec: number): string {
  const safe = Math.max(0, Math.round(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function normalizeNameToken(val?: string): string {
  return (val || '')
    .split('#')[0]
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function isSpellOrGameEvent(ev: LiveClientRawGameEvent): boolean {
  const name = (ev.EventName ?? ev.eventName ?? ev.EventType ?? ev.eventType ?? ev.type ?? '')
    .toLowerCase()
    .trim();
  if (
    name === 'gameevent' ||
    name === 'game_event' ||
    name.includes('spellcast') ||
    name.includes('summonerspell') ||
    name.includes('summonercast') ||
    name.includes('ultimatecast') ||
    name.includes('flashused') ||
    name.includes('abilitycast') ||
    name.includes('castspell')
  ) {
    return true;
  }
  return Boolean(
    ev.SpellName ||
      ev.spellName ||
      ev.SummonerSpellName ||
      ev.AbilityName ||
      ev.spell ||
      ev.SpellSlot ||
      ev.spellSlot ||
      ev.AbilityKey ||
      ev.abilityKey ||
      ev.gameEvent,
  );
}

/**
 * Parse les événements 'gameEvent' (sorts, Flash, ultimes, sorts d'invocateur)
 * provenant du flux Live Client Data / pont local LoL.
 */
export function parseGameEvents(
  raw: LiveClientAllGameData,
  myTeam: 'ORDER' | 'CHAOS' = 'ORDER',
): LiveParsedGameEvent[] {
  const rawList: LiveClientRawGameEvent[] = [
    ...(raw.events?.Events || []),
    ...(Array.isArray(raw.gameEvents) ? raw.gameEvents : []),
    ...(Array.isArray(raw.gameEvent)
      ? raw.gameEvent
      : raw.gameEvent
        ? [raw.gameEvent]
        : []),
  ];

  const allPlayers = raw.allPlayers || [];
  const parsed: LiveParsedGameEvent[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < rawList.length; i++) {
    const outer = rawList[i];
    if (!outer || typeof outer !== 'object') continue;
    if (!isSpellOrGameEvent(outer)) continue;

    // Certains ponts encapsulent les détails sous outer.gameEvent / outer.payload / outer.data
    const inner = outer.gameEvent || outer.payload || outer.data;
    const ev: LiveClientRawGameEvent = inner ? { ...outer, ...inner } : outer;

    const eventId = Number(ev.EventID ?? ev.eventId ?? i + 1);
    const eventName = String(ev.EventName ?? ev.eventName ?? ev.EventType ?? ev.eventType ?? 'gameEvent');
    const eventTimeSec = Math.max(0, Math.round(Number(ev.EventTime ?? ev.eventTime ?? raw.gameData?.gameTime ?? 0)));

    const rawSlot = ev.SpellSlot ?? ev.spellSlot ?? ev.AbilityKey ?? ev.abilityKey ?? ev.slot ?? ev.key;
    const spellSlot = normalizeSpellSlot(rawSlot);

    const rawSpellText = String(
      ev.SpellName ??
        ev.spellName ??
        ev.SummonerSpellName ??
        ev.AbilityName ??
        ev.spell ??
        ev.EventType ??
        ev.eventType ??
        ev.type ??
        eventName,
    ).trim();

    const casterRaw = String(
      ev.CasterName ??
        ev.casterName ??
        ev.ChampionName ??
        ev.championName ??
        ev.SummonerName ??
        ev.summonerName ??
        ev.ActorName ??
        ev.KillerName ??
        '',
    ).trim();

    const casterToken = normalizeNameToken(casterRaw);
    const matchedPlayer = casterToken
      ? allPlayers.find(
          (p) =>
            normalizeNameToken(p.championName) === casterToken ||
            normalizeNameToken(p.riotId) === casterToken,
        )
      : undefined;

    let casterTeam: 'ALLY' | 'ENEMY' | 'NEUTRAL' = 'NEUTRAL';
    if (matchedPlayer) {
      casterTeam = matchedPlayer.team === myTeam ? 'ALLY' : 'ENEMY';
    } else {
      const explicitTeam = String(ev.Team ?? ev.team ?? '').trim().toUpperCase();
      if (explicitTeam === 'ALLY' || explicitTeam === 'ENEMY') {
        casterTeam = explicitTeam;
      } else if (explicitTeam === 'ORDER' || explicitTeam === 'CHAOS') {
        casterTeam = explicitTeam === myTeam ? 'ALLY' : 'ENEMY';
      }
    }

    const casterChampionName = matchedPlayer?.championName || casterRaw || undefined;
    const casterRiotId = matchedPlayer?.riotId || (casterRaw.includes('#') ? casterRaw : undefined);

    const normalizedSpell = rawSpellText
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const summonerMeta = resolveSummonerSpell(rawSpellText);

    let category: LiveGameEventCategory = 'other';
    let isMajor = Boolean(ev.IsMajor ?? ev.isMajor);
    let displaySpellName = rawSpellText;
    let estimatedCooldownSec =
      typeof (ev.CooldownSec ?? ev.cooldownSec ?? ev.cooldown) === 'number'
        ? Math.max(1, Math.round(Number(ev.CooldownSec ?? ev.cooldownSec ?? ev.cooldown)))
        : undefined;

    if (summonerMeta?.id === 4 || normalizedSpell.includes('flash') || normalizedSpell.includes('saut eclair')) {
      category = 'flash';
      isMajor = true;
      displaySpellName = 'Flash';
      estimatedCooldownSec = estimatedCooldownSec ?? 300;
    } else if (
      spellSlot === 'R' ||
      normalizedSpell.includes('ultim') ||
      normalizedSpell === 'r' ||
      /\bult\b/.test(normalizedSpell)
    ) {
      category = 'ultimate';
      isMajor = true;
      displaySpellName =
        rawSpellText && !/^(gameevent|game_event|ultimatecast|spellcast|r)$/i.test(rawSpellText)
          ? rawSpellText
          : 'Ultime (R)';
      estimatedCooldownSec = estimatedCooldownSec ?? 90;
    } else if (summonerMeta) {
      category = 'summoner_spell';
      isMajor = isMajor || KEY_ENEMY_SUMMONER_SPELL_IDS.has(summonerMeta.id);
      displaySpellName = summonerMeta.nameFr;
      estimatedCooldownSec = estimatedCooldownSec ?? summonerMeta.cooldownSec;
    } else if (spellSlot === 'Q' || spellSlot === 'W' || spellSlot === 'E') {
      category = 'ability';
      displaySpellName =
        rawSpellText && !/^(gameevent|game_event|spellcast|abilitycast)$/i.test(rawSpellText)
          ? rawSpellText
          : `Sort (${spellSlot === 'Q' ? 'A' : spellSlot === 'W' ? 'Z' : 'E'})`;
    } else if (spellSlot === 'D' || spellSlot === 'F') {
      category = 'summoner_spell';
      isMajor = true;
      displaySpellName = `Sort (${spellSlot})`;
      estimatedCooldownSec = estimatedCooldownSec ?? 240;
    }

    const teamLabel = casterTeam === 'ENEMY' ? 'Ennemi' : casterTeam === 'ALLY' ? 'Allié' : 'Neutre';
    const casterLabel = casterChampionName ? `${casterChampionName} (${teamLabel})` : teamLabel;
    const summary = `${casterLabel} : ${displaySpellName} à ${formatEventClock(eventTimeSec)}`;

    const dedupKey = `${eventId}:${eventTimeSec}:${category}:${displaySpellName}:${casterChampionName || ''}`;
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);

    parsed.push({
      id: dedupKey,
      eventId,
      eventName,
      eventTimeSec,
      category,
      isMajor,
      spellName: displaySpellName,
      spellSlot,
      casterChampionName,
      casterRiotId,
      casterTeam,
      targetName: ev.TargetName ?? ev.targetName,
      estimatedCooldownSec,
      summary,
    });
  }

  return parsed.sort((a, b) => a.eventTimeSec - b.eventTimeSec || a.eventId - b.eventId);
}

/**
 * Analyse un payload brut issu de Riot Live Client Data API (127.0.0.1:2999/liveclientdata/allgamedata)
 * et produit des recommandations tactiques + le suivi de l'équipement des 10 joueurs.
 */
export function parseLiveClientSnapshot(
  raw: LiveClientAllGameData,
  source: LiveCoachSnapshot['source'],
  preferredRole: Role = 'MID',
): LiveCoachSnapshot {
  const gameTimeSec = Math.max(1, Math.round(raw.gameData?.gameTime ?? 0));
  const gameTimeMin = Math.max(1, gameTimeSec / 60);

  const activeName = raw.activePlayer?.championName || raw.allPlayers?.[0]?.championName || 'Champion';
  const activeRiotId = raw.activePlayer?.riotId;
  const allPlayers = raw.allPlayers || [];

  const selfPlayer =
    allPlayers.find((p) => (activeRiotId && p.riotId === activeRiotId) || p.championName === activeName) ||
    allPlayers[0];
  const resolvedSelfChampionName = selfPlayer?.championName || activeName;

  const myTeam = selfPlayer?.team || 'ORDER';
  const allies = allPlayers.filter((p) => p.team === myTeam);
  const enemies = allPlayers.filter((p) => p.team !== myTeam);

  const kills = selfPlayer?.scores?.kills ?? 0;
  const deaths = selfPlayer?.scores?.deaths ?? 0;
  const assists = selfPlayer?.scores?.assists ?? 0;
  const cs = selfPlayer?.scores?.creepScore ?? 0;
  const csPerMin = Number((cs / gameTimeMin).toFixed(1));
  const targetCsPerMin = targetCsForRole(preferredRole);
  const csPaceDelta = Number((csPerMin - targetCsPerMin).toFixed(1));

  const currentGold = Math.round(raw.activePlayer?.currentGold ?? 0);
  const level = raw.activePlayer?.level ?? selfPlayer?.level ?? 1;

  const statsRaw = raw.activePlayer?.championStats;
  const activeStats = statsRaw
    ? {
        maxHealth: Math.round(statsRaw.maxHealth ?? 0),
        attackDamage: Math.round(statsRaw.attackDamage ?? 0),
        abilityPower: Math.round(statsRaw.abilityPower ?? 0),
        armor: Math.round(statsRaw.armor ?? 0),
        magicResist: Math.round(statsRaw.magicResist ?? 0),
        attackSpeed: Number((statsRaw.attackSpeed ?? 0).toFixed(2)),
        moveSpeed: Math.round(statsRaw.moveSpeed ?? 0),
        abilityHaste: Math.round(statsRaw.abilityHaste ?? 0),
      }
    : null;

  const events = raw.events?.Events || [];
  const lastDragon = [...events]
    .reverse()
    .find((e) => (e.EventName ?? e.eventName) === 'DragonKill');
  const lastBaron = [...events]
    .reverse()
    .find((e) => (e.EventName ?? e.eventName) === 'BaronKill');

  const lastDragonTime = lastDragon ? (lastDragon.EventTime ?? lastDragon.eventTime) : undefined;
  const dragonTimerSec =
    typeof lastDragonTime === 'number'
      ? Math.max(0, Math.round(lastDragonTime + 300 - gameTimeSec))
      : gameTimeSec < 300
        ? 300 - gameTimeSec
        : 0;

  const lastBaronTime = lastBaron ? (lastBaron.EventTime ?? lastBaron.eventTime) : undefined;
  const baronTimerSec =
    typeof lastBaronTime === 'number'
      ? Math.max(0, Math.round(lastBaronTime + 360 - gameTimeSec))
      : gameTimeSec < 1200
        ? 1200 - gameTimeSec
        : 0;

  const alerts: LiveCoachSnapshot['alerts'] = [];

  if (currentGold >= 1300) {
    alerts.push({
      priority: 'Haute',
      category: 'Rappel / Économie',
      message: `${currentGold} po en poche non convertis en statistiques sur la carte.`,
      action: 'Poussez la prochaine vague canon puis rappelez pour sécuriser votre pic de puissance.',
    });
  }

  if (dragonTimerSec !== null && dragonTimerSec > 0 && dragonTimerSec <= 65) {
    alerts.push({
      priority: 'Haute',
      category: 'Objectifs',
      message: `Dragon disponible dans ${dragonTimerSec}s.`,
      action: 'Préparez votre rappel maintenant et posez la vision autour de la rivière sud à -35s.',
    });
  }

  if (gameTimeMin >= 6 && csPaceDelta <= -1.2 && preferredRole !== 'SUPPORT') {
    alerts.push({
      priority: 'Moyenne',
      category: 'Farming',
      message: `Rythme actuel à ${csPerMin} CS/min (${csPaceDelta} sous l'objectif ${targetCsPerMin}).`,
      action: 'Évitez les regroupements mid inutiles et récupérez une side-lane libre entre deux vagues.',
    });
  }

  const fedEnemy = enemies.find((e) => (e.scores?.kills ?? 0) >= 4);
  if (fedEnemy) {
    alerts.push({
      priority: 'Haute',
      category: 'Menace Adverse',
      message: `${fedEnemy.championName} est en avance (${fedEnemy.scores?.kills}/${fedEnemy.scores?.deaths}/${fedEnemy.scores?.assists}).`,
      action: `Adaptez votre prochain composant défensif et évitez les duels isolés contre ${fedEnemy.championName}.`,
    });
  }

  const gameEvents = parseGameEvents(raw, myTeam);
  const recentEnemyMajorSpell = [...gameEvents]
    .reverse()
    .find(
      (ev) =>
        ev.isMajor &&
        ev.casterTeam === 'ENEMY' &&
        gameTimeSec - ev.eventTimeSec >= -2 &&
        gameTimeSec - ev.eventTimeSec <= 30,
    );

  if (recentEnemyMajorSpell) {
    const casterLabel = recentEnemyMajorSpell.casterChampionName || 'Un adversaire';
    alerts.push({
      priority: 'Haute',
      category: 'Menace Adverse',
      message: `${casterLabel} vient de lancer ${recentEnemyMajorSpell.spellName} (${formatEventClock(recentEnemyMajorSpell.eventTimeSec)}).`,
      action:
        recentEnemyMajorSpell.category === 'flash'
          ? `Fenêtre ouverte (~${recentEnemyMajorSpell.estimatedCooldownSec ?? 300}s) pour punir ${casterLabel} ou appeler votre jungler.`
          : `Profitez du délai de récupération de ${recentEnemyMajorSpell.spellName} sur ${casterLabel}.`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      priority: 'Info',
      category: 'Farming',
      message: 'État de partie stable : économie et rythme de farm conformes.',
      action: 'Continuez à suivre les temps de réapparition des objectifs et gardez votre trinket actif.',
    });
  }

  const mapPlayerRow = (
    p: NonNullable<LiveClientAllGameData['allPlayers']>[number],
    teamLabel: 'ALLY' | 'ENEMY',
  ): LivePlayerEquipmentRow => {
    const pk = p.scores?.kills ?? 0;
    const completedCount = p.items?.filter((i) => i.price >= 2000).length ?? 0;
    const dangerLevel: 'Élevé' | 'Moyen' | 'Normal' =
      teamLabel === 'ENEMY' && (pk >= 4 || p.level >= level + 2)
        ? 'Élevé'
        : teamLabel === 'ENEMY' && (pk >= 2 || completedCount >= 2)
          ? 'Moyen'
          : 'Normal';

    const [fallbackS1, fallbackS2] = inferDefaultEnemySpells(p.position);
    const spell1Meta = resolveSummonerSpell(p.summonerSpells?.summonerSpellOne?.displayName);
    const spell2Meta = resolveSummonerSpell(p.summonerSpells?.summonerSpellTwo?.displayName);

    return {
      championName: p.championName,
      riotId: p.riotId || p.championName,
      team: teamLabel,
      position: p.position || '-',
      level: p.level,
      kills: pk,
      deaths: p.scores?.deaths ?? 0,
      assists: p.scores?.assists ?? 0,
      cs: p.scores?.creepScore ?? 0,
      isDead: Boolean(p.isDead),
      spell1Id: spell1Meta?.id ?? fallbackS1,
      spell2Id: spell2Meta?.id ?? fallbackS2,
      items: (p.items || []).map((it) => ({
        itemId: it.itemID,
        displayName: it.displayName,
        price: it.price,
      })),
      dangerLevel,
    };
  };

  const allyPlayers = allies.map((p) => mapPlayerRow(p, 'ALLY'));
  const enemyPlayers = enemies.map((p) => mapPlayerRow(p, 'ENEMY'));

  const enemyThreats = enemyPlayers.map((e) => ({
    championName: e.championName,
    kills: e.kills,
    cs: e.cs,
    level: e.level,
    itemCount: e.items.filter((i) => i.price >= 2000).length,
    dangerLevel: e.dangerLevel,
  }));

  const liveRunes = raw.activePlayer?.fullRunes;
  const fullRunesSummary = liveRunes?.primaryRuneTree?.id
    ? {
        primaryTreeId: liveRunes.primaryRuneTree.id,
        secondaryTreeId: liveRunes.secondaryRuneTree?.id ?? null,
        keystoneId: liveRunes.keystone?.id ?? liveRunes.generalRunes?.[0]?.id ?? null,
        keystoneName: liveRunes.keystone?.displayName,
        selectedRuneIds: (liveRunes.generalRunes || []).map((r) => r.id).filter(Boolean),
        statRuneIds: (liveRunes.statRunes || []).map((s) => s.id).filter(Boolean),
      }
    : null;

  const rawAb = raw.activePlayer?.abilities;
  const activeAbilityLevels = rawAb
    ? {
        Q: Number(rawAb.Q?.abilityLevel ?? 0),
        W: Number(rawAb.W?.abilityLevel ?? 0),
        E: Number(rawAb.E?.abilityLevel ?? 0),
        R: Number(rawAb.R?.abilityLevel ?? 0),
      }
    : null;

  const allyKillsTotal = allies.reduce((a, p) => a + (p.scores?.kills ?? 0), 0);
  const enemyKillsTotal = enemies.reduce((a, p) => a + (p.scores?.kills ?? 0), 0);

  const topFedEnemy = [...enemyPlayers].sort(
    (a, b) => b.kills * 2 + b.level - (a.kills * 2 + a.level),
  )[0];

  const isBehind =
    deaths >= kills + 2 ||
    enemyKillsTotal >= allyKillsTotal + 4 ||
    (Boolean(topFedEnemy) && (topFedEnemy.kills >= 4 || topFedEnemy.level >= level + 2)) ||
    (gameTimeMin >= 8 && csPaceDelta <= -2.0 && preferredRole !== 'SUPPORT');

  const isAhead =
    !isBehind &&
    kills + assists >= deaths + 4 &&
    allyKillsTotal >= enemyKillsTotal + 2;

  const gameState: LiveCoachSnapshot['gameState'] = isBehind
    ? 'BEHIND'
    : isAhead
      ? 'AHEAD'
      : 'EVEN';

  let comebackAdvice: LiveCoachSnapshot['comebackAdvice'] = null;
  if (gameState === 'BEHIND') {
    const fedItemsText = (topFedEnemy?.items || [])
      .map((it) => it.displayName.toLowerCase())
      .join(' ');
    const fedLooksAp = Boolean(
      fedItemsText.match(/rabadon|liandry|ombre|lud|bâton|malign|flamme|zhonya|abyssal|nashor|void|crypt/),
    );
    const fedLooksAd = Boolean(
      fedItemsText.match(/infini|kraken|youmuu|éclipse|dusk|collect|hydra|soif|mortal|dominik|trinit|stérak|gantelet/),
    );
    const fedLooksHeal =
      Boolean(fedItemsText.match(/soif|bork|roi déchu|eclipse|visage|ravenous|bloodthirst|sucker/)) ||
      ['Aatrox', 'Vladimir', 'Warwick', 'Briar', 'Soraka', 'Sylas', 'Swain', 'Yone', 'Viego', 'DrMundo'].includes(
        topFedEnemy?.championName || '',
      );

    const reasons: string[] = [];
    if (deaths >= kills + 2) reasons.push(`KDA personnel en déficit (${kills}/${deaths}/${assists})`);
    if (enemyKillsTotal >= allyKillsTotal + 4) {
      reasons.push(`Équipe en retard (${allyKillsTotal} vs ${enemyKillsTotal} éliminations)`);
    }
    if (topFedEnemy && (topFedEnemy.kills >= 4 || topFedEnemy.level >= level + 2)) {
      reasons.push(
        `${topFedEnemy.championName} menace principale (${topFedEnemy.kills}/${topFedEnemy.deaths}, Niv.${topFedEnemy.level})`,
      );
    }
    if (gameTimeMin >= 8 && csPaceDelta <= -2.0 && preferredRole !== 'SUPPORT') {
      reasons.push(`Retard de farm (${csPerMin} CS/min)`);
    }

    let priorityItemHint =
      'Privilégiez un composant défensif économique (Armure d’étoffe / Manteau de RM / Ceinture du géant) et les bottes adaptées avant de viser un 3e objet coûteux.';
    if (fedLooksAp && !fedLooksAd) {
      priorityItemHint = `Contre ${topFedEnemy?.championName || 'le carry AP'} : investissez rapidement dans Sandales de Mercure / Manteau de Spectre → Kaénique de Rookern ou Visage spirituel (ou Voile de la banshee / Gueule de Malmortius selon votre rôle).`;
    } else if (fedLooksAd) {
      priorityItemHint = `Contre ${topFedEnemy?.championName || 'le carry AD'} : priorisez Coques en acier / Cotte de mailles → Présage de Randuin, Vœu du chevalier ou Sablier de Zhonya (800–1200 po d’impact immédiat).`;
    }
    if (fedLooksHeal) {
      priorityItemHint += ' Ajoutez un anti-soin à 800 po (Armure ronce / Orbe de l’oubli / Marque du bourreau) au prochain rappel.';
    }

    comebackAdvice = {
      triggerReason: reasons.join(' · ') || 'Pression adverse élevée détectée sur la carte.',
      priorityItemHint,
      gameplayPivot:
        preferredRole === 'SUPPORT'
          ? `Restez collé à votre allié le plus fort pour absorber l'engage de ${topFedEnemy?.championName || 'la menace adverse'}, jouez la vision défensive dans votre jungle et ne contestez aucun objectif sans supériorité numérique.`
          : `Congelez ou récupérez les vagues sûres près de vos T2, évitez les duels 1v1 contre ${topFedEnemy?.championName || 'le joueur en avance'} et forcez des combats 3v2 autour des tours/primes.`,
    };
  }

  return {
    source,
    receivedAt: new Date().toISOString(),
    gameMode: raw.gameData?.gameMode,
    gameTimeSec,
    championName: resolvedSelfChampionName,
    level,
    currentGold,
    activeStats,
    kda: `${kills}/${deaths}/${assists}`,
    cs,
    csPerMin,
    targetCsPerMin,
    csPaceDelta,
    allyKills: allyKillsTotal,
    enemyKills: enemyKillsTotal,
    dragonTimerSec,
    baronTimerSec,
    alerts,
    allyPlayers,
    enemyPlayers,
    enemyThreats,
    rawSummary: {
      allyTeam: allies.map((a) => a.championName),
      enemyTeam: enemies.map((e) => e.championName),
    },
    fullRunesSummary,
    activeAbilityLevels,
    gameState,
    comebackAdvice,
    gameEvents,
  };
}
