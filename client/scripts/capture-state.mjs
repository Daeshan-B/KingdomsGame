// Grabs one real dashboard payload from a running game server so the SSR render
// check (npm run check:render) can render panels with genuine server shapes.
// Requires: npm run dev (server on :3001).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '.render-check-state.json');
const base = process.env.GAME_API || 'http://localhost:3001';

const res = await fetch(`${base}/api/players/join`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: `Ssr${Date.now() % 1000000}`, faction: 'Ironhelm' }),
});
const data = await res.json();
if (!data.ok) throw new Error(`join failed: ${data.error}`);

fs.writeFileSync(out, JSON.stringify(data, null, 2));
console.log(`[check] captured state for ${data.state.player.username} (${data.state.player.faction}) -> ${out}`);
