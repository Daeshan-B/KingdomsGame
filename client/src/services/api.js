// All HTTP calls to the game server. Relative URLs are proxied by Vite to :3001.

async function readJson(res) {
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return data;
}

async function getJson(url) {
  const res = await fetch(url);
  const data = await readJson(res);
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return readJson(res);
}

export async function joinGame(username, faction) {
  const data = await postJson('/api/players/join', { username, faction });
  if (!data.ok) throw new Error(data.error || 'Could not join');
  return data.state;
}

export function fetchState(playerId) {
  return getJson(`/api/state/${playerId}`);
}

/**
 * Jobs return ok:false for legit gameplay reasons (cooldown, no iron), so we
 * hand the raw result back instead of throwing.
 */
export async function performJob(playerId, jobType) {
  return postJson('/api/jobs/perform', { playerId, jobType });
}

export function scanNow() {
  return postJson('/api/dev/scan-now', {});
}

export function seedChat(faction, mood, target) {
  return postJson('/api/dev/seed', { faction, mood, target });
}

export function fetchConfig() {
  return getJson('/api/config');
}

export async function startBuild(playerId, type) {
  return postJson('/api/buildings/start', { playerId, type });
}

/**
 * Load a caravan. `ask` may be 'auto' (let the market pick what we need) or a
 * resource name. Like jobs, it returns ok:false for ordinary gameplay reasons.
 */
export async function sendCaravan(playerId, receiver, resource, amount, ask = 'auto') {
  return postJson('/api/caravans/send', { playerId, receiver, resource, amount, ask });
}

export function fetchMarket(playerId) {
  return getJson(`/api/market/${playerId}`);
}
