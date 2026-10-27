import crypto from 'node:crypto';
import {
  RESOURCES,
  FACTION_IDS,
  MARKET_RATES,
  CARAVAN_RULES,
  WORLD,
  goodsValue,
  amountForValue,
} from '../config.js';
import {
  getPlayer,
  getResources,
  applyResourceDelta,
  getAllDiplomacy,
  getDiplomacy,
  getCaravansFor,
  getDueCaravans,
  getPairCaravans,
  countTravelingFor,
  createCaravan,
  setCaravanOutcome,
  getRoute,
  getAllRoutes,
  addRouteTraffic,
  addAiLog,
} from '../db/queries.js';
import { broadcastFaction, broadcastAll } from '../socket/hub.js';

const now = () => Date.now();
const id = () => crypto.randomUUID();

export function fmtGoods(resource, amount) {
  return `${amount} ${resource}`;
}

/**
 * How dangerous the road is right now, as { risk: 0..1, wars: [...] }.
 * Peaceful world = a token bandit chance. Any war touching either partner puts
 * soldiers on the road and makes the run genuinely scary, so the council going
 * to war is felt in the stockpile even though there are no battles yet.
 */
export function roadRisk(sender, receiver) {
  const wars = getAllDiplomacy()
    .filter(
      (p) =>
        p.state === 'war' &&
        [p.faction_a, p.faction_b].some((f) => f === sender || f === receiver)
    )
    .map((p) => `${p.faction_a}\u2013${p.faction_b}`);

  const risk = Math.min(
    0.6,
    CARAVAN_RULES.baseRisk + (wars.length ? CARAVAN_RULES.warRisk * Math.min(wars.length, 2) : 0)
  );
  return {
    risk,
    wars,
    label: wars.length ? `war on the road: ${wars.join(', ')}` : 'roads are open',
  };
}

/** Is there a live (unexpired) trade deal between these two? */
function activeDeal(a, b) {
  const pair = getDiplomacy(a, b);
  if (pair?.state !== 'trade') return null;
  const expiresAt = pair.expires_at ? Number(pair.expires_at) : null;
  if (expiresAt && expiresAt <= now()) return null;
  return { ...pair, expiresAt };
}

/**
 * Which goods we should ask for in return: the resource our own faction is
 * short of that they can actually afford to sell. Rates are symmetric, so a
 * round trip never creates value - this only converts surplus into a bottleneck.
 */
export function chooseAsk(cargoResource, value, ourStock, theirStock) {
  const options = RESOURCES.filter((r) => r !== cargoResource)
    .map((resource) => ({ resource, need: amountForValue(resource, value), have: theirStock[resource] ?? 0 }))
    .filter((o) => o.need > 0 && o.have >= o.need)
    .sort(
      (a, b) =>
        (ourStock[a.resource] ?? 0) - (ourStock[b.resource] ?? 0) || b.have - a.have
    );
  return options[0] || null;
}

/**
 * Load a wagon. The faction pays for the cargo up front (it is escrowed for the
 * journey), the return payment is taken from the partner when it arrives.
 * Fails loudly with a player-readable reason - never half-applies a trade.
 */
