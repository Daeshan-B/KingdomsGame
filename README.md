# Kingdoms - MVP

A persistent multiplayer world with **3 factions** that are always at odds. Players never move a
character: they click jobs (mine, farm, chop, feed cows, smith) and chat with their faction.
An **AI council** reads every faction's chat and decides wars, trade deals and peace treaties.

Read the full design in [spec.md](./spec.md).

---

## Run it

```bash
npm install     # installs root + server + client workspaces
npm run dev     # server http://localhost:3001, game http://localhost:5173
```

Open **http://localhost:5173**. Open more tabs (or another browser) to join as more players -
each tab picks its own name and faction, so you can be three factions by yourself.

The game works immediately with no LLM configured: a rule-based mood scorer reads the chat.

---

## Wire up llama.cpp (optional but recommended)

```bash
cp server/.env.example server/.env
# then edit server/.env
```

```env
LLAMA_URL=http://127.0.0.1:8080
LLAMA_MODEL=local
AI_SCAN_INTERVAL_MS=300000
CARAVAN_TRAVEL_MS=45000
CARAVAN_MAX_IN_FLIGHT=2
```

Start llama.cpp with its HTTP server (it must expose `POST /completion`):

```bash
llama-server -hf ggml-org/gemma-3-4b-it-GGUF --port 8080
```

Restart the game server - the boot log will say which AI backend is live:

```
AI scan  every 300s  |  http://127.0.0.1:8080
```

If the LLM times out or answers with prose instead of JSON, the scan silently falls back to the
rule scorer and logs why. The sentiment panel shows `llama` or `rules` per reading.

For faster experiments set `AI_SCAN_INTERVAL_MS=30000` (30s) so you see the council act sooner.

---

## The loop in 60 seconds

1. Join as a faction, pick **Mine** - your faction's shared iron stockpile goes up for everyone.
2. Spend your surplus on a project (bottom-left panel) - a Mine Shaft level 1 doubles
   your iron per shift, a Market makes every job faster.
3. Type something hostile in faction chat, mentioning another faction by name at least twice.
4. Hit **read council now** (bottom right) or wait for the timer.
5. If aggression crosses 7 the AI **declares war**; friendly talk crosses 7 and it signs a
   **trade deal** (expires in 24h); fear crosses 7 during a war and it makes **peace**.
6. With a deal signed, load a **caravan** - sell your surplus wood for their iron, it travels for 45s and
   the goods actually change hands.
7. Every connected player sees the change instantly.

Short bursts of chat are deliberately dampened - one angry line will not start a war, a sustained
drumbeat will.

---

## Layout

```
server/src/
  config.js        factions, jobs, resources, market rates, balance numbers
  index.js         Express + Socket.io bootstrap
  db/              SQLite (better-sqlite3) schema + all queries
  ai/sentiment.js  llama.cpp call + rule-based fallback
  ai/decisions.js  mood scores -> war / trade / peace
  ai/scan.js       the 5-minute scheduler
  services/jobs.js cooldowns + resource transactions
  services/buildings.js projects, costs, timers, yield + cooldown bonuses
  services/caravans.js market prices, wagon escrow, travel timers, raids, road risk
  routes/          REST endpoints (game, world, dev)
client/src/
  hooks/useGame.js all game state + realtime wiring
  components/      Win95 (shared chrome), JoinScreen, Header, ResourcesPanel, JobsPanel,
                   BuildingsPanel, MarketPanel, ChatPanel, WorldStatusPanel
  index.css        the Windows 95 design system: bevels, dithers, chunky scrollbars
```

---

## Buildings (the resource sink)

Jobs are on 2s timers, so a faction piles up resources fast. Four projects burn that surplus and
permanently boost the faction. Everyone pays from the same stockpile, so chat is where you argue
about what to build next.

| Project | What it does | Level 1 | Max (L5) |
|---------|--------------|---------|----------|
| Mine Shaft | +1 iron per Mine shift, per level | 10 wood + 5 iron, 15s | 50 wood + 25 iron, 35s |
| Irrigation | +1 food per Farm and Feed Cows, per level | 8 wood + 4 food, 15s | 40 wood + 20 food, 35s |
| Market | -0.25s off every job cooldown, per level (floor 1s) | 14 wood + 1 tool, 20s | 70 wood + 5 tools, 44s |
| Wall | +5 defense, read by the AI council as world state | 12 wood + 6 iron, 18s | 60 wood + 30 iron, 38s |

Construction finishes on a server ticker, so it completes even if nobody has a tab open, and the
faction room gets a `building:complete` event when it lands. Wall level, tool count and stockpiles
are injected into the LLM prompt, so the council judges "can we actually take them" rather than only
reading the vibe of your chat.

---

## Caravans (trade that moves goods)

A signed trade deal used to be only a label. Now it opens a road: you load a wagon, it travels for
`CARAVAN_TRAVEL_MS` (45s by default) and the goods genuinely move between the two stockpiles.

Prices are flat value units, and **the rate is the same in both directions**:

| Good | Price | Good | Price |
|------|-------|------|-------|
| Food | 1 | Iron | 3 |
| Wood | 2 | Tools | 9 |

