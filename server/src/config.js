// Central game configuration. Tweak balance numbers here only.

// Faction sigil colours come straight from the 16-colour VGA palette so nothing
// on screen is a modern pastel: grey iron, green grove, amber fire.
export const FACTIONS = {
  Ironhelm: {
    id: 'Ironhelm',
    emoji: '⚒️',
    color: 'slate',
    hex: '#808080',
    motto: 'Strength through iron.',
  },
  Greenleaf: {
    id: 'Greenleaf',
    emoji: '🌿',
    color: 'emerald',
    hex: '#008000',
    motto: 'The grove provides.',
  },
  Sunfire: {
    id: 'Sunfire',
    emoji: '🔥',
    color: 'amber',
    hex: '#ff8000',
    motto: 'Burn bright, burn first.',
  },
};

export const FACTION_IDS = Object.keys(FACTIONS);

export const RESOURCES = ['iron', 'food', 'wood', 'tools'];

// Fast, punchy timers: clicking feels responsive instead of waiting half a minute.
export const JOBS = {
  mine: { id: 'mine', label: 'Mine', emoji: '⛏️', yields: { iron: 1 }, cooldownMs: 2_000 },
  farm: { id: 'farm', label: 'Farm', emoji: '🌾', yields: { food: 1 }, cooldownMs: 2_000 },
  chop: { id: 'chop', label: 'Chop Wood', emoji: '🪓', yields: { wood: 1 }, cooldownMs: 2_000 },
  feed: { id: 'feed', label: 'Feed Cows', emoji: '🐄', yields: { food: 1 }, cooldownMs: 2_000 },
  smith: { id: 'smith', label: 'Smith', emoji: '🔨', yields: { tools: 1 }, costs: { iron: 2 }, cooldownMs: 4_000 },
};

export const JOB_IDS = Object.keys(JOBS);

export const DIPLOMACY_STATES = ['neutral', 'war', 'trade'];

// --- Buildings / faction projects ------------------------------------------
// These are the resource SINK that the fast job timers make necessary.
// Cost and build time both scale with the level you already have, and the whole
// faction pays from one shared stockpile, so players have to agree on priorities.
export const BUILDINGS = {
  mine: {
    id: 'mine',
    label: 'Mine Shaft',
    emoji: '⛏️',
    effect: '+1 iron per Mine shift, each level',
    baseCost: { wood: 10, iron: 5 },
    baseSeconds: 15,
    secondsPerLevel: 5,
    maxLevel: 5,
  },
  farm: {
    id: 'farm',
    label: 'Irrigation',
    emoji: '🌾',
    effect: '+1 food per Farm and per Feed Cows, each level',
    baseCost: { wood: 8, food: 4 },
    baseSeconds: 15,
    secondsPerLevel: 5,
    maxLevel: 5,
  },
  market: {
    id: 'market',
    label: 'Market',
    emoji: '🏪',
    effect: '-0.25s off every job cooldown, each level',
    baseCost: { wood: 14, tools: 1 },
    baseSeconds: 20,
    secondsPerLevel: 6,
    maxLevel: 5,
  },
  wall: {
    id: 'wall',
    label: 'Wall',
    emoji: '🛡️',
    effect: '+5 defense, read by the AI council',
    baseCost: { wood: 12, iron: 6 },
    baseSeconds: 18,
    secondsPerLevel: 5,
    maxLevel: 5,
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS);

export const BUILDING_RULES = {
  marketCooldownCutPerLevel: 250, // ms
  minJobCooldownMs: 1000,
  defensePerWallLevel: 5,
};

/** Cost of the NEXT level of a building currently at `level`. */
export function buildingCost(type, level) {
  const b = BUILDINGS[type];
  if (!b) return null;
  const mult = level + 1;
  const cost = {};
  for (const [res, amount] of Object.entries(b.baseCost)) cost[res] = amount * mult;
  return cost;
}

/** Seconds the next level takes to raise. */
export function buildingSeconds(type, level) {
  const b = BUILDINGS[type];
  if (!b) return 0;
  return b.baseSeconds + b.secondsPerLevel * level;
}

// --- Caravans / real trade ---------------------------------------------------
// A signed trade deal used to be only a label. Now it opens a road: factions
// load a wagon, it travels on a timer, and the goods actually move between the
// two stockpiles when it arrives.
//
// Prices are fixed "value" units per resource. Because the exchange rate is the
// same in both directions, you cannot print resources by shipping back and
// forth - trading only ever converts your surplus into the thing you are short
// of. Wood is deliberately pricey because chopping is the slowest job in the
// game, so a faction that never chops can still afford a Mine Shaft.
export const MARKET_RATES = {
  food: 1,
  wood: 2,
  iron: 3,
  tools: 9,
};

export const CARAVAN_RULES = {
  minValue: 10, // a wagon of 3 food is not worth a road
  maxValue: 240, // caps one shipment at 80 iron / 240 food / ~26 tools
  baseRisk: 0.03, // bandits on open roads
  warRisk: 0.25, // added when either partner is fighting anyone
};

/** Value units of `amount` units of `resource`. */
export function goodsValue(resource, amount) {
  return Math.round((MARKET_RATES[resource] || 0) * Number(amount || 0));
}

/** How many units of `resource` fit inside a budget of value units. */
export function amountForValue(resource, value) {
  const rate = MARKET_RATES[resource];
  if (!rate) return 0;
  return Math.max(0, Math.floor(Number(value) / rate));
}

export const WORLD = {
  port: Number(process.env.PORT || 3001),
  dbName: process.env.DATABASE_PATH || 'data/kingdoms.sqlite',
  scanIntervalMs: Number(process.env.AI_SCAN_INTERVAL_MS || 5 * 60 * 1000),
  chatScanDepth: Number(process.env.AI_SCAN_MESSAGES || 50),
  tradeExpiryMs: Number(process.env.TRADE_EXPIRY_MS || 24 * 60 * 60 * 1000),
  chatRateLimitMs: Number(process.env.CHAT_RATE_LIMIT_MS || 2000),
  llamaUrl: process.env.LLAMA_URL || '',
  llamaModel: process.env.LLAMA_MODEL || 'local',
  llamaTimeoutMs: Number(process.env.LLAMA_TIMEOUT_MS || 30_000),
  caravanTravelMs: Number(process.env.CARAVAN_TRAVEL_MS || 45_000),
  caravanMaxInFlight: Number(process.env.CARAVAN_MAX_IN_FLIGHT || 2),
};
