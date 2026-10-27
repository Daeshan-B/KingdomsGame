import { Router } from 'express';
import { FACTION_IDS } from '../config.js';
import { getAllDiplomacy, getLatestSentiments, getAiLog, getRecentCaravans, getAllRoutes } from '../db/queries.js';
import { publicCaravan } from '../services/caravans.js';
import { scanStatus, runScan } from '../ai/scan.js';

export const worldRouter = Router();

worldRouter.get('/status', (req, res) => {
  res.json({
    ok: true,
    diplomacy: getAllDiplomacy(),
    sentiments: getLatestSentiments(),
    aiLog: getAiLog(12),
    scan: scanStatus(),
    caravans: getRecentCaravans(10).map(publicCaravan),
    routes: getAllRoutes(),
    factions: FACTION_IDS,
  });
});

worldRouter.get('/diplomacy', (req, res) => {
  res.json({ ok: true, diplomacy: getAllDiplomacy() });
});

worldRouter.get('/sentiments', (req, res) => {
  res.json({ ok: true, sentiments: getLatestSentiments(), scan: scanStatus() });
});

/** Trade history: every caravan on the road plus the lifetime ledger per pair. */
worldRouter.get('/caravans', (req, res) => {
  res.json({ ok: true, caravans: getRecentCaravans(20).map(publicCaravan), routes: getAllRoutes() });
});
