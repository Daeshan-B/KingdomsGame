import { SPRITES } from './spriteRegistry.js';

// ---------------------------------------------------------------------------
// Pixel-icon engine. Every icon is a small grid of characters where each
// character maps to one Dungeon-20 colour (or transparent). Rendered as one SVG
// <rect> per lit pixel with shape-rendering: crispEdges, so it stays hard-edged
// and scales cleanly - no emoji, no antialiasing, no external image files.
//
// Legend:  . transparent   k #2e222f  d #28353e  s #344a5a  b #407080
//          c #508da0  y #5bbfc5  r #7a3045  R #993d41  o #cd683d  g #fbb954
//          w #f2ec8b  m #997f73  n #b0a987  a #a9b2a2  i #788a87  e #443846
//          p #45293f  t #665964  h #d6dad3
// Uppercase M/H reuse m/h; f reuses face purple; used only for art readability.
// ---------------------------------------------------------------------------

const PALETTE = {
  k: '#2e222f', d: '#28353e', s: '#344a5a', b: '#407080', c: '#508da0',
  y: '#5bbfc5', r: '#7a3045', R: '#993d41', o: '#cd683d', g: '#fbb954',
  w: '#f2ec8b', m: '#997f73', n: '#b0a987', a: '#a9b2a2', i: '#788a87',
  e: '#443846', p: '#45293f', t: '#665964', h: '#d6dad3', f: '#443846',
  M: '#997f73', H: '#d6dad3',
};

// Register all sprite data. Importing PixelIcon is enough to make every icon
// available, because these modules Object.assign into the shared SPRITES map.
import './spritesA.js';
import './sprites.js';

export function PixelIcon({ name, size = 20, className = '', title }) {
  const rows = SPRITES[name];
  if (!rows) return null;

  const width = rows[0].length;
  const height = rows.length;
  const cells = [];

  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    for (let x = 0; x < width; x += 1) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const fill = PALETTE[ch];
      if (!fill) continue;
      cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    }
  }

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={title || name}
      style={{ display: 'block', imageRendering: 'pixelated' }}
    >
      {cells}
    </svg>
  );
}

export function factionIcon(factionId) {
  return `faction-${factionId}`;
}

// Map a job / building / resource id to its sprite name.
export const JOB_ICON = { mine: 'job-mine', farm: 'job-farm', chop: 'job-chop', feed: 'job-feed', smith: 'job-smith' };
export const BUILDING_ICON = { mine: 'building-mine', farm: 'building-farm', market: 'building-market', wall: 'building-wall' };
export const RESOURCE_ICON = { iron: 'res-iron', food: 'res-food', wood: 'res-wood', tools: 'res-tools' };