So trading never invents resources - it only converts the thing you have too much of into the thing
you cannot afford to build with. Wood is deliberately pricey because chopping is the slowest job in
the game: a faction that farmed all day can buy its Mine Shaft timber instead.

How a wagon works:

1. You need a **live trade deal** with the partner (the council signs one at cooperation >= 7).
2. Cargo is **escrowed the moment the wagon rolls**, so two players cannot spend the same stockpile twice.
3. A wagon must be worth **10-240** units, and the partner must actually hold the goods you are asking
   for. If they spent it while you travelled, the wagon is paid what is left - never more.
4. Each faction can have **2 wagons** on the road at a time.
5. **Road risk**: 3% in peacetime, +25% per war touching either partner. A raided wagon loses the cargo.
6. When the council declares war, every wagon already between those two factions is lost immediately and
   the embargo lands in the council log.
7. Volume traded is fed back into the AI: heavy commerce lifts cooperation (up to +3 in the rule scorer)
   and the route ledger is injected into the llama.cpp prompt. Trade makes peace, war costs goods.

The Market panel shows the deal countdown, the road risk, the lifetime ledger, two one-click surplus
offers per partner and every wagon on the road with its arrival timer.

---

## The look (Windows 95 build)

The UI is deliberately a 1998 application: `#c0c0c0` dialog faces on a dithered teal desktop, title
bars with `_ □ ×`, a menu bar that does nothing, `<fieldset>` group boxes, zebra-striped tables,
chunky 16px scrollbars, blinking `NEW!` markers, a scrolling status-bar marquee, a rainbow `<hr>`,
an "under construction" hazard stripe and a visitor counter.

No curves, no translucency, no fades:

- `corePlugins: { borderRadius: false }` in Tailwind plus `border-radius: 0 !important` in `index.css`,
  so a rounded corner is not expressible in this build.
- `transition: none !important` - progress moves in whole pixels, once per second.
- Surfaces are 2px bevels made of four flat tones (`inset` box-shadows), the classic Win95 trick.
- `-webkit-font-smoothing: none` gives genuinely aliased, stair-stepped glyph edges.
- Bars are ASCII (`▓▓▓▓░░░░`), mottos are Comic Sans, and everything sits in a 800px window.

All of it lives in `client/src/index.css` and `client/src/components/Win95.jsx`; panels are assembled
from `Window`, `Group`, `Btn`, `BlockBar`, `Marquee`, `StatusCell`, `Counter` and `RainbowRule`.

One honest caveat: `-webkit-font-smoothing: none` only works in WebKit/Blink (Chrome, Safari, Edge).
Firefox has no way to switch font smoothing off, so there the text stays smoothed while everything else
(bevels, palette, scrollbars, ASCII bars) still reads 1998.

---

## Checking it

```bash
npm run check            # both harnesses below
npm run check:caravans   # 69 assertions on the trade engine, against a throwaway /tmp database
npm run check:ui         # renders every panel server-side with real data from the running server
```

`check:caravans` (`server/scripts/caravan-check.mjs`) needs nothing running - it imports the real
service modules against `/tmp/kg-unit.sqlite` and pins `Math.random`, so delivery, short payment and
raids are all deterministic. It guards the important invariants: symmetric rates cannot create value,
escrow parks goods that are in transit, a broke partner is never allowed to go negative, and a
declaration of war costs exactly the cargo that was on the road.

`check:ui` needs `npm run dev` up: it captures a live `/api/state` payload, builds the components as an
SSR bundle (`client/src/ssr-check.jsx`) and renders each panel, asserting on the markup - title bars,
blinking alerts, ASCII block bars, both branches of the market panel (open road and closed road), the
join dialog's radio table. No browser or screenshot tooling required.

---

## Dev endpoints (handy for testing solo)

| Endpoint | What it does |
|----------|--------------|
| `POST /api/dev/seed` | Inject scripted chat. Body: `{"faction":"Ironhelm","mood":"war","target":"Sunfire"}` - mood is `war`, `trade`, `fear` or `calm` |
| `POST /api/dev/scan-now` | Run a council reading immediately |
| `POST /api/dev/reset` | Wipe chat + sentiments + caravans, set every pair neutral. Body `{"faction":"Sunfire"}` clears one faction only |
| `POST /api/dev/caravans-arrive` | Force every wagon on the road to settle right now - no waiting through the 45s trip |
| `GET /api/dev/chat/:faction` | Inspect what the AI actually reads |
| `GET /api/world/caravans` | Recent caravans + the lifetime route ledger |
| `GET /api/health` | Server, db path and scan status |

The same three buttons live at the bottom of the World Status panel in-game.

---

## Resetting the world

The database is a single file: `data/kingdoms.sqlite`. Delete it while the server is stopped for a
ground-up fresh world (or use the reset endpoint).

---

## Known MVP limits

- No passwords. Your name is stored in the browser's localStorage; anyone who guesses a taken name
  is told to pick another.
- Resources are faction-wide, not personal. There is no inventory.
- Wars have no battles yet - being at war is a status, but it does now cost you real goods by closing
  the road and raiding whatever was in transit.
- One decision per faction per scan keeps the story readable but makes the council slow.
- Chat is faction-only: you cannot hear another faction talking (spy / global chat is post-MVP).
