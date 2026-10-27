# Kingdoms Game - MVP Specification

## Overview

A persistent, multiplayer world where 3 factions coexist in constant tension. Players perform daily tasks (mining, farming, etc.) while AI agents analyze chat sentiment to drive diplomacy, trade, and conflict between factions.

**Core Concept:** Think Civilization 5 meets EVE Online meets a social simulation. No character movement - everything is menu-based. The world is shared and persistent.

---

## Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Frontend | React + Vite | Fast, beginner-friendly, great docs |
| Backend | Node.js + Express | Simple, JavaScript everywhere |
| Database | SQLite (better-sqlite3) | Zero config, file-based, perfect for local MVP |
| Real-time | Socket.io | WebSocket library for live updates |
| AI/LLM | llama.cpp (external server) | Already available, with rule-based fallback |
| Styling | Tailwind CSS | Utility-first, rapid UI development |

---

## Game Design

### Factions

Three factions with cosmetic differences only (same mechanics):

| Faction | Color | Emoji | Vibe |
|---------|-------|-------|------|
| Ironhelm | Gray | a industrial icon | Industrial, tough |
| Greenleaf | Green | a leaf icon | Nature-focused, peaceful |
| Sunfire | Red | a fire icon | Aggressive, passionate |

Players choose their faction freely when joining.

### Core Gameplay Loop

```
Player joins -> Sees faction dashboard -> Performs jobs (click buttons) -> Chats with faction
-> AI analyzes sentiment -> World state updates -> Repeat
```

### Jobs (Player Actions)

Simple click-based actions that generate resources:

| Job | Effect | Cooldown |
|-----|--------|----------|
| Mine | +1 Iron | 2 seconds |
| Farm | +1 Food | 2 seconds |
| Chop Wood | +1 Wood | 2 seconds |
| Feed Cows | +1 Food | 2 seconds |
| Smith | +1 Tools (costs 2 Iron) | 4 seconds |

**MVP Scope:** 5 jobs, 3 raw resources (Iron, Food, Wood) + 1 crafted (Tools)

### Resources

| Resource | Purpose |
|----------|---------|
| Iron | Building, tools, weapons |
| Food | Feeding population, trade |
| Wood | Building, fuel |
| Tools | Advanced crafting, trade |

Resources are pooled at faction level (not individual).
### Buildings (faction projects)

Jobs have no cap, so buildings are the sink that keeps resources meaningful. Each faction raises
the same four projects from one shared stockpile, level 0 to 5. Cost and build time both scale with
the level you already have, and the whole faction pays up front - so players have to agree on
priorities in chat.

| Building | Effect per level | Level 1 cost | Level 5 cost | Build time |
|----------|------------------|--------------|--------------|------------|
| ⛏️ Mine Shaft | +1 iron per Mine shift | 10 wood + 5 iron | 50 wood + 25 iron | 15s -> 35s |
| 🌾 Irrigation | +1 food per Farm and per Feed Cows | 8 wood + 4 food | 40 wood + 20 food | 15s -> 35s |
| 🏪 Market | -0.25s off every job cooldown (floor 1s) | 14 wood + 1 tool | 70 wood + 5 tools | 20s -> 44s |
| 🛡️ Wall | +5 defense, read by the AI council | 12 wood + 6 iron | 60 wood + 30 iron | 18s -> 38s |

Rules:
- Construction runs on a timer and completes on its own (a 2s server ticker settles it and
  broadcasts, so no client has to be watching for it to finish).
- One project of a given type per faction can be under construction at a time.
- Stockpiles, wall level and tool count are injected into the LLM prompt as world state, so the
  council reads "Ironhelm: iron 9, tools 1, defense 25" alongside the chat before deciding.

---

## Caravans (trade that moves goods)

A trade deal is not a label - it opens a road. Players load a wagon from the shared stockpile, it
travels on a timer, and the goods genuinely change hands when it arrives.

**Prices (value units per resource, identical in both directions):**

| Resource | Price | Resource | Price |
|----------|-------|----------|-------|
| Food | 1 | Iron | 3 |
| Wood | 2 | Tools | 9 |

Symmetric rates are the point: a round trip cannot create value, so trade only converts a surplus into
a bottleneck resource (usually wood, because chopping is the slowest job).

**Rules**

