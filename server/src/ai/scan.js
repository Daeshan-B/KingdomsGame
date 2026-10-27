import { FACTION_IDS, WORLD } from '../config.js';
import { saveSentiment, getAllDiplomacy, getAiLog, getLastScanAt } from '../db/queries.js';
import { analyzeFaction } from './sentiment.js';
import { decideFor, applyDecision } from './decisions.js';
import { warBreaksRoute } from '../services/caravans.js';
import { broadcastAll } from '../socket/hub.js';

let running = false;
let timer = null;
let lastFinishedAt = null;
let lastDurationMs = null;

/**
 * One full world scan: read every faction's chat, score it, let the council act.
 * Safe to call manually (dev endpoint) - concurrent calls are ignored.
 */
export async function runScan({ manual = false } = {}) {
  if (running) return { skipped: true, reason: 'scan already running' };
  running = true;
  const started = Date.now();

  try {
    const sentiments = [];
    const changes = [];

    for (const faction of FACTION_IDS) {
      const sentiment = await analyzeFaction(faction);
      const saved = saveSentiment(sentiment);
      sentiments.push(saved);

      const decision = decideFor(saved);
      const applied = applyDecision(decision, saved);
      if (applied.changed) changes.push({ decision, pair: applied.pair });

      // A declaration of war closes the road: anything already in transit between
      // the two is lost, so the council's moods have a price in goods.
      if (decision.action === 'war') {
        const stranded = warBreaksRoute(saved.faction, decision.target);
        if (stranded.length) {
          broadcastAll('diplomacy:change', {
            pairs: getAllDiplomacy(),
            log: getAiLog(12),
            manual,
          });
        }
      }
    }

    lastFinishedAt = Date.now();
    lastDurationMs = lastFinishedAt - started;

    broadcastAll('sentiment:update', {
      sentiments,
      changes,
      manual,
      at: lastFinishedAt,
    });

    if (changes.length) {
      broadcastAll('diplomacy:change', {
        pairs: getAllDiplomacy(),
        log: getAiLog(12),
        manual,
      });
    }

    console.log(
      `[ai] scan complete (${lastDurationMs}ms): ${sentiments.map((s) => `${s.faction} A${s.aggression}/C${s.cooperation}/F${s.fear} [${s.source}]`).join('  ')} | ${changes.length} decision(s)`
    );

    return { skipped: false, sentiments, changes, durationMs: lastDurationMs };
  } catch (err) {
    console.error('[ai] scan failed:', err);
    return { skipped: false, error: err.message };
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (timer) return timer;
  timer = setInterval(() => runScan({ manual: false }), WORLD.scanIntervalMs);
  console.log(`[ai] scheduler every ${WORLD.scanIntervalMs / 1000}s (llama: ${WORLD.llamaUrl || 'disabled -> rules'})`);
  return timer;
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Countdown info for the UI: when is the next automatic scan? */
export function scanStatus() {
  const base = lastFinishedAt || getLastScanAt();
  const nextAt = base ? base + WORLD.scanIntervalMs : Date.now() + WORLD.scanIntervalMs;
  return {
    intervalMs: WORLD.scanIntervalMs,
    lastFinishedAt: base || null,
    nextScanAt: nextAt,
    msUntilNextScan: Math.max(0, nextAt - Date.now()),
    lastDurationMs,
    llmEnabled: Boolean(WORLD.llamaUrl),
    llamaUrl: WORLD.llamaUrl || null,
  };
}
