-- Runtime security/support tables used by the Cloudflare Pages API.
-- Safe to run multiple times.
CREATE TABLE IF NOT EXISTS sms_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT,
  competition_code TEXT,
  recipient_name TEXT,
  phone TEXT,
  purpose TEXT,
  status TEXT,
  message TEXT,
  response_json TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT,
  actor_name TEXT,
  target TEXT,
  status TEXT,
  message TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sms_logs_comp ON sms_logs(competition_code, phone, created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_action ON security_events(action, created_at);