| Rule | Value |
|------|-------|
| Requires | a live, unexpired trade deal with the partner |
| Escrow | cargo leaves the sender's stockpile the instant the wagon rolls |
| Wagon size | 10 - 240 value units per trip |
| Wagons per faction | 2 on the road at once (`CARAVAN_MAX_IN_FLIGHT`) |
| Travel time | 45s (`CARAVAN_TRAVEL_MS`), settled by the same 2s ticker as construction |
| Payment | taken from the receiver on arrival, clamped to what they actually hold |
| Road risk | 3% in peace, +25% per war touching either partner, capped at 60% |
| War | instantly raids every wagon between the two factions and logs an embargo |
| Feedback | lifetime value traded lifts cooperation (max +3) and is injected into the LLM prompt |

Settlement is always a two-sided transaction inside `applyResourceDelta`, which refuses to let a
stockpile go negative, so a wagon can never mint goods or double-spend the faction purse.

---

## AI Agent System

### Sentiment Analysis

**Trigger:** Every 5 minutes (configurable via `AI_SCAN_INTERVAL_MS`).

**Process:**
1. Collect the last 50 messages from each faction chat
2. Send to llama.cpp with a structured prompt asking for 0-10 scores
3. Store sentiment scores per faction
4. If llama.cpp is unreachable, fall back to a keyword/rule-based scorer so the game always runs

**Output Format:**
```json
{
  "faction": "Ironhelm",
  "aggression": 7,
  "cooperation": 3,
  "fear": 5,
  "target": "Sunfire",
  "summary": "Ironhelm players are discussing war preparations"
}
```

### AI Decisions

Based on sentiment scores, the AI council makes one decision per faction per scan:

| Condition | AI Action |
|-----------|-----------|
| aggression >= 7 | Declare war on the discussed target faction |
| cooperation >= 7 | Propose trade deal with target faction |
| fear >= 7 | Request peace with the faction they are at war with |
| all scores < 5 | No change (stay neutral) |

**MVP Scope:** 3 decision types - War, Trade Proposal, Peace Request

### Diplomacy States

```
Neutral <-> War
Neutral <-> Trade   (a live trade deal is what allows caravans on that road)
War     -> Peace -> Neutral (if fear is high)
Trade   -> Neutral (expires after 24h; wagons already in transit still arrive)
War     -> raids every caravan between the two the moment it is declared
```

All 3 pairs of factions have a state row: Ironhelm-Greenleaf, Ironhelm-Sunfire, Greenleaf-Sunfire.

---

## Build Phases

See the phased plan in README.md. Each phase must run before the next is started.

Phase 1: Scaffold + server + DB + join screen
Phase 2: Jobs + faction resources + cooldowns
Phase 3: Real-time faction chat (Socket.io)
Phase 4: World status + diplomacy display
Phase 5: AI sentiment scan + decisions
Phase 6: Caravans - trade that actually moves resources
Phase 7: Windows 95 skin
Phase 8: Polish + README + playtest

---

## User Interface

### Screen Layout

```
+-------------------------------------------------------------+
|  Kingdoms Game                    Faction: Ironhelm  [Leave] |
+-------------------------------------------------------------+
| +---------------+ +---------------------------------------+ |
| |   RESOURCES   | |             FACTION CHAT               | |
| |               | |                                        | |
| |  Iron: 45     | |  [Player1]: We should attack!          | |
| |  Food: 120    | |  [Player2]: Let's build up first       | |
| |  Wood: 67     | |  [Player3]: Trade with Greenleaf?      | |
| |  Tools: 12    | |                                        | |
| |               | |  [Type message...]            [Send]   | |
| +---------------+ +---------------------------------------+ |
|                                                             |
| +----------------------------------------------------------+|
| |                          JOBS                            |
| |  [Mine] [Farm] [Chop] [Feed Cows] [Smith]                |
| +----------------------------------------------------------+|
| +----------------------------------------------------------+|
| |                      WORLD STATUS                        |
| |  Ironhelm is at WAR with Sunfire                         |
| |  Greenleaf has a TRADE deal with Ironhelm                |
| |  Next AI scan in: 3:45                                   |
| +----------------------------------------------------------+|
```

### Screen Layout (Windows 95 build)

