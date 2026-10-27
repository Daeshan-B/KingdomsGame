// Deterministic unit harness for the caravan service: it runs the real modules
// against a throwaway database with Math.random pinned, so both delivery and
// ambushing are reproducible. Run with: npm run check:caravans
import fs from 'node:fs';

// Must be set before ANY server module is imported, because config.js reads the
// environment at import time and database.js opens the file immediately. Hence
// every server import below is a dynamic import.
process.env.DATABASE_PATH = '/tmp/kg-unit.sqlite';
process.env.LLAMA_URL = '';
process.env.CARAVAN_TRAVEL_MS = '60000';
process.env.CARAVAN_MAX_IN_FLIGHT = '2';

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(`/tmp/kg-unit.sqlite${suffix}`, { force: true });
}

const cfg = await import('../src/config.js');
const q = await import('../src/db/queries.js');
const car = await import('../src/services/caravans.js');

const RESOURCES = cfg.RESOURCES;
const RATES = cfg.MARKET_RATES;
let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.log(`FAIL  ${name} ${extra}`);
  }
}
function setStock(faction, next) {
  const cur = q.getResources(faction);
  const deltas = {};
  for (const r of RESOURCES) deltas[r] = (next[r] ?? 0) - (cur[r] ?? 0);
  q.applyResourceDelta(faction, deltas);
}
const stockOf = (f) => q.getResources(f);
function worldValue() {
  return q.allResources().reduce(
    (sum, r) => sum + RESOURCES.reduce((s, k) => s + (r[k] ?? 0) * RATES[k], 0),
    0
  );
}

console.log('\n== fixtures ==');
setStock('Ironhelm', { iron: 60, food: 60, wood: 60, tools: 60 });
setStock('Greenleaf', { iron: 60, food: 60, wood: 60, tools: 60 });
setStock('Sunfire', { iron: 60, food: 60, wood: 60, tools: 60 });
const iron = q.createPlayer('Wagoner', 'Ironhelm');
const green = q.createPlayer('Grover', 'Greenleaf');
check('players created', Boolean(iron.id && green.id));
check('travel time honoured from env', car.marketSnapshot('Ironhelm').travelMs === 60000);

console.log('\n== the deal gate ==');
const noDeal = car.sendCaravan(iron.id, 'Greenleaf', 'food', 20);
check('refuses without a trade deal', noDeal.ok === false && noDeal.status === 409, JSON.stringify(noDeal));
check('unknown player rejected', car.sendCaravan('ghost', 'Greenleaf', 'food', 20).status === 404);
check('trading with yourself rejected', car.sendCaravan(iron.id, 'Ironhelm', 'food', 20).status === 400);
check('unknown cargo rejected', car.sendCaravan(iron.id, 'Greenleaf', 'gold', 20).status === 400);

q.setDiplomacy('Ironhelm', 'Greenleaf', 'trade', 'unit fixture');
const market = car.marketSnapshot('Ironhelm');
const greenPartner = market.partners.find((p) => p.faction === 'Greenleaf');
check('deal opens the road', greenPartner.dealActive === true && greenPartner.canSend === true);
check('peace-time road risk is 3%', greenPartner.roadRisk === 0.03, String(greenPartner.roadRisk));
check('in-flight starts at zero', market.inFlight === 0);

console.log('\n== wagon size + affordability checks ==');
const tiny = car.sendCaravan(iron.id, 'Greenleaf', 'food', 2);
check('below minimum value refused', tiny.ok === false && /worth 10/.test(tiny.error), JSON.stringify(tiny));
const fat = car.sendCaravan(iron.id, 'Greenleaf', 'tools', 60);
check('above maximum value refused', fat.ok === false && /tops out at 240/.test(fat.error), JSON.stringify(fat));
const broke = car.sendCaravan(iron.id, 'Greenleaf', 'iron', 61);
check('cannot ship more than held', broke.ok === false && /only holds 60/.test(broke.error), JSON.stringify(broke));
const sameGoods = car.sendCaravan(iron.id, 'Greenleaf', 'food', 20, 'food');
check('shipping a good to buy the same good refused', sameGoods.ok === false && /Do not ship food/.test(sameGoods.error), JSON.stringify(sameGoods));

setStock('Greenleaf', { iron: 60, food: 60, wood: 60, tools: 3 });
const cannotPay = car.sendCaravan(iron.id, 'Greenleaf', 'food', 60, 'tools');
check('partner must hold the payment', cannotPay.ok === false && /holds 3 tools/.test(cannotPay.error), JSON.stringify(cannotPay));

