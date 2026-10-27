import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';
import { FACTION_IDS, WORLD, BUILDING_IDS } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..', '..');

const dbPath = path.isAbsolute(WORLD.dbName)
  ? WORLD.dbName
  : path.join(projectRoot, WORLD.dbName);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Older builds stored cooldowns as one row per player. Cooldown data is
// disposable, so drop the legacy table and let the schema recreate it.
const cooldownColumns = db.prepare('PRAGMA table_info(cooldowns)').all();
if (cooldownColumns.some((c) => c.name === 'last_job_at')) {
  db.exec('DROP TABLE cooldowns');
  console.log('[db] migrated cooldowns table to per-job rows');
}

db.exec(SCHEMA_SQL);

// --- Seed the world on first run -------------------------------------------

const seedResources = db.prepare(
  'INSERT OR IGNORE INTO resources (faction, iron, food, wood, tools) VALUES (?, 10, 10, 10, 0)'
);
for (const faction of FACTION_IDS) seedResources.run(faction);

const seedBuilding = db.prepare(
  'INSERT OR IGNORE INTO buildings (faction, type, level) VALUES (?, ?, 0)'
);
for (const faction of FACTION_IDS) {
  for (const type of BUILDING_IDS) seedBuilding.run(faction, type);
}

function pairKey(a, b) {
  return [a, b].sort();
}

const seedDiplomacy = db.prepare(
  'INSERT OR IGNORE INTO diplomacy (faction_a, faction_b, state, reason) VALUES (?, ?, ?, ?)'
);
for (let i = 0; i < FACTION_IDS.length; i += 1) {
  for (let j = i + 1; j < FACTION_IDS.length; j += 1) {
    const [a, b] = pairKey(FACTION_IDS[i], FACTION_IDS[j]);
    seedDiplomacy.run(a, b, 'neutral', 'Original founding treaty');
  }
}

export { dbPath, pairKey };
console.log(`[db] using ${dbPath}`);