```
+== KINGDOMS.EXE - Ironhelm Faction Window  _ [] x ==+
+ File Edit View Tools Help          3 user(s) logged on
+-----------------------------------------------------+
| !! >> AI council has declared war on Sunfire  << !! |
+-----------------------------------------------------+
| [Stockpile - STOCK.XLS]   | [Ironhelm CHAT - LOG.TXT]|
|  Good  Qty Price Worth    | NEW! read by AI council  |
|  Iron   45    3    135    | [11:02:03] Bram: attack.. |
|  ...                    | [Type message...] [Send] |
+-------------------------+--------------------------+
| [Daily Work - JOBS.DAT]                            |
|  [Mine][Farm][Chop][Feed Cows][Smith]  [READY]     |
|                                                    |
| [Faction Projects - PROJECTS.MDB]                   |
|  Mine Shaft   ███░░  10 wood + 5 iron   [Build]     |
|                                                    |
| [Caravan Routes - CARAVAN.SYS]                      |
|  Greenleaf - road open   deal ends 23h  risk 3%     |
|  Load [Wood 2] Units [30] Ask [AUTO] [Send wagon]   |
|  ==> OUT Greenleaf  30 wood for 20 food  ▓▓▓▓░░ 28s |
+-----------------------------------------------------+
| WORLD.ST - COUNCIL.LOG  (right column)              |
|  Ironhelm / Sunfire  [AT WAR]   road closed          |
|  Aggression ▓▓▓▓▓▓░░░░░░ 6   Cooperation ▓░░ 1       |
+-----------------------------------------------------+
| motto marquee... | 3 on | council 3:45 | 1 wagon(s) |
+-----------------------------------------------------+
[ Start ] [ Kingdoms - Ironhelm ]                  11:02
This page is under construction - sign my guestbook  [007]
==========================================================
```

### UI Components

1. **Win95.jsx** - shared chrome: `Window` (title bar + `_ □ ×`), `Group` (fieldset/legend),
   `Btn`, `BlockBar` (ASCII progress), `Marquee`, `StatusCell`, `Counter`, `RainbowRule`, `Led`
2. **JoinScreen** - modal dialog, faction radios in a table, Name field, OK / Cancel, guestbook footer
3. **Header** - application title bar, dead menu bar, blinking marquee alert for the latest event
4. **ResourcesPanel** - stockpile spreadsheet with prices and total cart value, rival table with badges
5. **JobsPanel** - chunky job buttons that press inward, `[READY]` or a red `▓▓░░` rest timer
6. **BuildingsPanel** - project table with `███░░` level pips and build timers
7. **MarketPanel** - caravan routes: deal countdown, road risk, ledger, one-click offers, wagons in transit
8. **ChatPanel** - monospace faction log in a sunken list, faction-only, socket-driven, auto-scroll
9. **WorldStatusPanel** - diplomacy table, ASCII mood bars, council decree log, dev mood buttons

### Visual language

- Flat 16-colour VGA palette: `#c0c0c0` faces, `#008080` dithered desktop, `#000080` title bars,
  `#c00000` war, `#008000` trade, `#ff8000` building in progress.
- **No rounded corners at all** - `corePlugins: { borderRadius: false }` plus
  `border-radius: 0 !important`, so the utility does not even exist.
- **No antialiasing** - `-webkit-font-smoothing: none`, `image-rendering: pixelated`.
- **No transitions** - `transition: !important none`; timers advance in whole seconds and blocks.
- Depth comes from 2px bevels made of four flat tones (`inset` box-shadows), never from shadow blur,
  translucency or gradients.
- Emoji are only ever used as 1998-style "icons" in sunken 16-22px icon cells.

---

## Backend Architecture

### Directory Structure