console.log('\n== a clean round trip ==');
Math.random = () => 0.999; // never below road risk, so wagons always arrive
setStock('Greenleaf', { iron: 60, food: 60, wood: 60, tools: 60 });
const valueBefore = worldValue();
const sent = car.sendCaravan(iron.id, 'Greenleaf', 'food', 20, 'iron');
check('send accepted', sent.ok === true, JSON.stringify(sent));
check('cargo escrowed at once', stockOf('Ironhelm').food === 40, JSON.stringify(stockOf('Ironhelm')));
check('payment waits for arrival', stockOf('Greenleaf').iron === 60, JSON.stringify(stockOf('Greenleaf')));
check('wagon listed as traveling', sent.caravan?.status === 'traveling', JSON.stringify(sent.caravan));
check('escrow temporarily parks the goods', worldValue() === valueBefore - 20, `${worldValue()} vs ${valueBefore - 20}`);

const settled = car.settleCaravans(Date.now() + 5 * 60 * 1000);
check('one wagon settled', settled.length === 1, String(settled.length));
check('delivered', settled[0].status === 'delivered', JSON.stringify(settled[0]));
check('buyer received the cargo', stockOf('Greenleaf').food === 80, JSON.stringify(stockOf('Greenleaf')));
check('seller received the payment', stockOf('Ironhelm').iron === 66 && stockOf('Greenleaf').iron === 54,
  `${stockOf('Ironhelm').iron}/${stockOf('Greenleaf').iron}`);
check('symmetric rates mean zero value created', worldValue() === valueBefore, `${worldValue()} vs ${valueBefore}`);
const ledger = q.getRoute('Ironhelm', 'Greenleaf');
check('route ledger recorded the trip', ledger.delivered === 1 && ledger.value === 20, JSON.stringify(ledger));

console.log('\n== partial payment when the partner spends first ==');
setStock('Ironhelm', { iron: 60, food: 60, wood: 60, tools: 60 });
setStock('Greenleaf', { iron: 60, food: 60, wood: 60, tools: 60 });
const short = car.sendCaravan(iron.id, 'Greenleaf', 'food', 20, 'iron');
check('short-payment wagon accepted', short.ok === true, JSON.stringify(short));
setStock('Greenleaf', { iron: 2, food: 60, wood: 60, tools: 60 });
const settledShort = car.settleCaravans(Date.now() + 5 * 60 * 1000);
check('paid only what the partner still had', settledShort[0].ask_amount === 2, JSON.stringify(settledShort[0]));
check('seller got the 2 iron', stockOf('Ironhelm').iron === 62, JSON.stringify(stockOf('Ironhelm')));
check('buyer still received the full cargo', stockOf('Greenleaf').food === 80, JSON.stringify(stockOf('Greenleaf')));
check('note tells the player about the shortfall', /was short 4 iron of the promised 6 iron/.test(settledShort[0].note), settledShort[0].note);

console.log('\n== a totally broke partner ==');
setStock('Ironhelm', { iron: 60, food: 60, wood: 60, tools: 60 });
setStock('Greenleaf', { iron: 60, food: 60, wood: 60, tools: 60 });
const freebie = car.sendCaravan(iron.id, 'Greenleaf', 'food', 20, 'iron');
check('broke-partner wagon accepted', freebie.ok === true, JSON.stringify(freebie));
setStock('Greenleaf', { iron: 0, food: 60, wood: 60, tools: 60 });
const settledFree = car.settleCaravans(Date.now() + 5 * 60 * 1000);
check('goods still arrive when they cannot pay at all', settledFree[0].status === 'delivered' && stockOf('Greenleaf').food === 80,
  JSON.stringify({ status: settledFree[0].status, food: stockOf('Greenleaf').food }));
check('zero payment phrased honestly', /had nothing left to pay with/.test(settledFree[0].note), settledFree[0].note);
check('nothing was taken from an empty stockpile', stockOf('Ironhelm').iron === 60, JSON.stringify(stockOf('Ironhelm')));
check('a full payment reads cleanly', /Sold 20 food for 6 iron$/.test(settled[0].note), settled[0].note);