export function sendCaravan(playerId, receiver, cargoResource, cargoAmount, askResource = null) {
  const player = getPlayer(playerId);
  if (!player) return { ok: false, status: 404, error: 'Unknown player. Re-join the world.' };
  const sender = player.faction;

  if (!FACTION_IDS.includes(receiver) || receiver === sender) {
    return { ok: false, status: 400, error: 'Pick a different faction to trade with' };
  }
  if (!RESOURCES.includes(cargoResource)) {
    return { ok: false, status: 400, error: 'Unknown cargo' };
  }

  settleCaravans();

  if (!activeDeal(sender, receiver)) {
    return {
      ok: false,
      status: 409,
      error: `No trade deal with ${receiver}. The AI council signs one when both chats stay friendly.`,
    };
  }

  const amount = Math.floor(Number(cargoAmount));
  if (!Number.isFinite(amount) || amount < 1) {
    return { ok: false, status: 400, error: 'Say how much to load' };
  }

  const stock = getResources(sender);
  if ((stock[cargoResource] ?? 0) < amount) {
    return {
      ok: false,
      status: 400,
      error: `The ${sender} stockpile only holds ${stock[cargoResource] ?? 0} ${cargoResource}`,
    };
  }

  const value = goodsValue(cargoResource, amount);
  if (value < CARAVAN_RULES.minValue) {
    return {
      ok: false,
      status: 400,
      error: `A wagon must be worth ${CARAVAN_RULES.minValue} - ${fmtGoods(cargoResource, amount)} is only ${value}`,
    };
  }
  if (value > CARAVAN_RULES.maxValue) {
    return {
      ok: false,
      status: 400,
      error: `One wagon tops out at ${CARAVAN_RULES.maxValue} value - load at most ${amountForValue(cargoResource, CARAVAN_RULES.maxValue)} ${cargoResource}`,
    };
  }

  if (countTravelingFor(sender) >= WORLD.caravanMaxInFlight) {
    return {
      ok: false,
      status: 409,
      error: `Already ${WORLD.caravanMaxInFlight} wagons on the road for ${sender} - wait for one to arrive`,
    };
  }

  const theirs = getResources(receiver);
  let ask;
  if (askResource && askResource !== 'auto') {
    if (!RESOURCES.includes(askResource)) return { ok: false, status: 400, error: 'Unknown payment' };
    if (askResource === cargoResource) {
      return { ok: false, status: 400, error: `Do not ship ${cargoResource} just to buy ${cargoResource} back` };
    }
    const need = amountForValue(askResource, value);
    if (need < 1) {
      return { ok: false, status: 400, error: `${value} value does not buy a single ${askResource}` };
    }
    if ((theirs[askResource] ?? 0) < need) {
      return {
        ok: false,
        status: 400,
        error: `${receiver} only holds ${theirs[askResource] ?? 0} ${askResource}, the wagon needs ${need} to pay for itself`,
      };
    }
    ask = { resource: askResource, need };
  } else {
    ask = chooseAsk(cargoResource, value, stock, theirs);
    if (!ask) {
      return {
        ok: false,
        status: 400,
        error: `${receiver} cannot pay for ${amount} ${cargoResource} with anything it has - ask them to stockpile a surplus`,
      };
    }
  }

  // Escrow: the cargo leaves our stockpile the moment the wheels turn.
  const loaded = applyResourceDelta(sender, { [cargoResource]: -amount });
  if (!loaded.ok) {
    return { ok: false, status: 400, error: `Not enough ${cargoResource} to load the wagon` };
  }

  const t = now();
  const { risk, label } = roadRisk(sender, receiver);
  const row = createCaravan({
    id: id(),
    sender,
    receiver,
    cargo_resource: cargoResource,
    cargo_amount: amount,
    ask_resource: ask.resource,
    ask_amount: ask.need,
    value,
    status: 'traveling',
    started_at: t,
    arrives_at: t + WORLD.caravanTravelMs,
    risk,
    initiator: player.username,
    note: `${fmtGoods(cargoResource, amount)} for ${fmtGoods(ask.resource, ask.need)} - ${label}`,
  });

  announce(row, 'sent');
  broadcastFaction(sender, 'resources:update', { faction: sender, resources: getResources(sender) });

  return {
    ok: true,
    status: 200,
    caravan: caravanView(sender, 1).find((c) => c.id === row.id) || null,
    resources: getResources(sender),
    caravans: caravanView(sender),
    market: marketSnapshot(sender),
  };
}

/** Both faction rooms hear about a wagon; everyone else refreshes their counts. */
function announce(caravan, event) {
  const payload = { event, caravan: publicCaravan(caravan) };
  broadcastFaction(caravan.sender, 'caravan:update', payload);
  broadcastFaction(caravan.receiver, 'caravan:update', payload);
  broadcastAll('caravans:refresh', { at: now() });
}

/** camelCase row for the client - the wire never leaks snake_case. */
export function publicCaravan(row) {
  const traveling = row.status === 'traveling';
  const startedAt = Number(row.started_at);
  const arrivesAt = Number(row.arrives_at);
  return {
    id: row.id,
    sender: row.sender,
    receiver: row.receiver,
    cargoResource: row.cargo_resource,
    cargoAmount: Number(row.cargo_amount),
    askResource: row.ask_resource,
    askAmount: Number(row.ask_amount),
    value: Number(row.value),
    status: row.status,
    startedAt,
    arrivesAt,
    settledAt: row.settled_at ? Number(row.settled_at) : null,
    remainingMs: traveling ? Math.max(0, arrivesAt - now()) : 0,
    totalMs: Math.max(1, arrivesAt - startedAt),
    risk: row.risk ?? null,
    loss: row.loss ?? null,
    initiator: row.initiator || null,
    note: row.note || null,
  };
}