```
KingdomsGame/
|-- client/                 # React frontend (Vite)
|   |-- src/
|   |   |-- components/     # UI components
|   |   |-- services/       # api.js + socket.js
|   |   |-- App.jsx
|   |   |-- main.jsx
|   |   `-- index.css
|   |-- index.html
|   |-- package.json
|   |-- postcss.config.js
|   |-- tailwind.config.js
|   `-- vite.config.js
|
|-- server/                 # Node.js backend (Express + Socket.io)
|   |-- src/
|   |   |-- ai/             # sentiment.js + decisions.js
|   |   |-- db/             # database.js + schema.js
|   |   |-- routes/         # game.js, chat.js, world.js
|   |   |-- socket/         # index.js
|   |   |-- config.js       # factions, jobs, constants
|   |   `-- index.js        # entry point
|   |-- .env.example
|   `-- package.json
|
|-- package.json            # Root: runs client + server together
|-- spec.md
`-- README.md
```

### Database Schema (SQLite)

```sql
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  faction TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resources (
  faction TEXT PRIMARY KEY,
  iron INTEGER NOT NULL DEFAULT 0,
  food INTEGER NOT NULL DEFAULT 0,
  wood INTEGER NOT NULL DEFAULT 0,
  tools INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  faction TEXT NOT NULL,
  player_id TEXT NOT NULL,
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_faction_time ON messages(faction, created_at DESC);

CREATE TABLE IF NOT EXISTS sentiments (
  id TEXT PRIMARY KEY,
  faction TEXT NOT NULL,
  aggression INTEGER NOT NULL,
  cooperation INTEGER NOT NULL,
  fear INTEGER NOT NULL,
  target_faction TEXT,
  summary TEXT,
  source TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS diplomacy (
  faction_a TEXT NOT NULL,
  faction_b TEXT NOT NULL,
  state TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  reason TEXT,
  PRIMARY KEY (faction_a, faction_b)
);

CREATE TABLE IF NOT EXISTS cooldowns (
  player_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  last_used INTEGER NOT NULL,
  PRIMARY KEY (player_id, job_type)
);

CREATE TABLE IF NOT EXISTS buildings (
  faction TEXT NOT NULL,
  type TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER,
  completes_at INTEGER,
  builder TEXT,
  PRIMARY KEY (faction, type)
);

CREATE TABLE IF NOT EXISTS ai_log (
  id TEXT PRIMARY KEY,
  faction TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS caravans (
  id TEXT PRIMARY KEY,
  sender TEXT NOT NULL,
  receiver TEXT NOT NULL,
  cargo_resource TEXT NOT NULL,
  cargo_amount INTEGER NOT NULL,
  ask_resource TEXT NOT NULL,
  ask_amount INTEGER NOT NULL,
  value INTEGER NOT NULL,
  status TEXT NOT NULL,          -- traveling | delivered | raided
  started_at INTEGER NOT NULL,
  arrives_at INTEGER NOT NULL,
  settled_at INTEGER,
  risk REAL,
  loss INTEGER,
  initiator TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_caravans_status ON caravans(status, arrives_at);

CREATE TABLE IF NOT EXISTS trade_routes (
  faction_a TEXT NOT NULL,
  faction_b TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  raided INTEGER NOT NULL DEFAULT 0,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER,
  PRIMARY KEY (faction_a, faction_b)
);
```

---

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/players/join | Create player, choose faction |
| GET | /api/players/:id | Player profile (faction, etc.) |
| GET | /api/state/:playerId | Everything the dashboard needs in one call |
| POST | /api/jobs/perform | Do a job (playerId + jobType) |
| POST | /api/buildings/start | Begin raising the next level of a project |
| GET | /api/buildings/:faction | Inspect a faction project board |
| POST | /api/caravans/send | Load a wagon (playerId, receiver, resource, amount, ask) |
| GET | /api/market/:playerId | Prices, partners, road risk, ledger, one-click offers |
| GET | /api/world/status | Diplomacy states + AI countdown + recent caravans |
| GET | /api/world/caravans | Recent caravans + lifetime route ledger |
| POST | /api/dev/caravans-arrive | Force every wagon on the road to settle now |
| POST | /api/dev/seed | Seed fake chat to trigger AI locally |
| POST | /api/dev/scan-now | Run an AI sentiment scan immediately |
| GET | /api/health | Health check |

### Socket.io Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `presence:update` | Server -> Client | Online players joined a faction room |
| `chat:message` | Both | New chat message in a faction room |
| `resources:update` | Server -> Client | Faction resource count changed |
| `job:cooldown` | Server -> Client | Cooldown started for a player |
| `diplomacy:change` | Server -> Client | War / trade / peace update |
| `sentiment:update` | Server -> Client | New AI analysis results |
| `building:start` | Server -> Faction room | Project started, and who began it |
| `building:complete` | Server -> Faction room | Project timer elapsed, level applied |
| `buildings:refresh` | Server -> Everyone | Ask clients to re-read project boards |
| `caravan:update` | Server -> both faction rooms | Wagon sent / delivered / raided, with the row and an event name |
| `caravans:refresh` | Server -> Everyone | Ask clients to re-read the caravan board |
| `ai:log` | Server -> Client | AI council decision feed |

---

## LLM Integration

### Primary: llama.cpp server

The backend calls the `/completion` endpoint of your llama.cpp server. Configured in `server/.env`:

```
LLAMA_URL=http://127.0.0.1:8080
LLAMA_MODEL=your-model-name
```

### Flow

1. Scheduler runs every `AI_SCAN_INTERVAL_MS` (default 5 minutes)
2. Pulls the last 50 messages per faction
3. Builds a strict-JSON prompt asking for aggression / cooperation / fear / target / summary
4. Parses the response (extracts the first JSON object found, tolerates code fences)
5. Writes a `sentiments` row with `source = 'llama'`
6. Feeds the result into the decision engine

### Fallback: rule-based scorer

If the LLM is unreachable or returns invalid JSON, the backend scores messages with a keyword
lexicon (war / attack / kill -> aggression, trade / help / friend -> cooperation,
afraid / defend / scared -> fear) and stores `source = 'rules'`. This keeps the game playable
offline and is also useful for testing decisions deterministically.

### Decision Engine

```
aggression >= 7  -> declare WAR on target faction (if not already at war)
cooperation >= 7 -> open TRADE with target faction (24h expiry)
fear >= 7        -> sign PEACE if at war, then NEUTRAL
otherwise        -> no change
```

Every decision is written to `ai_log` and broadcast to all clients so players can see what the
council did and why.

---

## MVP Feature Checklist

### Phase 1-2: Core loop
- [x] Project scaffold (root + client + server)
- [x] SQLite schema and auto-initialisation
- [x] Join screen with faction choice
- [x] Dashboard layout
- [x] Job buttons with cooldowns and resource updates
- [x] Smith consumes iron, requires enough stock

### Phase 2.5: Buildings (resource sink)
- [x] Four projects: Mine Shaft, Irrigation, Market, Wall
- [x] Cost and build time scale with the level you already have
- [x] Construction settles on a server ticker and broadcasts to the faction room
- [x] Yields and cooldowns read from building levels
- [x] Faction strength injected into the AI prompt

### Phase 3: Real-time
- [x] Socket.io server + client
- [x] Faction chat rooms
- [x] Live resource broadcast
- [x] Online player list

### Phase 5: AI world
- [x] World status panel with diplomacy states
- [x] Sentiment scan scheduler + manual dev trigger
- [x] llama.cpp integration with rule fallback
- [x] War / trade / peace decisions broadcast to everyone

### Phase 6: Caravans (trade that moves goods)
- [x] Symmetric market price table (`MARKET_RATES`)
- [x] `caravans` + `trade_routes` tables, settled by the 2s world ticker
- [x] Deal gate, cargo escrow, wagon size limits, in-flight cap, partner affordability checks
- [x] Travel timer with arrival settlement, partial payment when the partner spent its stock
- [x] Road risk from live wars; declaring war raids every wagon in transit
- [x] Route ledger fed back into the AI (cooperation bonus + llama prompt world state)
- [x] MarketPanel: offers, form, wagons on the road, lifetime stats
- [x] Dev endpoints: `caravans-arrive`, `/api/world/caravans`

### Phase 7: Windows 95 skin
- [x] Design system in `index.css` (bevels, dithered desktop, chunky scrollbars, blink/marquee)
- [x] `Win95.jsx` chrome primitives shared by every panel
- [x] No rounded corners (Tailwind `borderRadius` core plugin disabled), no transitions, no font smoothing
- [x] Every panel rebuilt as a window: title bars, fieldsets, zebra tables, ASCII bars

### Post-MVP ideas
- [ ] Individual player inventories and personal wages
- [ ] More jobs, more resources
- [x] Actual resource trading between factions (Phase 6 - caravans)
- [ ] Automated battles with losses
- [ ] Sentiment history graphs
- [ ] Admin panel and live tuning
- [ ] Auth with passwords

---

## Getting Started

```bash
cd KingdomsGame
npm install          # installs root + server + client (postinstall script)
npm run dev          # server on :3001, client on :5173
```

Open http://localhost:5173 in several browser tabs to simulate different players and factions.

### Testing the AI without chatting

```bash
# seed aggressive chat into one faction, then scan immediately
curl -X POST http://localhost:3001/api/dev/seed -H 'content-type: application/json' \
  -d '{"faction":"Ironhelm","mood":"war"}'
curl -X POST http://localhost:3001/api/dev/scan-now
```

---

## Potential Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| LLM returns prose, not JSON | Regex-extract the first JSON object; fall back to rules |
| llama.cpp offline | Automatic rule-based fallback, clearly labelled in UI |
| Chat spam / flooding | 1 message per 2 seconds per player server-side |
| Resource inflation | Buildings burn wood, iron, food and tools as a permanent sink |
| Solo testing feels dead | Dev seed endpoint + scan-now endpoint |
| CORS between Vite and Express | Vite proxy `/api` and `/socket.io` to :3001 |

---

## Success Criteria for MVP

1. Player can join and choose a faction
2. Jobs increase faction resources and respect cooldowns
3. Chat is real-time and faction-scoped
4. AI scans chat on schedule and stores sentiment
5. Diplomacy states change based on sentiment
6. All connected players see updates live
7. State survives a server restart

---

*This spec is a living document. Update it as decisions are made during development.*
