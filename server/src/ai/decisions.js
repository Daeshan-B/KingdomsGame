import { FACTION_IDS } from '../config.js';
import { getDiplomacy, setDiplomacy, addAiLog } from '../db/queries.js';

const THRESHOLD = 7;

function otherFactions(faction) {
  return FACTION_IDS.filter((f) => f !== faction);
}

/** The sentiment row stores the target as target_faction. Accept either name. */
function targetOf(sentiment) {
  const t = sentiment.target || sentiment.target_faction;
  return FACTION_IDS.includes(t) && t !== sentiment.faction ? t : null;
}

function factionAtWarWith(faction) {
  return otherFactions(faction).find((f) => getDiplomacy(faction, f)?.state === 'war') || null;
}

/**
 * Turn one sentiment reading into at most one council decision.
 * Priority: fear (de-escalation) > aggression (war) > cooperation (trade).
 * One scan = one headline action, which keeps the world readable for players.
 * A target is required - the council never declares war on a random neighbour.
 */
export function decideFor(sentiment) {
  const faction = sentiment.faction;
  const aggression = Number(sentiment.aggression) || 0;
  const cooperation = Number(sentiment.cooperation) || 0;
  const fear = Number(sentiment.fear) || 0;
  const target = targetOf(sentiment);

  // 1. Fear first: a scared faction makes peace with whoever it is fighting.
  if (fear >= THRESHOLD) {
    const enemy = factionAtWarWith(faction) || target;
    if (enemy && getDiplomacy(faction, enemy)?.state === 'war') {
      return {
        action: 'peace',
        target: enemy,
        reason: `${faction} is frightened (fear ${fear}/10) and signs a peace treaty with ${enemy}`,
      };
    }
  }

  // 2. Aggression: declare war, breaking any trade deal with that faction.
  if (aggression >= THRESHOLD && target) {
    const pair = getDiplomacy(faction, target);
    if (pair?.state !== 'war') {
      return {
        action: 'war',
        target,
        reason: `${faction} is emboldened (aggression ${aggression}/10) and declares war on ${target}`,
      };
    }
  }

  // 3. Cooperation: sign a trade deal (never while at war).
  if (cooperation >= THRESHOLD && target) {
    const pair = getDiplomacy(faction, target);
    if (pair?.state === 'neutral') {
      return {
        action: 'trade',
        target,
        reason: `${faction} is friendly (cooperation ${cooperation}/10) and signs a trade deal with ${target}`,
      };
    }
  }

  return {
    action: 'none',
    target: null,
    reason: `${faction} mood A${aggression}/C${cooperation}/F${fear}: nothing worth acting on`,
  };
}

/** Apply a decision to the diplomacy table and the visible AI log. */
export function applyDecision(decision, sentiment) {
  if (decision.action === 'none') return { changed: false, pair: null };

  // "peace" is a transition, not a stored state: a treaty settles the pair back
  // to neutral so the diplomacy table only ever holds neutral | war | trade.
  const stateFor = { war: 'war', trade: 'trade', peace: 'neutral' }[decision.action];
  if (!stateFor) return { changed: false, pair: null };

  const pair = setDiplomacy(sentiment.faction, decision.target, stateFor, decision.reason);
  addAiLog(sentiment.faction, decision.action, decision.reason);
  return { changed: true, pair };
}