/** Latest wagons touching this faction, in either direction. */
export function caravanView(faction, limit = 12) {
  return getCaravansFor(faction, limit).map((row) => ({
    ...publicCaravan(row),
    mine: row.sender === faction,
  }));
}

/**
 * Settle wagons that have reached the end of their timer. Runs on the same 2s
 * ticker as construction, so a caravan lands even with nobody watching.
 */
export function settleCaravans(atMs = now()) {
  const settled = [];
  for (const row of getDueCaravans(atMs)) settled.push(settleOne(row));
  return settled;
}

function settleOne(row) {
  const { risk, wars, label } = roadRisk(row.sender, row.receiver);

  // Ambushed: the cargo was already escrowed at loading, so losing it hurts.
  if (Math.random() < risk) {
    const outcome = setCaravanOutcome({
      id: row.id,
      status: 'raided',
      askAmount: 0,
      loss: row.value,
      note: `Ambushed on the ${row.sender}\u2013${row.receiver} road`,
    });
    addRouteTraffic(row.sender, row.receiver, { raided: 1 });
    addAiLog(
      row.sender,
      'raid',
      `${row.initiator || row.sender}'s wagon of ${fmtGoods(row.cargo_resource, row.cargo_amount)} never arrived - ${label}`
    );
    announce(outcome, 'raided');
    return outcome;
  }

  // They may have spent the payment while we travelled, so pay what they can.
  const theirs = getResources(row.receiver);
  let payment = Math.min(Number(row.ask_amount), theirs[row.ask_resource] ?? 0);
  if (!(payment > 0)) payment = 0;

  let moved = applyResourceDelta(row.receiver, {
    [row.cargo_resource]: Number(row.cargo_amount),
    [row.ask_resource]: -payment,
  });
  if (!moved.ok) {
    payment = 0;
    moved = applyResourceDelta(row.receiver, { [row.cargo_resource]: Number(row.cargo_amount) });
  }
  if (payment > 0) applyResourceDelta(row.sender, { [row.ask_resource]: payment });

  const promised = Number(row.ask_amount);
  const sold = `Sold ${fmtGoods(row.cargo_resource, row.cargo_amount)} for ${fmtGoods(row.ask_resource, payment)}`;
  const note =
    payment <= 0
      ? `Delivered ${fmtGoods(row.cargo_resource, row.cargo_amount)}, but ${row.receiver} had nothing left to pay with`
      : payment < promised
        ? `${sold} - ${row.receiver} was short ${fmtGoods(row.ask_resource, promised - payment)} of the promised ${fmtGoods(row.ask_resource, promised)}`
        : sold;

  const outcome = setCaravanOutcome({
    id: row.id,
    status: 'delivered',
    askAmount: payment,
    loss: 0,
    note,
  });

  addRouteTraffic(row.sender, row.receiver, { delivered: 1, value: Number(row.value) });
  addAiLog(
    row.sender,
    'caravan',
    `${row.initiator || row.sender}: ${note}`
  );
  announce(outcome, 'delivered');

  for (const f of [row.sender, row.receiver]) {
    broadcastFaction(f, 'resources:update', { faction: f, resources: getResources(f) });
  }
  return outcome;
}

/**
 * War closes a road. Anything already travelling between the two is lost, which
 * is the cheapest possible way to make a declaration of war cost real goods.
 */
export function warBreaksRoute(a, b) {
  const hit = [];
  for (const row of getPairCaravans(a, b)) {
    const outcome = setCaravanOutcome({
      id: row.id,
      status: 'raided',
      askAmount: 0,
      loss: Number(row.value),
      note: `Caught on the road when ${a} and ${b} went to war`,
    });
    addRouteTraffic(a, b, { raided: 1 });
    announce(outcome, 'raided');
    hit.push(outcome);
  }
  if (hit.length) {
    addAiLog(a, 'embargo', `War with ${b} closed the road and stranded ${hit.length} caravan(s)`);
  }
  return hit;
}

