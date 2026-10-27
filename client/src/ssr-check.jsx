// SSR smoke test: render every redesigned panel with real data from the running
// game server, so JSX/logic errors surface without a browser. Delete after use.
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import App from './App.jsx';
import Header from './components/Header.jsx';
import JoinScreen from './components/JoinScreen.jsx';
import JobsPanel from './components/JobsPanel.jsx';
import ResourcesPanel from './components/ResourcesPanel.jsx';
import BuildingsPanel from './components/BuildingsPanel.jsx';
import MarketPanel from './components/MarketPanel.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import WorldStatusPanel from './components/WorldStatusPanel.jsx';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// Real dashboard payload, captured from the running server by
// scripts/capture-state.mjs, so every panel is exercised with genuine shapes.
const s = JSON.parse(fs.readFileSync(new URL('../.render-check-state.json', import.meta.url), 'utf8')).state;
const faction = s.factions.find((f) => f.id === s.player.faction);

const cooldownFor = (id) => (id === 'mine' ? 900 : 0);
const now = Date.now();

// One fake wagon per status so the in-transit / delivered / raided markup all run.
const caravans = [
  ...s.caravans,
  {
    id: 'a', sender: 'Ironhelm', receiver: 'Greenleaf', cargoResource: 'wood', cargoAmount: 30,
    askResource: 'iron', askAmount: 10, value: 60, status: 'traveling', startedAt: now - 10000,
    arrivesAt: now + 35000, remainingMs: 35000, totalMs: 45000, initiator: 'Ssr', note: null, mine: true,
  },
  {
    id: 'b', sender: 'Greenleaf', receiver: 'Ironhelm', cargoResource: 'food', cargoAmount: 20,
    askResource: 'wood', askAmount: 10, value: 20, status: 'delivered', startedAt: now - 60000,
    arrivesAt: now - 15000, remainingMs: 0, totalMs: 45000, initiator: 'Grover',
    note: 'Sold 20 food for 10 wood', mine: false,
  },
  {
    id: 'c', sender: 'Ironhelm', receiver: 'Sunfire', cargoResource: 'iron', cargoAmount: 10,
    askResource: 'food', askAmount: 30, value: 30, status: 'raided', startedAt: now - 90000,
    arrivesAt: now - 45000, remainingMs: 0, totalMs: 45000, initiator: 'Ssr',
    note: 'Ambushed on the Ironhelm-Sunfire road', mine: true,
  },
];

const render = (name, el) => {
  const html = renderToString(el);
  console.log(`  ok  ${name.padEnd(22)} ${String(html.length).padStart(6)} chars`);
  return html;
};

let failures = 0;
// React's server renderer splits adjacent text runs with <!-- --> markers, so
// normalise them out before matching on copy.
const expect = (name, hay, needle) => {
  const flat = hay.replace(/<!-- -->/g, '');
  const found = flat.includes(needle);
  if (found) console.log(`  ok  contains ${needle}`);
  else {
    failures += 1;
    console.log(`FAIL  missing ${needle}`);
  }
};

const header = render('Header', <Header faction={faction} presence={s.presence} onLeave={() => {}} flash="War declared on Sunfire" />);
expect('header', header, 'KINGDOMS.EXE');
expect('header', header, 'titlebar');
expect('header', header, 'blink');
expect('header', header, 'marquee-track');

const jobs = render('JobsPanel', <JobsPanel jobs={s.jobs} resources={s.resources} effects={s.jobEffects} timers={s.jobTimers} cooldownFor={cooldownFor} onJob={() => {}} />);
expect('jobs', jobs, 'JOBS.DAT');
expect('jobs', jobs, '[READY]');
expect('jobs', jobs, '\u2593'); // block bar for the cooling-down job

const stock = render('ResourcesPanel', <ResourcesPanel faction={faction} resources={s.resources} otherResources={s.otherResources} diplomacy={s.diplomacy} rates={s.market.rates} />);
expect('resources', stock, 'TOTAL CART VALUE');
expect('resources', stock, 'Rival Factions');

const projects = render('BuildingsPanel', <BuildingsPanel buildings={s.buildings} faction={faction} onBuild={() => {}} now={now} />);
expect('buildings', projects, 'PROJECTS.MDB');
expect('buildings', projects, '\u2591'); // empty level pips

// Both market branches must render: one partner with a live deal, one at war.
const mkPartner = (name, dealActive, state) => ({
  faction: name,
  stock: { iron: 60, food: 20, wood: 0, tools: 3 },
  state,
  dealActive,
  expiresAt: dealActive ? now + 3_600_000 : null,
  remainingMs: dealActive ? 3_600_000 : 0,
  roadRisk: dealActive ? 0.03 : 0.28,
  roadLabel: dealActive ? 'roads are open' : 'war on the road: Ironhelm-Sunfire',
  travelingOut: 1,
  travelingIn: 1,
  delivered: 3,
  raided: 1,
  volume: 180,
  canSend: dealActive,
  suggestions: dealActive ? [{ cargo: 'food', cargoAmount: 20, ask: 'wood', askAmount: 10, value: 20 }] : [],
});
const marketFix = {
  ...s.market,
  inFlight: 1,
  partners: [mkPartner('Greenleaf', true, 'trade'), mkPartner('Sunfire', false, 'war')],
};

const market = render('MarketPanel', <MarketPanel market={marketFix} caravans={caravans} faction={faction} onSend={async () => {}} now={now} />);
expect('market', market, 'CARAVAN.SYS');
expect('market', market, 'Send wagon');
expect('market', market, 'ON ROAD');
expect('market', market, 'RAIDED');
expect('market', market, 'the road is shut');
expect('market', market, 'sell 20 food for 10 wood');

const chat = render('ChatPanel', <ChatPanel faction={faction} messages={s.messages} onSend={() => {}} scanInMs={12000} />);
expect('chat', chat, 'LOG.TXT');
expect('chat', chat, 'NEW!');

const world = render('WorldStatusPanel', <WorldStatusPanel diplomacy={s.diplomacy} sentiments={s.sentiments} aiLog={s.aiLog} caravans={caravans} scan={s.scan} nextScanInMs={12000} onScanNow={() => {}} onSeed={async () => {}} myFaction={faction} />);
expect('world', world, 'COUNCIL.LOG');
expect('world', world, 'Council Readings');
expect('world', world, 'Aggression');
expect('world', world, 'Read council now');

const joinHtml = render('JoinScreen', <JoinScreen factions={s.factions} onJoin={() => {}} status="idle" error="That name is already taken" />);
expect('join', joinHtml, 'KINGDOMS');
expect('join', joinHtml, 'type="radio"');
expect('join', joinHtml, 'Best viewed at 800x600');
expect('join', joinHtml, 'That name is already taken');

const app = render('App (no player)', <App />);
expect('app', app, 'Sign In');

console.log(`\n${failures === 0 ? 'ALL RETRO RENDER CHECKS PASSED' : `${failures} RENDER CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
