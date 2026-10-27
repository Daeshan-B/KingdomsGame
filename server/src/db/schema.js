export const SCHEMA_SQL = `
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

CREATE TABLE IF NOT EXISTS caravans (
  id TEXT PRIMARY KEY,
  sender TEXT NOT NULL,
  receiver TEXT NOT NULL,
  cargo_resource TEXT NOT NULL,
  cargo_amount INTEGER NOT NULL,
  ask_resource TEXT NOT NULL,
  ask_amount INTEGER NOT NULL,
  value INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  arrives_at INTEGER NOT NULL,
  settled_at INTEGER,
  risk REAL,
  loss INTEGER,
  initiator TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_caravans_status ON caravans(status, arrives_at);

-- Lifetime trade history per faction pair, read back into the AI prompt:
-- "these two have shipped 800 value of goods" makes the council think twice.
CREATE TABLE IF NOT EXISTS trade_routes (
  faction_a TEXT NOT NULL,
  faction_b TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  raided INTEGER NOT NULL DEFAULT 0,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER,
  PRIMARY KEY (faction_a, faction_b)
);

CREATE TABLE IF NOT EXISTS ai_log (
  id TEXT PRIMARY KEY,
  faction TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;
