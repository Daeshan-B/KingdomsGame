import crypto from 'node:crypto';
import { db, pairKey } from './database.js';
import { FACTION_IDS, WORLD, RESOURCES } from '../config.js';

const id = () => crypto.randomUUID();
const now = () => Date.now();

// --- Players ---------------------------------------------------------------

const insertPlayer = db.prepare('INSERT INTO players (id, username, faction) VALUES (?, ?, ?)');
const findPlayer = db.prepare('SELECT * FROM players WHERE id = ?');
const findPlayerByName = db.prepare('SELECT * FROM players WHERE lower(username) = lower(?)');
const listPlayers = db.prepare('SELECT * FROM players ORDER BY created_at');

export function createPlayer(rawUsername, faction) {
  const username = String(rawUsername || '').trim().slice(0, 24);
  if (!username) throw new Error('Username is required');
  if (!FACTION_IDS.includes(faction)) throw new Error('Unknown faction');
  if (findPlayerByName.get(username)) throw new Error('That name is already taken');
  const playerId = id();
  insertPlayer.run(playerId, username, faction);
  return findPlayer.get(playerId);
}

export function getPlayer(playerId) {
  return findPlayer.get(playerId) || null;
}

export function listAllPlayers() {
  return listPlayers.all();
}

// --- Resources -------------------------------------------------------------

const findResources = db.prepare('SELECT * FROM resources WHERE faction = ?');
const upsertResources = db.prepare(`
  INSERT INTO resources (faction, ${RESOURCES.join(', ')})
  VALUES (?, ${RESOURCES.map(() => '?').join(', ')})
  ON CONFLICT(faction) DO UPDATE SET ${RESOURCES.map((r) => `${r} = excluded.${r}`).join(', ')}
`);

export function getResources(faction) {
  return findResources.get(faction);
}

export function allResources() {
  return FACTION_IDS.map((f) => findResources.get(f)).filter(Boolean);
}

/** Add/subtract resources. Blocks going negative. Returns the new row. */
export function applyResourceDelta(faction, deltas) {
  const current = findResources.get(faction);
  if (!current) throw new Error(`No resource row for ${faction}`);

  const next = { ...current };
  for (const [key, amount] of Object.entries(deltas)) {
    if (!RESOURCES.includes(key)) continue;
    next[key] = (current[key] || 0) + amount;
    if (next[key] < 0) return { ok: false, current, shortfall: key };
  }
  upsertResources.run(next.faction, ...RESOURCES.map((r) => next[r]));
  return { ok: true, current: findResources.get(faction) };
}

// --- Chat -------------------------------------------------------------

const insertMsg = db.prepare(
  'INSERT INTO messages (id, faction, player_id, username, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
);
const recentMsgs = db.prepare(
  'SELECT * FROM messages WHERE faction = ? ORDER BY created_at DESC LIMIT ?'
);
const lastMsgTime = db.prepare(
  'SELECT created_at FROM messages WHERE player_id = ? ORDER BY created_at DESC LIMIT 1'
);

export function addMessage({ faction, playerId, username, content }) {
  const clean = String(content || '').trim().slice(0, 300);
  if (!clean) return null;
  const last = lastMsgTime.get(playerId);
  if (last && now() - Number(last.created_at) < WORLD.chatRateLimitMs) {
    throw new Error('Slow down, that message was too soon');
  }
  const row = { id: id(), faction, player_id: playerId, username, content: clean, created_at: now() };
  insertMsg.run(row.id, row.faction, row.player_id, row.username, row.content, row.created_at);
  return row;
}

export function getMessages(faction, limit = 30) {
  return recentMsgs.all(faction, limit).reverse();
}

export function countMessages(faction) {
  return recentMsgs.all(faction, WORLD.chatScanDepth);
}

// --- Cooldowns -------------------------------------------------------------

const findCooldowns = db.prepare('SELECT job_type, last_used FROM cooldowns WHERE player_id = ?');
const touchCooldown = db.prepare(`
  INSERT INTO cooldowns (player_id, job_type, last_used)
  VALUES (?, ?, ?)
  ON CONFLICT(player_id, job_type) DO UPDATE SET last_used = excluded.last_used
`);

/** { mine: 1712345678901, smith: ... } - last time each job was used, in ms */
export function getCooldowns(playerId) {
  const map = {};
  for (const row of findCooldowns.all(playerId)) map[row.job_type] = Number(row.last_used);
  return map;
}

export function markJobUsed(playerId, jobType) {
  touchCooldown.run(playerId, jobType, now());
  return getCooldowns(playerId);
}

// --- Sentiment --------------------------------------------------------