/** Half our surplus, clamped into the wagon size limits, priced against them. */
function packWagon(cargo, ourStock) {
  const have = ourStock[cargo] ?? 0;
  if (goodsValue(cargo, have) < CARAVAN_RULES.minValue) return null;
  let amount = Math.max(1, Math.floor(have / 2));
  if (goodsValue(cargo, amount) < CARAVAN_RULES.minValue) amount = amountForValue(cargo, CARAVAN_RULES.minValue);
  if (goodsValue(cargo, amount) > CARAVAN_RULES.maxValue) amount = amountForValue(cargo, CARAVAN_RULES.maxValue);
  if (amount > have) amount = have;
  if (amount < 1 || goodsValue(cargo, amount) < CARAVAN_RULES.minValue) return null;
  return { cargo, amount, value: goodsValue(cargo, amount) };
}

/** Two one-click offers: our richest surplus, paid for in what we lack. */
function buildSuggestions(ourStock, theirStock) {
  const ranked = [...RESOURCES].sort((a, b) => goodsValue(b, theirStock[b]) - goodsValue(a, ourStock[a]));
  const offers = [];
  for (const resource of ranked) {
    const wagon = packWagon(resource, ourStock);
    if (!wagon) continue;
    const ask = chooseAsk(wagon.cargo, wagon.value, ourStock, theirStock);
    if (!ask) continue;
    offers.push({
      cargo: wagon.cargo,
      cargoAmount: wagon.amount,
      ask: ask.resource,
      askAmount: ask.need,
      value: wagon.value,
    });
    if (offers.length === 2) break;
  }
  return offers;
}

/** Everything the market panel needs about one faction's trading prospects. */
export function marketSnapshot(faction) {
  settleCaravans();
  const stock = getResources(faction);
  const inFlight = countTravelingFor(faction);
  const onRoad = getCaravansFor(faction, 50).filter((c) => c.status === 'traveling');

  const partners = FACTION_IDS.filter((f) => f !== faction).map((partner) => {
    const deal = activeDeal(faction, partner);
    const pair = getDiplomacy(faction, partner);
    const theirs = getResources(partner);
    const route = getRoute(faction, partner);
    const road = roadRisk(faction, partner);

    return {
      faction: partner,
      stock: theirs,
      state: pair?.state || 'neutral',
      dealActive: Boolean(deal),
      expiresAt: deal?.expiresAt ?? null,
      remainingMs: deal ? Math.max(0, Number(deal.expiresAt) - now()) : 0,
      roadRisk: road.risk,
      roadLabel: road.label,
      travelingOut: onRoad.filter((c) => c.sender === faction && c.receiver === partner).length,
      travelingIn: onRoad.filter((c) => c.sender === partner && c.receiver === faction).length,
      delivered: route?.delivered ?? 0,
      raided: route?.raided ?? 0,
      volume: route?.value ?? 0,
      canSend: Boolean(deal) && inFlight < WORLD.caravanMaxInFlight,
      suggestions: buildSuggestions(stock, theirs),
    };
  });

  return {
    rates: MARKET_RATES,
    minValue: CARAVAN_RULES.minValue,
    maxValue: CARAVAN_RULES.maxValue,
    travelMs: WORLD.caravanTravelMs,
    maxInFlight: WORLD.caravanMaxInFlight,
    inFlight,
    resources: stock,
    partners,
  };
}

/** Lifetime caravan record of this faction with each partner, for the AI. */
export function routeLedger(faction) {
  return getAllRoutes()
    .filter((r) => r.faction_a === faction || r.faction_b === faction)
    .map((r) => ({
      partner: r.faction_a === faction ? r.faction_b : r.faction_a,
      delivered: Number(r.delivered),
      raided: Number(r.raided),
      value: Number(r.value),
    }));
}

/**
 * Trading partners are hard to hate. Steady commerce adds a small, capped boost
 * to cooperation so a faction that is busy shipping goods needs more provocation
 * to go to war than one that never trades.
 */
export function tradePeaceBonus(faction) {
  const scores = routeLedger(faction).map((r) => Math.min(3, Math.floor(r.value / 300)));
  return scores.length ? Math.max(...scores) : 0;
}

/** One-line world fact injected into the llama.cpp prompt. */
export function routeContextForPrompt(faction) {
  const ledger = routeLedger(faction);
  if (!ledger.length) return 'no caravans have ever run';
  return ledger
    .map((r) => `with ${r.partner}: ${r.delivered} delivered, ${r.raided} raided, ${r.value} value traded`)
    .join('; ');
}
