import { Router } from 'express';
import { FACTION_IDS } from '../config.js';
import { db } from '../db/database.js';
import {
  addScriptedMessage,
  resetWorld,
  getMessages,
  getAllDiplomacy,
  getAiLog,
  getAllRoutes,
} from '../db/queries.js';
import { runScan, scanStatus } from '../ai/scan.js';
import { resetBuildings } from '../services/buildings.js';
import { settleCaravans, publicCaravan } from '../services/caravans.js';
import { broadcastAll } from '../socket/hub.js';

export const devRouter = Router();

// Scripted chat so one person can test the whole AI loop. The {target}
// placeholder is replaced with the faction the chat should blame or befriend.
const SCRIPTS = {
  war: [
    'The {target} insulted us at the border market. Burn their camps.',
    'I say we march on the {target} tonight, no warning.',
    'Enough talk - sharpen every weapon and aim it at {target}.',
    'The {target} stole our iron. This is war, brothers.',
    'Kill their scouts, take the {target} mines.',
  ],
  trade: [
    'Anyone want to open a trade route with the {target}? We have surplus grain.',
    'A deal with the {target} would help us both, honestly.',
    'Let us send merchants to {target}, not soldiers.',
    'Friendship with the {target} is cheaper than war. Agree?',
    'We should ally with {target} and share the river market.',
  ],
  fear: [
    'The {target} outnumber us. Fortify the walls, now.',
    'I am afraid of the {target}. We have too few tools and less food.',
    'If the {target} attack we are finished. Defend the village.',
    'We are starving and scared of {target}. Make peace.',
    'Pull back the outposts - the {target} cannot be held off.',
  ],
  calm: [
    'Nice weather for chopping today.',
    'Fed the cows twice, they look happy.',
    'Anyone seen my lost hammer?',
    'Just mining slowly, no drama.',
  ],
};

devRouter.post('/seed', (req, res) => {
  const { faction = FACTION_IDS[0], mood = 'war', count = 5, target = null } = req.body || {};
  if (!FACTION_IDS.includes(faction)) {
    return res.status(400).json({ ok: false, error: 'Unknown faction' });
  }

  const others = FACTION_IDS.filter((f) => f !== faction);
  const targetFaction = others.includes(target) ? target : others[0];
  const lines = (SCRIPTS[mood] || SCRIPTS.war).map((line) =>
    line.replace(/\{target\}/g, targetFaction)
  );
  const names = ['Bram', 'Odla', 'Karn', 'Sela', 'Torvald', 'Nissa'];
  const total = Math.min(Number(count) || 5, lines.length);

  for (let i = 0; i < total; i += 1) {
    addScriptedMessage({
      faction,
      username: names[i % names.length],
      content: lines[i],
      offsetMs: (total - i) * 60_000,
    });
  }

  broadcastAll('dev:seeded', { faction, mood, target: targetFaction, seeded: total });
  res.json({
    ok: true,
    faction,
    mood,
    target: targetFaction,
    seeded: total,
    chat: getMessages(faction, 10),
  });
});

devRouter.post('/scan-now', async (req, res) => {
  const result = await runScan({ manual: true });
  res.json({
    ok: !result.error,
    result,
    scan: scanStatus(),
    diplomacy: getAllDiplomacy(),
    aiLog: getAiLog(12),
  });
});

devRouter.post('/reset', (req, res) => {
  const { faction = null } = req.body || {};
  if (faction && FACTION_IDS.includes(faction)) {
    db.prepare('DELETE FROM messages WHERE faction = ?').run(faction);
    db.prepare('DELETE FROM sentiments WHERE faction = ?').run(faction);
    return res.json({ ok: true, cleared: faction });
  }
  resetWorld();
  resetBuildings();
  broadcastAll('buildings:refresh', { at: Date.now() });
  broadcastAll('caravans:refresh', { at: Date.now() });
  broadcastAll('diplomacy:change', { pairs: getAllDiplomacy(), log: getAiLog(12), manual: true });
  res.json({ ok: true, cleared: 'all' });
});

/**
 * Send every wagon on the road straight to its destination. Purely a testing
 * affordance: you do not have to sit through 45s of travel to see a trade land.
 */
devRouter.post('/caravans-arrive', (req, res) => {
  const settled = settleCaravans(Number.MAX_SAFE_INTEGER).map(publicCaravan);
  broadcastAll('caravans:refresh', { at: Date.now() });
  res.json({ ok: true, settled, routes: getAllRoutes() });
});

devRouter.get('/chat/:faction', (req, res) => {
  if (!FACTION_IDS.includes(req.params.faction)) {
    return res.status(400).json({ ok: false, error: 'Unknown faction' });
  }
  res.json({ ok: true, messages: getMessages(req.params.faction, 50) });
});
