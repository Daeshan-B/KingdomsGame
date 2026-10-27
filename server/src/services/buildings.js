import {
  BUILDINGS,
  BUILDING_IDS,
  BUILDING_RULES,
  JOBS,
  FACTION_IDS,
  buildingCost,
  buildingSeconds,
} from '../config.js';
import {
  getPlayer,
  getResources,
  applyResourceDelta,
  getBuildingRows,
  saveBuilding,
  getDueBuildings,
  resetBuildings,
} from '../db/queries.js';

export { resetBuildings };
import { broadcastFaction, broadcastAll } from '../socket/hub.js';

/**
 * Settle any construction whose timer has elapsed. Called lazily before every
 * read and also by a 2s ticker so the completion can be announced to the room.
 * Returns the building rows that finished.
 */
export function settleDue() {
  const due = getDueBuildings(Date.now());
  const finished = [];
  for (const row of due) {
    const next = saveBuilding({
      faction: row.faction,
      type: row.type,
      level: row.level + 1,
      started_at: null,
      completes_at: null,
      builder: row.builder,
    });
    finished.push(next);
    broadcastFaction(row.faction, 'building:complete', next);
  }
  if (finished.length) broadcastAll('buildings:refresh', { at: Date.now() });
  return finished;
}

function negate(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = -v;
  return out;
}

/** Production bonuses a faction currently enjoys from finished buildings. */
export function bonusesFor(faction) {
  settleDue();
  const levels = levelMap(faction);
  return {
    ironPerMine: levels.mine,
    foodPerGathering: levels.farm,
    cooldownCutMs: Math.min(
      levels.market * BUILDING_RULES.marketCooldownCutPerLevel,
      Math.max(0, (JOBS.mine.cooldownMs || 0) - BUILDING_RULES.minJobCooldownMs)
    ),
    defense: levels.wall * BUILDING_RULES.defensePerWallLevel,
    levels,
  };
}

export function levelMap(faction) {
  const levels = {};
  for (const id of BUILDING_IDS) levels[id] = 0;
  for (const row of getBuildingRows(faction)) levels[row.type] = row.level;
  return levels;
}

/** Cooldown a specific job runs on for this faction, after Market discount. */
export function effectiveCooldownMs(faction, jobType) {
  const base = JOBS[jobType]?.cooldownMs ?? 0;
  const cut = Math.min(
    levelMap(faction).market * BUILDING_RULES.marketCooldownCutPerLevel,
    Math.max(0, base - BUILDING_RULES.minJobCooldownMs)
  );
  return Math.max(BUILDING_RULES.minJobCooldownMs, base - cut);
}

export function jobTimers(faction) {
  const out = {};
  for (const id of Object.keys(JOBS)) out[id] = effectiveCooldownMs(faction, id);
  return out;
}

/** Extra yield for a job based on building levels. */
export function yieldBonusFor(faction, jobType) {
  const levels = levelMap(faction);
  const bonus = {};
  if (jobType === 'mine' && levels.mine > 0) bonus.iron = levels.mine;
  if ((jobType === 'farm' || jobType === 'feed') && levels.farm > 0) bonus.food = levels.farm;
  return bonus;
}

/** UI-ready view of every building, including affordability and progress. */
export function buildingSnapshot(faction) {
  settleDue();
  const rows = getBuildingRows(faction);
  const resources = getResources(faction);
  const t = Date.now();

  return BUILDING_IDS.map((id) => {
    const def = BUILDINGS[id];
    const row = rows.find((r) => r.type === id) || { level: 0, completes_at: null, started_at: null };
    const level = row.level;
    const cost = level >= def.maxLevel ? null : buildingCost(id, level);
    const seconds = level >= def.maxLevel ? 0 : buildingSeconds(id, level);
    const building = Boolean(row.completes_at);
    const affordable = cost
      ? Object.entries(cost).every(([res, need]) => (resources[res] ?? 0) >= need)
      : false;

    return {
      id,
      label: def.label,
      emoji: def.emoji,
      effect: def.effect,
      level,
      maxLevel: def.maxLevel,
      cost,
      seconds,
      building,
      completesAt: row.completes_at || null,
      remainingMs: building ? Math.max(0, Number(row.completes_at) - t) : 0,
      totalMs: building && row.started_at ? Math.max(1, Number(row.completes_at) - Number(row.started_at)) : seconds * 1000,
      builder: row.builder || null,
      affordable,
      maxed: level >= def.maxLevel,
    };
  });
}

/**
 * Start raising the next level. The faction pays up front from the shared
 * stockpile; if the materials are not there, nothing happens.
 */
export function beginBuild(playerId, type) {
  const player = getPlayer(playerId);
  if (!player) return { ok: false, status: 404, error: 'Unknown player. Re-join the world.' };

  const def = BUILDINGS[type];
  if (!def) return { ok: false, status: 400, error: 'Unknown building' };

  settleDue();
  const row = getBuildingRows(player.faction).find((r) => r.type === type);
  const level = row?.level ?? 0;

  if (level >= def.maxLevel) {
    return { ok: false, status: 400, error: `${def.label} is already at max level ${def.maxLevel}` };
  }
  if (row?.completes_at && Number(row.completes_at) > Date.now()) {
    const left = Math.ceil((Number(row.completes_at) - Date.now()) / 1000);
    return { ok: false, status: 409, error: `${def.label} is already being raised (${left}s left)` };
  }

  const cost = buildingCost(type, level);
  const paid = applyResourceDelta(player.faction, negate(cost));
  if (!paid.ok) {
    const need = Object.entries(cost)
      .map(([k, v]) => `${v} ${k}`)
      .join(' + ');
    return { ok: false, status: 400, error: `Not enough ${paid.shortfall} - ${def.label} level ${level + 1} needs ${need}` };
  }

  const t = Date.now();
  const saved = saveBuilding({
    faction: player.faction,
    type,
    level,
    started_at: t,
    completes_at: t + buildingSeconds(type, level) * 1000,
    builder: player.username,
  });

  broadcastFaction(player.faction, 'resources:update', {
    faction: player.faction,
    resources: getResources(player.faction),
  });
  broadcastFaction(player.faction, 'building:start', saved);

  return {
    ok: true,
    status: 200,
    building: saved,
    resources: getResources(player.faction),
    buildings: buildingSnapshot(player.faction),
  };
}

/** Defense + stockpile strength per faction, handed to the AI as world context. */
export function factionStrength(faction) {
  const res = getResources(faction);
  const bonuses = bonusesFor(faction);
  return {
    faction,
    iron: res.iron,
    food: res.food,
    wood: res.wood,
    tools: res.tools,
    defense: bonuses.defense,
    buildings: bonuses.levels,
  };
}

export function allFactionStrength() {
  return FACTION_IDS.map(factionStrength);
}
