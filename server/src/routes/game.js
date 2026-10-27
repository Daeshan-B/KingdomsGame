import { Router } from 'express';
import { FACTIONS, FACTION_IDS, JOBS, BUILDINGS, RESOURCES } from '../config.js';
import {
  createPlayer,
  getPlayer,
  getResources,
  getMessages,
  getAllDiplomacy,
  getLatestSentiments,
  getAiLog,
} from '../db/queries.js';
import { performJob, cooldownMap, jobEffects } from '../services/jobs.js';
import { buildingSnapshot, beginBuild, jobTimers } from '../services/buildings.js';
import { sendCaravan, marketSnapshot, caravanView } from '../services/caravans.js';
import { scanStatus } from '../ai/scan.js';
import { presence } from '../socket/index.js';

export const gameRouter = Router();

/** Full dashboard payload in a single call - simpler for the React side. */
function buildState(player) {
  return {
    player,
    faction: FACTIONS[player.faction],
    factions: Object.values(FACTIONS),
    jobs: Object.values(JOBS),
    jobEffects: jobEffects(player),
    jobTimers: jobTimers(player.faction),
    buildings: buildingSnapshot(player.faction),
    buildingDefs: Object.values(BUILDINGS),
    resources: getResources(player.faction),
    otherResources: FACTION_IDS
      .filter((f) => f !== player.faction)
      .map((f) => ({ faction: f, ...getResources(f) })),
    otherBuildings: FACTION_IDS
      .filter((f) => f !== player.faction)
      .map((f) => ({ faction: f, levels: buildingSnapshot(f).reduce((acc, b) => ({ ...acc, [b.id]: b.level }), {}) })),
    messages: getMessages(player.faction, 40),
    caravans: caravanView(player.faction),
    market: marketSnapshot(player.faction),
    cooldowns: cooldownMap(player),
    diplomacy: getAllDiplomacy(),
    sentiments: getLatestSentiments(),
    aiLog: getAiLog(12),
    scan: scanStatus(),
    presence: presence(),
    resourceKeys: RESOURCES,
  };
}

gameRouter.post('/players/join', (req, res) => {
  try {
    const { username, faction } = req.body || {};
    const player = createPlayer(username, faction);
    res.json({ ok: true, state: buildState(player) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

gameRouter.get('/players/:id', (req, res) => {
  const player = getPlayer(req.params.id);
  if (!player) return res.status(404).json({ ok: false, error: 'Unknown player' });
  res.json({ ok: true, player });
});

gameRouter.get('/state/:playerId', (req, res) => {
  const player = getPlayer(req.params.playerId);
  if (!player) return res.status(404).json({ ok: false, error: 'Unknown player' });
  res.json({ ok: true, state: buildState(player) });
});

gameRouter.post('/jobs/perform', (req, res) => {
  const { playerId, jobType } = req.body || {};
  const result = performJob(playerId, jobType);
  if (!result.ok) return res.status(result.status).json(result);
  res.json(result);
});

gameRouter.post('/buildings/start', (req, res) => {
  const { playerId, type } = req.body || {};
  const result = beginBuild(playerId, type);
  if (!result.ok) return res.status(result.status).json(result);
  res.json(result);
});

gameRouter.get('/buildings/:faction', (req, res) => {
  if (!FACTION_IDS.includes(req.params.faction)) {
    return res.status(400).json({ ok: false, error: 'Unknown faction' });
  }
  res.json({ ok: true, buildings: buildingSnapshot(req.params.faction) });
});

// --- Caravans ---------------------------------------------------------------

/** Load a wagon for a partner faction. Cargo is escrowed the moment it leaves. */
gameRouter.post('/caravans/send', (req, res) => {
  const { playerId, receiver, resource, amount, ask } = req.body || {};
  const result = sendCaravan(playerId, receiver, resource, amount, ask);
  if (!result.ok) return res.status(result.status).json(result);
  res.json(result);
});

gameRouter.get('/market/:playerId', (req, res) => {
  const player = getPlayer(req.params.playerId);
  if (!player) return res.status(404).json({ ok: false, error: 'Unknown player' });
  res.json({
    ok: true,
    market: marketSnapshot(player.faction),
    caravans: caravanView(player.faction),
  });
});
