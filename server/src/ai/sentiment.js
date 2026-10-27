import { WORLD, FACTION_IDS } from '../config.js';
import { getMessages, countMessages } from '../db/queries.js';
import { allFactionStrength } from '../services/buildings.js';
import { routeContextForPrompt, tradePeaceBonus } from '../services/caravans.js';

// ---------------------------------------------------------------------------
// Rule-based fallback lexicon. Used when the LLM is unreachable or replies with
// something that is not JSON. Keeps the game playable offline.
//
// Matching is whole-word on purpose. Plain substring matching counted "soldiers"
// as "soldier" and "warn" as "war", which maxed every faction at 10/10 and made
// the council declare war for no reason.
// ---------------------------------------------------------------------------

const LEXICON = {
  aggression: [
    'war', 'warfare', 'attack', 'strike', 'kill', 'slay', 'raid', 'burn', 'destroy',
    'enemy', 'invade', 'fight', 'weapon', 'weapons', 'conquer', 'revenge', 'crush',
    'siege', 'army', 'march on', 'no mercy', 'kill them', 'attack them', 'steal',
    'stole', 'plunder', 'sack', 'hate', 'poison', 'ambush', 'burn them',
  ],
  cooperation: [
    'trade', 'trading', 'help', 'friend', 'friends', 'friendship', 'ally', 'alliance',
    'peace', 'share', 'gift', 'deal', 'cooperate', 'together', 'partner', 'supply',
    'negotiate', 'diplomat', 'merchant', 'merchants', 'barter', 'treaty', 'sell to',
    'buy from', 'make peace', 'open a trade route',
  ],
  fear: [
    'afraid', 'scared', 'defend', 'defense', 'wall', 'walls', 'worried', 'terrified',
    'danger', 'hide', 'fortify', 'nervous', 'panic', 'refugee', 'starving', 'starved',
    'outnumbered', 'helpless', 'retreat', 'shelter', 'dread', 'flee', 'we are weak',
    'not enough', 'running out', 'make peace',
  ],
};