const insertSent = db.prepare(`
  INSERT INTO sentiments (id, faction, aggression, cooperation, fear, target_faction, summary, source, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const latestSentByFaction = db.prepare(
  'SELECT * FROM sentiments WHERE faction = ? ORDER BY created_at DESC LIMIT 1'
);
const lastScanRow = db.prepare('SELECT created_at FROM sentiments ORDER BY created_at DESC LIMIT 1');

export function saveSentiment({ faction, aggression, cooperation, fear, target, summary, source }) {
  const row = {
    id: id(),
    faction,
    aggression: clampScore(aggression),
    cooperation: clampScore(cooperation),
    fear: clampScore(fear),
    target_faction: FACTION_IDS.includes(target) && target !== faction ? target : null,
    summary: String(summary || '').slice(0, 240),
    source,
    created_at: now(),
  };
  insertSent.run(
    row.id, row.faction, row.aggression, row.cooperation, row.fear,
    row.target_faction, row.summary, row.source, row.created_at
  );
  return row;
}

function clampScore(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(10, v));
}

export function getLatestSentiments() {
  return FACTION_IDS.map((f) => latestSentByFaction.get(f)).filter(Boolean);
}

export function getLastScanAt() {
  const row = lastScanRow.get();
  return row ? Number(row.created_at) : null;
}

// --- Diplomacy --------------------------------------------------------

const findPair = db.prepare('SELECT * FROM diplomacy WHERE faction_a = ? AND faction_b = ?');
const allPairs = db.prepare('SELECT * FROM diplomacy');
const upsertPair = db.prepare(`
  INSERT INTO diplomacy (faction_a, faction_b, state, updated_at, expires_at, reason)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(faction_a, faction_b) DO UPDATE SET
    state = excluded.state,
    updated_at = excluded.updated_at,
    expires_at = excluded.expires_at,
    reason = excluded.reason
`);

export function getDiplomacy(a, b) {
  const [x, y] = pairKey(a, b);
  return findPair.get(x, y);
}

export function getAllDiplomacy() {
  const rows = allPairs.all();
  const t = now();
  // expire trade deals lazily
  return rows.map((row) => {
    if (row.state === 'trade' && row.expires_at && Number(row.expires_at) < t) {
      upsertPair.run(row.faction_a, row.faction_b, 'neutral', t, null, 'Trade deal expired');
      return { ...row, state: 'neutral', expires_at: null, reason: 'Trade deal expired' };
    }
    return row;
  });
}

export function setDiplomacy(a, b, state, reason) {
  const [x, y] = pairKey(a, b);
  const t = now();
  const expires = state === 'trade' ? t + WORLD.tradeExpiryMs : null;
  upsertPair.run(x, y, state, t, expires, String(reason || '').slice(0, 200));
  return findPair.get(x, y);
}

// --- AI log ------------------------------------------------------------

const insertLog = db.prepare('INSERT INTO ai_log (id, faction, action, detail, created_at) VALUES (?, ?, ?, ?, ?)');
const readLog = db.prepare('SELECT * FROM ai_log ORDER BY created_at DESC LIMIT ?');

export function addAiLog(faction, action, detail) {
  const row = { id: id(), faction, action, detail: String(detail || '').slice(0, 300), created_at: now() };
  insertLog.run(row.id, row.faction, row.action, row.detail, row.created_at);
  return row;
}

export function getAiLog(limit = 12) {
  return readLog.all(limit);
}

// --- Dev helpers ------------------------------------------------------

/** Insert a chat line without the per-player rate limit (used by /api/dev/seed). */
export function addScriptedMessage({ faction, username = 'Citizen', content, offsetMs = 0 }) {
  const row = {
    id: id(),
    faction,
    player_id: 'system',
    username,
    content: String(content).slice(0, 300),
    created_at: now() - offsetMs,
  };
  insertMsg.run(row.id, row.faction, row.player_id, row.username, row.content, row.created_at);
  return row;
}

/** Wipe chat + sentiments + diplomacy back to a neutral world. Handy while testing. */
export function resetWorld() {
  db.prepare('DELETE FROM messages').run();
  db.prepare('DELETE FROM sentiments').run();
  db.prepare('DELETE FROM ai_log').run();
  resetCaravans();
  for (const f of FACTION_IDS) {
    db.prepare('UPDATE resources SET iron = 10, food = 10, wood = 10, tools = 0 WHERE faction = ?').run(f);
  }
  db.prepare("UPDATE diplomacy SET state = 'neutral', reason = 'World reset', expires_at = NULL, updated_at = ?").run(now());
  return { ok: true };
}

// --- Buildings --------------------------------------------------------

const findBuildings = db.prepare('SELECT * FROM buildings WHERE faction = ? ORDER BY type');
const dueBuildings = db.prepare(
  'SELECT * FROM buildings WHERE completes_at IS NOT NULL AND completes_at <= ?'
);
const writeBuilding = db.prepare(`
  INSERT INTO buildings (faction, type, level, started_at, completes_at, builder)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(faction, type) DO UPDATE SET
    level = excluded.level,
    started_at = excluded.started_at,
    completes_at = excluded.completes_at,
    builder = excluded.builder
`);

export function getBuildingRows(faction) {
  return findBuildings.all(faction);
}

export function saveBuilding({ faction, type, level, started_at, completes_at, builder }) {
  writeBuilding.run(faction, type, level, started_at ?? null, completes_at ?? null, builder ?? null);
  return findBuildings.all(faction).find((r) => r.type === type);
}

/** Rows whose construction timer has elapsed but have not been levelled up yet. */
export function getDueBuildings(atMs) {
  return dueBuildings.all(atMs);
}

/** Wipe all construction progress back to level 0 (dev helper). */
export function resetBuildings() {
  db.prepare('UPDATE buildings SET level = 0, started_at = NULL, completes_at = NULL, builder = NULL').run();
}

// --- Caravans ---------------------------------------------------------

const insertCaravan = db.prepare(`
  INSERT INTO caravans (
    id, sender, receiver, cargo_resource, cargo_amount, ask_resource, ask_amount,
    value, status, started_at, arrives_at, risk, initiator, note
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const findCaravan = db.prepare('SELECT * FROM caravans WHERE id = ?');
const caravansForFaction = db.prepare(
  'SELECT * FROM caravans WHERE sender = ? OR receiver = ? ORDER BY started_at DESC LIMIT ?'
);
const allCaravans = db.prepare('SELECT * FROM caravans ORDER BY started_at DESC LIMIT ?');
const travelingCaravans = db.prepare(
  'SELECT * FROM caravans WHERE status = ? ORDER BY arrives_at'
);
const arrivingCaravans = db.prepare(
  "SELECT * FROM caravans WHERE status = 'traveling' AND arrives_at <= ?"
);
const pairCaravans = db.prepare(
  "SELECT * FROM caravans WHERE status = 'traveling' AND ((sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?))"
);
const countTraveling = db.prepare(
  "SELECT COUNT(*) AS n FROM caravans WHERE status = 'traveling' AND (sender = ? OR receiver = ?)"
);

const writeCaravanStatus = db.prepare(`
  UPDATE caravans
  SET status = ?, settled_at = ?, ask_amount = ?, loss = ?, note = ?
  WHERE id = ?
`);

export function createCaravan(caravan) {
  insertCaravan.run(
    caravan.id, caravan.sender, caravan.receiver,
    caravan.cargo_resource, caravan.cargo_amount,
    caravan.ask_resource, caravan.ask_amount, caravan.value,
    caravan.status, caravan.started_at, caravan.arrives_at,
    caravan.risk ?? null, caravan.initiator ?? null, caravan.note ?? null
  );
  return findCaravan.get(caravan.id);
}

export function getCaravan(id) {
  return findCaravan.get(id) || null;
}

/** Newest caravans touching a faction, in either direction. */
export function getCaravansFor(faction, limit = 20) {
  return caravansForFaction.all(faction, faction, limit);
}

export function getRecentCaravans(limit = 20) {
  return allCaravans.all(limit);
}

export function getTravelingCaravans() {
  return travelingCaravans.all('traveling');
}

/** Caravans whose journey timer has elapsed but that nobody has settled yet. */
export function getDueCaravans(atMs) {
  return arrivingCaravans.all(atMs);
}

/** Every wagon currently between two factions (used when war breaks a route). */
export function getPairCaravans(a, b) {
  return pairCaravans.all(a, b, b, a);
}

/** How many wagons a faction currently has on a road, in or out. */
export function countTravelingFor(faction) {
  return Number(countTraveling.get(faction, faction).n);
}

export function setCaravanOutcome({ id, status, askAmount, loss = null, settledAt = now(), note = null }) {
  writeCaravanStatus.run(status, settledAt, askAmount, loss, note, id);
  return findCaravan.get(id);
}

// --- Trade routes (lifetime history per pair) -------------------------

const readRoute = db.prepare('SELECT * FROM trade_routes WHERE faction_a = ? AND faction_b = ?');
const allRoutes = db.prepare('SELECT * FROM trade_routes');
const bumpRoute = db.prepare(`
  INSERT INTO trade_routes (faction_a, faction_b, delivered, raided, value, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(faction_a, faction_b) DO UPDATE SET
    delivered = delivered + excluded.delivered,
    raided = raided + excluded.raided,
    value = value + excluded.value,
    updated_at = excluded.updated_at
`);

export function getRoute(a, b) {
  const [x, y] = pairKey(a, b);
  return readRoute.get(x, y) || null;
}

export function getAllRoutes() {
  return allRoutes.all();
}

/** Add one settled caravan to the pair's lifetime totals. */
export function addRouteTraffic(a, b, { delivered = 0, raided = 0, value = 0 }) {
  const [x, y] = pairKey(a, b);
  bumpRoute.run(x, y, delivered, raided, value, now());
  return readRoute.get(x, y);
}

/** Zero out all trade history (dev helper). */
export function resetCaravans() {
  db.prepare('DELETE FROM caravans').run();
  db.prepare('DELETE FROM trade_routes').run();
}
