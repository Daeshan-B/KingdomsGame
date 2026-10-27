import './env.js';
import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { WORLD, FACTIONS, JOBS, BUILDINGS } from './config.js';
import { gameRouter } from './routes/game.js';
import { worldRouter } from './routes/world.js';
import { devRouter } from './routes/dev.js';
import { attachSocket } from './socket/index.js';
import { startScheduler, runScan, scanStatus } from './ai/scan.js';
import { settleDue } from './services/buildings.js';
import { settleCaravans } from './services/caravans.js';
import { dbPath } from './db/database.js';

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    world: 'Kingdoms MVP',
    db: dbPath,
    factions: Object.keys(FACTIONS),
    jobs: Object.keys(JOBS),
    buildings: Object.keys(BUILDINGS),
    scan: scanStatus(),
  });
});

app.get('/api/config', (req, res) => {
  res.json({ ok: true, factions: Object.values(FACTIONS), jobs: Object.values(JOBS) });
});

app.use('/api', gameRouter);
app.use('/api/world', worldRouter);
app.use('/api/dev', devRouter);

// Any unmatched /api/* path answers with JSON, never an HTML error page.
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: `Unknown endpoint ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error('[http] unhandled error:', err);
  res.status(500).json({ ok: false, error: err.message });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

attachSocket(io);
startScheduler();

// Construction finishes on its own clock, so a light ticker settles any project
// whose timer elapsed and tells the faction room about it. Caravans arrive the
// same way - nobody has to keep a tab open for goods to change hands.
const worldTicker = setInterval(() => {
  settleDue();
  settleCaravans();
}, 2000);

server.listen(WORLD.port, () => {
  console.log('');
  console.log('  Kingdoms Game server');
  console.log(`  API      http://localhost:${WORLD.port}`);
  console.log(`  database ${dbPath}`);
  console.log(`  AI scan  every ${WORLD.scanIntervalMs / 1000}s  |  ${WORLD.llamaUrl ? WORLD.llamaUrl : 'rule-based fallback (no LLAMA_URL set)'}`);
  console.log('');
  // First scan right away so the world has a sentiment reading to show.
  setTimeout(() => runScan({ manual: false }), 1500);
});
