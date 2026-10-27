import { JOBS } from '../config.js';
import {
  getPlayer,
  getResources,
  applyResourceDelta,
  getCooldowns,
  markJobUsed,
} from '../db/queries.js';
import { broadcastFaction } from '../socket/hub.js';
import { effectiveCooldownMs, yieldBonusFor } from './buildings.js';

/** Remaining cooldown for one job in ms (0 = ready). Respects the Market discount. */
export function remainingCooldown(cooldowns, player, jobType) {
  const job = JOBS[jobType];
  if (!job) return 0;
  const last = cooldowns[jobType];
  if (!last) return 0;
  return Math.max(0, Number(last) + effectiveCooldownMs(player.faction, jobType) - Date.now());
}

/** { jobId: msRemaining } for every job this player owns. */
export function cooldownMap(player) {
  const cds = getCooldowns(player.id);
  const out = {};
  for (const jobType of Object.keys(JOBS)) out[jobType] = remainingCooldown(cds, player, jobType);
  return out;
}

/** What a job actually pays out right now: base yields + building bonuses. */
export function effectiveYields(player, jobType) {
  const job = JOBS[jobType];
  if (!job) return {};
  const out = { ...job.yields };
  for (const [res, extra] of Object.entries(yieldBonusFor(player.faction, jobType))) {
    out[res] = (out[res] || 0) + extra;
  }
  return out;
}

/** Payout preview for the whole job board, so the UI can show real numbers. */
export function jobEffects(player) {
  const out = {};
  for (const jobType of Object.keys(JOBS)) out[jobType] = effectiveYields(player, jobType);
  return out;
}

function negate(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = -v;
  return out;
}

/**
 * The whole job transaction: cooldown check, material costs, yields (boosted by
 * this faction's buildings), cooldown stamp, then announce the new stockpile.
 */
export function performJob(playerId, jobType) {
  const player = getPlayer(playerId);
  if (!player) return { ok: false, status: 404, error: 'Unknown player. Re-join the world.' };

  const job = JOBS[jobType];
  if (!job) return { ok: false, status: 400, error: 'Unknown job' };

  const cooldowns = getCooldowns(playerId);
  const waiting = remainingCooldown(cooldowns, player, jobType);
  if (waiting > 0) {
    return {
      ok: false,
      status: 429,
      error: `${job.label} is resting for another ${(waiting / 1000).toFixed(1)}s`,
      msRemaining: waiting,
    };
  }

  if (job.costs) {
    const paid = applyResourceDelta(player.faction, negate(job.costs));
    if (!paid.ok) {
      return {
        ok: false,
        status: 400,
        error: `Not enough ${Object.keys(job.costs)[0]} to smith`,
        shortfall: paid.shortfall,
      };
    }
  }

  const yields = effectiveYields(player, jobType);
  const gained = applyResourceDelta(player.faction, yields);
  if (!gained.ok) {
    if (job.costs) applyResourceDelta(player.faction, job.costs); // refund on failure
    return { ok: false, status: 500, error: 'Resource update failed' };
  }

  markJobUsed(playerId, jobType);
  const resources = getResources(player.faction);
  broadcastFaction(player.faction, 'resources:update', { faction: player.faction, resources });

  return {
    ok: true,
    status: 200,
    job: { id: job.id, label: job.label, yields, costs: job.costs || null },
    resources,
    cooldowns: cooldownMap(player),
    jobTimers: Object.fromEntries(
      Object.keys(JOBS).map((j) => [j, effectiveCooldownMs(player.faction, j)])
    ),
  };
}