function escapeRe(word) {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matcherFor(words) {
  return '(^|[^a-z0-9])(' + words.map(escapeRe).join('|') + ')([^a-z0-9]|$)';
}

const SOURCES = {
  aggression: matcherFor(LEXICON.aggression),
  cooperation: matcherFor(LEXICON.cooperation),
  fear: matcherFor(LEXICON.fear),
};

function countHits(text, key) {
  const re = new RegExp(SOURCES[key], 'gi');
  let hits = 0;
  while (re.exec(text) !== null) hits += 1;
  return hits;
}

/**
 * Convert raw hit counts into a 0-10 mood score.
 * Short chats are deliberately dampened: two warlike lines out of three should
 * not start a war, but a sustained drumbeat of them should.
 */
function densityScore(hits, sampleSize) {
  if (!sampleSize || !hits) return 0;
  const intensity = hits / Math.max(sampleSize, 6);
  let score = Math.round(intensity * 10 * 1.5);
  if (sampleSize < 6) score = Math.min(score, 9);
  if (sampleSize < 4) score = Math.min(score, 7);
  if (sampleSize < 2) score = Math.min(score, 4);
  return Math.max(0, Math.min(10, score));
}

function detectTarget(faction, text) {
  const others = FACTION_IDS.filter((f) => f !== faction);
  let best = null;
  let bestHits = 0;
  for (const name of others) {
    const re = new RegExp('(^|[^a-z0-9])(' + escapeRe(name.toLowerCase()) + ')([^a-z0-9]|$)', 'gi');
    let hits = 0;
    while (re.exec(text) !== null) hits += 1;
    if (hits > bestHits) {
      bestHits = hits;
      best = name;
    }
  }
  return bestHits >= 2 ? best : null; // needs to be named at least twice
}

export function ruleBasedSentiment(faction, messages) {
  const text = messages.map((m) => m.content.toLowerCase()).join('\n');
  const sample = messages.length;
  const aggression = densityScore(countHits(text, 'aggression'), sample);
  // Commerce calms people down: a faction shipping caravans needs more goading.
  const cooperation = Math.min(10, densityScore(countHits(text, 'cooperation'), sample) + tradePeaceBonus(faction));
  const fear = densityScore(countHits(text, 'fear'), sample);
  const target = detectTarget(faction, text);

  const top = Math.max(aggression, cooperation, fear);
  let label = 'calm and talkative';
  if (top >= 6 && aggression === top) label = 'heated and hostile';
  else if (top >= 6 && cooperation === top) label = 'eager to cooperate';
  else if (top >= 6 && fear === top) label = 'anxious on the borders';

  return {
    faction,
    aggression,
    cooperation,
    fear,
    target,
    summary:
      sample === 0
        ? `No recent chatter. The ${faction} council stays idle.`
        : `${faction} sounds ${label} across ${sample} messages${target ? `, eyes on ${target}` : ''}.`,
    source: 'rules',
  };
}

// ---------------------------------------------------------------------------
// llama.cpp prompt + call
// ---------------------------------------------------------------------------

export function buildPrompt(faction, messages) {
  const lines = messages.map((m) => `${m.username}: ${m.content}`).join('\n');
  const others = FACTION_IDS.filter((f) => f !== faction);
  const world = allFactionStrength()
    .map(
      (x) =>
        `- ${x.faction}: iron ${x.iron}, food ${x.food}, wood ${x.wood}, tools ${x.tools}, defense ${x.defense} (walls ${x.buildings.wall}, mines ${x.buildings.mine}, farms ${x.buildings.farm}, markets ${x.buildings.market}) | caravans ${routeContextForPrompt(x.faction)}`
    )
    .join('\n');

  return `You are the sentiment analyst for the ${faction} faction in a multiplayer kingdom game.
Read the faction chat log and describe the collective mood of ${faction}.

Rules:
- Score aggression, cooperation and fear as integers from 0 to 10.
- 0-3 barely present, 4-6 noticeable, 7-10 dominant and repeated.
- target_faction is the faction the chat talks about most. It must be exactly one of: ${others.join(', ')}. Use "none" if no faction is discussed.
- summary is one in-character sentence, 20 words maximum.
- Reply with ONLY one JSON object. No prose, no markdown fences.
- Judge strength realistically: a faction with high defense and many tools is hard to attack.
- Factions that run many caravans together profit from peace, so heavy trade lifts cooperation and lowers aggression.

World state:
${world}

Chat log:
${lines}

JSON shape:
{"aggression": 0, "cooperation": 0, "fear": 0, "target_faction": "${others[0]}", "summary": "..."}`;
}

function extractJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '');
  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < cleaned.length; i += 1) {
    if (cleaned[i] === '{') depth += 1;
    else if (cleaned[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function callLlama(prompt) {
  const base = WORLD.llamaUrl.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORLD.llamaTimeoutMs);

  try {
    const res = await fetch(`${base}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: WORLD.llamaModel,
        prompt,
        temperature: 0.1,
        n_predict: 220,
        max_tokens: 220,
        stop: ['\n\n', '```'],
      }),
    });
    if (!res.ok) throw new Error(`llama.cpp responded HTTP ${res.status}`);
    const data = await res.json();
    const content = data.content ?? data.choices?.[0]?.text ?? data.response ?? '';
    return extractJson(String(content).trim());
  } finally {
    clearTimeout(timer);
  }
}

function chatText(faction, messages) {
  return messages.map((m) => m.content.toLowerCase()).join('\n');
}

/**
 * Analyse one faction's recent chat. Tries the LLM first, falls back to rules.
 * Always resolves - never throws.
 */
export async function analyzeFaction(faction) {
  const messages = countMessages(faction);

  if (!WORLD.llamaUrl || messages.length === 0) {
    return ruleBasedSentiment(faction, messages);
  }

  try {
    const parsed = await callLlama(buildPrompt(faction, messages));
    if (!parsed) throw new Error('no JSON object in response');

    const ruleGuess = ruleBasedSentiment(faction, messages);
    const namedTarget = FACTION_IDS.includes(parsed.target_faction) ? parsed.target_faction : null;

    return {
      faction,
      aggression: parsed.aggression ?? ruleGuess.aggression,
      cooperation: parsed.cooperation ?? ruleGuess.cooperation,
      fear: parsed.fear ?? ruleGuess.fear,
      target: namedTarget || detectTarget(faction, chatText(faction, messages)) || ruleGuess.target,
      summary: parsed.summary || ruleGuess.summary,
      source: 'llama',
    };
  } catch (err) {
    console.warn(`[ai] llama failed for ${faction}: ${err.message} (using rule fallback)`);
    return ruleBasedSentiment(faction, messages);
  }
}

export function peekChat(faction) {
  return getMessages(faction, WORLD.chatScanDepth);
}