console.log('\n== in-flight cap ==');
setStock('Ironhelm', { iron: 60, food: 60, wood: 60, tools: 60 });
setStock('Greenleaf', { iron: 60, food: 60, wood: 60, tools: 60 });
const w1 = car.sendCaravan(iron.id, 'Greenleaf', 'wood', 10, 'food');
const w2 = car.sendCaravan(iron.id, 'Greenleaf', 'wood', 10, 'iron');
check('two wagons may travel', w1.ok && w2.ok, JSON.stringify([w1.error, w2.error]));
const w3 = car.sendCaravan(iron.id, 'Greenleaf', 'food', 20, 'iron');
check('third wagon hits the cap', w3.ok === false && /Already 2 wagons/.test(w3.error), JSON.stringify(w3));
check('cap counts both directions', car.marketSnapshot('Ironhelm').inFlight === 2);
car.settleCaravans(Date.now() + 5 * 60 * 1000);
check('road clears after settlement', car.marketSnapshot('Ironhelm').inFlight === 0);

console.log('\n== bandit raid on arrival ==');
Math.random = () => 0.0; // always below road risk -> the wagon is taken
setStock('Ironhelm', { iron: 60, food: 60, wood: 60, tools: 60 });
setStock('Greenleaf', { iron: 60, food: 60, wood: 60, tools: 60 });
const valueBeforeRaid = worldValue();
const doomed = car.sendCaravan(iron.id, 'Greenleaf', 'iron', 10, 'wood'); // 30 value
check('raid wagon accepted', doomed.ok === true, JSON.stringify(doomed));
const raided = car.settleCaravans(Date.now() + 5 * 60 * 1000);
check('wagon raided', raided[0]?.status === 'raided', JSON.stringify(raided[0]));
check('loss booked at cargo value', raided[0]?.loss === 30, String(raided[0]?.loss));
check('cargo is not refunded to the sender', stockOf('Ironhelm').iron === 50, JSON.stringify(stockOf('Ironhelm')));
check('buyer received nothing', stockOf('Greenleaf').iron === 60, JSON.stringify(stockOf('Greenleaf')));
check('raid really destroys world wealth', worldValue() === valueBeforeRaid - 30, `${worldValue()} vs ${valueBeforeRaid - 30}`);
const raidLog = q.getAiLog(20).find((r) => r.action === 'raid');
check('council log mentions the raid', Boolean(raidLog), JSON.stringify(raidLog?.detail));
check('ledger counts raids separately', q.getRoute('Ironhelm', 'Greenleaf').raided >= 1, JSON.stringify(q.getRoute('Ironhelm', 'Greenleaf')));

console.log('\n== war raises the price of the road ==');
Math.random = () => 0.999;
q.setDiplomacy('Ironhelm', 'Sunfire', 'war', 'unit fixture');
const warMarket = car.marketSnapshot('Ironhelm');
const greenWar = warMarket.partners.find((p) => p.faction === 'Greenleaf');
check('risk jumps when either side fights', Math.abs(greenWar.roadRisk - 0.28) < 1e-9, String(greenWar.roadRisk));
check('risk label names the war', /Ironhelm/.test(greenWar.roadLabel) && /Sunfire/.test(greenWar.roadLabel), greenWar.roadLabel);

console.log('\n== war closes the road mid-journey ==');
setStock('Ironhelm', { iron: 60, food: 60, wood: 60, tools: 60 });
setStock('Greenleaf', { iron: 60, food: 60, wood: 60, tools: 60 });
const convoyA = car.sendCaravan(iron.id, 'Greenleaf', 'wood', 30, 'iron'); // 60 value
const convoyB = car.sendCaravan(iron.id, 'Greenleaf', 'food', 40, 'iron'); // 40 value
check('convoy loaded', convoyA.ok && convoyB.ok, JSON.stringify([convoyA.error, convoyB.error]));
const valueBeforeWar = worldValue();
const stranded = car.warBreaksRoute('Ironhelm', 'Greenleaf');
check('both wagons lost to the embargo', stranded.length === 2, String(stranded.length));
check('wagons marked raided with a loss', stranded.every((s) => s.status === 'raided' && s.loss > 0), JSON.stringify(stranded.map((s) => s.loss)));
check('stockpiles untouched - the cargo was escrowed at loading', worldValue() === valueBeforeWar,
  `${worldValue()} vs ${valueBeforeWar}`);
check('the escrow is now gone for good', stranded.reduce((s, x) => s + Number(x.loss), 0) === 100);
const embargo = q.getAiLog(20).find((r) => r.action === 'embargo');
check('embargo logged', Boolean(embargo), JSON.stringify(embargo?.detail));
check('no wagons left on the road', car.marketSnapshot('Ironhelm').inFlight === 0);

