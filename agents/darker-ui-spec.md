# DARKER UI — Design Spec (Dungeon-20 "Abyss" deep)

Goal: take the existing "Dungeon Deep" retro theme (Lospec Dungeon-20) and push it
DARKER / moodier — a deeper "dungeon abyss" — while keeping the retro old-OS
aesthetic intact: bevels, hard edges, NO border radius, NO transitions,
pixelated image rendering, Tahoma/MS Sans Serif 12px.

This spec is a drop-in mapping. Keep every CSS variable name identical so the only
required code change is swapping the hex values (and matching the 87 hardcoded
hexes in components to the same new values).

## 1. CSS `:root` variable mapping  (client/src/index.css, lines ~18-32)

| var        | OLD    | NEW    | role                                    |
|------------|--------|--------|-----------------------------------------|
| --face     | #2b2430| #211a28| panel / dialog face (darker)            |
| --face-lite| #464f58| #39424c| outer highlight of raised bevel (darker)|
| --lite     | #5d6e6b| #4c5a57| inner highlight of a bevel (darker)     |
| --shade    | #1d262d| #141a21| inner shadow of a bevel (darker)        |
| --dark     | #1a151d| #120d14| deepest tone / borders / outline        |
| --navy     | #33535f| #27424d| active title bar base (darker)          |
| --aqua     | #1a151d| #0f0a11| desktop backdrop (darkest)              |
| --field    | #26323d| #1a232c| sunken text fields / list wells         |
| --ink      | #d9dcd3| #e3e6de| body text (slightly LIGHTER for contrast)|
| --ink-dim  | #9aa394| #a8b0a0| secondary text (slightly lighter)       |
| --wgreen   | #4fb3ba| #57c7d0| trade/ready/positive — brighter to pop  |
| --wred     | #a64449| #b5505a| war/danger — lifted for dark bg         |
| --wamber   | #c25e35| #cd6a3f| building/caution — lifted for dark bg   |
| --wgold    | #f2a844| #f7b14e| highlights / gold (kept warm, brighter) |
| --wlink    | #4f8ba0| #5696b4| links — lifted for dark bg              |

Design rationale:
- All structural/neutral tones (face, bevels, backdrop, fields, borders) go darker
  so the whole UI sits lower in the value range.
- Body text (--ink / --ink-dim) goes slightly LIGHTER, not darker, so contrast
  against the darker faces/fields is preserved or improved (the critical
  legibility tradeoff of "darker UI").
- Accent/status colors (wgreen/wred/wamber/wgold/wlink) are lifted a few points so
  they still read as signals on the darker backdrop instead of muddying into it.

## 2. Body desktop dither (client/src/index.css, line 54)

OLD: repeating-conic-gradient(#1a151d 0% 25%, #2f2233 0% 50%)
NEW: repeating-conic-gradient(#0f0a11 0% 25%, #221826 0% 50%)

## 3. Other hardcoded values IN index.css to update (besides :root)

- Line ~329-333 `.hr-rainbow` linear-gradient stops — map each old stop to the new
  accent values: #5e2637 -> #4a1c2b, #a64449 -> #b5505a, #c25e35 -> #cd6a3f,
  #f2a844 -> #f7b14e, #4fb3ba -> #57c7d0, #4f8ba0 -> #5696b4.
- Line ~338 `.hazard`: repeating-linear-gradient(45deg, #f2a844 0 6px, #1a151d 0 12px)
  -> repeating-linear-gradient(45deg, #f7b14e 0 6px, #120d14 0 12px)
- Line ~363 `.tbl tr:nth-child(even) td` background #212c35 -> #17202a (one step off new field)
- Line ~407-408 `.counter-digit`: background #1a151d -> #120d14, color #f2a844 -> #f7b14e
- Line ~421 `.link:visited` color #4fb3ba -> #57c7d0


## 4. Component hardcoded hexes (87 total across 10 files)

Every hardcoded hex in the components comes from the Dungeon-20 palette. Map each
to its darker counterpart using this table (old -> new). This is the full palette
remap, apply 1:1 wherever the OLD value appears:

#1a151d -> #120d14
#2f2233 -> #221826
#5e2637 -> #4a1c2b
#a64449 -> #b5505a
#c25e35 -> #cd6a3f
#f2a844 -> #f7b14e
#1d262d -> #141a21
#26323d -> #1a232c
#33535f -> #27424d
#4f8ba0 -> #5696b4
#4fb3ba -> #57c7d0
#e8df85 -> #ede48f
#a49d81 -> #aca587
#8d756a -> #937c72
#59505c -> #4d4550
#2b2430 -> #211a28
#464f58 -> #39424c
#5d6e6b -> #4c5a57
#d9dcd3 -> #e3e6de
#9aa394 -> #a8b0a0

NOTE: PixelIcon.jsx (and sprites.js / spritesA.js) contain hand-plotted pixel-art
colors that are NOT all in the exact 20-swatch set above (e.g. #2e222f, #28353e,
#344a5a, #407080, #508da0, #5bbfc5, #7a3045, #993d41, #cd683d, #fbb954, #f2ec8b,
#997f73, #b0a987, #a9b2a2, #788a87, #443846, #45293f, #665964, #d6dad3). These are
sprite icon colors. For these, DO NOT blindly remap — they are deliberate icon
art. Only adjust them if they visibly clash (the lightest highlight tones like
#f2ec8b / #d6dad3 / #fbb954 are fine as-is on a darker bg; keep them). The main
goal is the UI chrome, not redrawing icon art. Leave sprites unchanged unless a
color literally disappears into the new backdrop.

## 5. Per-component notes / contrast risk spots

- JoinScreen.jsx — big centered screen over the dither backdrop. Verify the title
  and any "press to join" text still pops; keep --ink light.
- Header.jsx / WorldStatusPanel.jsx — status LEDs + counters over --face / --field;
  counter digits use gold on a near-black well — gold lifted, OK.
- ChatPanel.jsx — contains #9670 (a 4-digit hex, likely legacy/typo). Flag it but
  do NOT change behavior; verify what it renders and report.
- Win95.jsx (window chrome, title bars) — active title bar uses --navy; inactive
  uses bevels. Make sure active vs inactive title bars still distinguish.
- MarketPanel.jsx / BuildingsPanel.jsx / JobsPanel.jsx / ResourcesPanel.jsx —
  tables (`.tbl`) and status cells; watch row zebra contrast and "affordable vs
  not" color cues (green/red).

## 6. DO NOT CHANGE (preserve)
- box-sizing, border-radius:0 !important, transition:none !important
- font stack + 12px size, line-height 1.35
- image-rendering:pixelated / shape-rendering:crispEdges
- color-scheme: dark
- scrollbar styling structure (only the var values shift)
- all component logic, props, and data flow — visual values only
- blink95 / marquee95 animations and .hr-rainbow / .hazard structure (only color stops)

## 7. Verification
- cd client && npm run build          (must pass)
- cd client && npm run check:render   (SSR render check; must pass)
- Visual: backdrops darker, text still crisp/legible, accents still pop,
  active/inactive title bars distinguishable, tables readable.

