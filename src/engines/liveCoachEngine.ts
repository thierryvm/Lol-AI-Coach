import type {
  LiveClientAllGameData,
  LiveCoachSnapshot,
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
      }
    : null;

  const events = raw.events?.Events || [];
  const lastDragon = [...events].reverse().find((e) => e.EventName === 'DragonKill');
  const lastBaron = [...events].reverse().find((e) => e.EventName === 'BaronKill');

  const dragonTimerSec = lastDragon
    ? Math.max(0, Math.round(lastDragon.EventTime + 300 - gameTimeSec))
    : gameTimeSec < 300
      ? 300 - gameTimeSec
      : 0;

  const baronTimerSec = lastBaron
    ? Math.max(0, Math.round(lastBaron.EventTime + 360 - gameTimeSec))
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

  return {
    source,
    receivedAt: new Date().toISOString(),
    gameTimeSec,
    championName: activeName,
    level,
    currentGold,
    activeStats,
    kda: `${kills}/${deaths}/${assists}`,
    cs,
    csPerMin,
    targetCsPerMin,
    csPaceDelta,
    allyKills: allies.reduce((a, p) => a + (p.scores?.kills ?? 0), 0),
    enemyKills: enemies.reduce((a, p) => a + (p.scores?.kills ?? 0), 0),
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
  };
}