console.log('\n== commerce feeds back into the AI ==');
q.setDiplomacy('Ironhelm', 'Greenleaf', 'trade', 'unit fixture');
for (let i = 0; i < 6; i += 1) {
  setStock('Ironhelm', { iron: 60, food: 60, wood: 60, tools: 60 });
  setStock('Greenleaf', { iron: 60, food: 60, wood: 60, tools: 60 });
  const bulk = car.sendCaravan(iron.id, 'Greenleaf', 'wood', 60, 'iron'); // 120 value -> 40 iron
  if (!bulk.ok) throw new Error(`bulk send failed: ${bulk.error}`);
  car.settleCaravans(Date.now() + 5 * 60 * 1000);
}
const fatLedger = q.getRoute('Ironhelm', 'Greenleaf');
check('ledger grew past 300 value', fatLedger.value > 300, JSON.stringify(fatLedger));
check('trade peace bonus unlocked', car.tradePeaceBonus('Ironhelm') >= 1, String(car.tradePeaceBonus('Ironhelm')));
check('route context readable for the prompt', /Greenleaf/.test(car.routeContextForPrompt('Ironhelm')), car.routeContextForPrompt('Ironhelm'));

const sentiment = await import('../src/ai/sentiment.js');
const friendly = [
  { username: 'Bram', content: 'A deal with Greenleaf would help us both.' },
  { username: 'Odla', content: 'Let us send merchants to Greenleaf, not soldiers.' },
];
const withBonus = sentiment.ruleBasedSentiment('Ironhelm', friendly);
const withoutBonus = sentiment.ruleBasedSentiment('Sunfire', friendly);
check('untrading faction has no bonus', car.tradePeaceBonus('Sunfire') === 0);
check('cooperation lifted by commerce', withBonus.cooperation > withoutBonus.cooperation,
  `Ironhelm ${withBonus.cooperation} vs Sunfire ${withoutBonus.cooperation}`);
const prompt = sentiment.buildPrompt('Ironhelm', friendly);
check('llama prompt carries the route ledger', /caravans/.test(prompt) && /Greenleaf/.test(prompt));

console.log('\n== the council can strand a convoy ==');
const scanMod = await import('../src/ai/scan.js');
q.setDiplomacy('Ironhelm', 'Greenleaf', 'trade', 'unit fixture');
setStock('Ironhelm', { iron: 60, food: 60, wood: 60, tools: 60 });
setStock('Greenleaf', { iron: 60, food: 60, wood: 60, tools: 60 });
const ridingHigh = car.sendCaravan(iron.id, 'Greenleaf', 'wood', 20, 'food');
check('wagon ready for the road', ridingHigh.ok === true, JSON.stringify(ridingHigh));
for (const line of [
  'The Greenleaf insulted us at the border market. Burn their camps.',
  'I say we march on the Greenleaf tonight, no warning.',
  'Enough talk - sharpen every weapon and aim it at Greenleaf.',
  'The Greenleaf stole our iron. This is war, brothers.',
  'Kill their scouts, take the Greenleaf mines.',
]) {
  q.addScriptedMessage({ faction: 'Ironhelm', username: 'Citizen', content: line, offsetMs: 60_000 });
}
const scanResult = await scanMod.runScan({ manual: true });
check('aggression produced a war decision', (scanResult.changes || []).some((c) => c.decision.action === 'war'),
  JSON.stringify((scanResult.changes || []).map((c) => c.decision.action)));
check('diplomacy flipped to war', q.getDiplomacy('Ironhelm', 'Greenleaf')?.state === 'war',
  q.getDiplomacy('Ironhelm', 'Greenleaf')?.state);
const newest = q.getCaravansFor('Ironhelm', 5)[0];
check('the declaration stranded the convoy', newest?.status === 'raided', JSON.stringify(newest?.status));
check('deal is gone with the war', car.marketSnapshot('Ironhelm').partners.find((p) => p.faction === 'Greenleaf').dealActive === false);

console.log('\n== reset clears trade ==');
q.resetWorld();
check('no caravans survive a world reset', q.getRecentCaravans(10).length === 0);
check('no ledger survives a world reset', q.getAllRoutes().length === 0);

console.log(`\n${failures === 0 ? 'ALL CARAVAN CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);



