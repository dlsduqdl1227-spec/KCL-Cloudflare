CREATE TABLE IF NOT EXISTS competitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  current_round TEXT DEFAULT '예선',
  sheet_name TEXT,
  debriefing INTEGER NOT NULL DEFAULT 0,
  sms_prefix TEXT,
  option_settings TEXT DEFAULT '{}',
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS operators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_type TEXT NOT NULL DEFAULT 'JUDGE',
  name TEXT NOT NULL,
  affiliation TEXT,
  phone TEXT NOT NULL,
  access TEXT DEFAULT '',
  team_group TEXT DEFAULT '',
  role TEXT DEFAULT '센서리 심사위원',
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_code TEXT NOT NULL,
  name TEXT,
  affiliation TEXT,
  phone TEXT,
  unique_no TEXT,
  prelim_cup_no TEXT,
  main_cup_no TEXT,
  final_cup_no TEXT,
  cup_no TEXT,
  sample_no TEXT,
  team_name TEXT,
  team_no TEXT,
  extra_json TEXT DEFAULT '{}',
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submitted_at TEXT NOT NULL,
  competition_code TEXT NOT NULL,
  round TEXT,
  judge_name TEXT,
  team TEXT,
  role TEXT,
  mode TEXT,
  unit TEXT,
  participant_name TEXT,
  total_score REAL,
  disqualified INTEGER NOT NULL DEFAULT 0,
  disqualification_reason TEXT,
  review_status TEXT NOT NULL DEFAULT '미검수',
  payload_json TEXT NOT NULL,
  signature_data TEXT
);
CREATE TABLE IF NOT EXISTS otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_code TEXT,
  name TEXT,
  phone TEXT,
  otp TEXT,
  expires_at TEXT,
  used_at TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_scores_comp ON scores(competition_code, round);
CREATE INDEX IF NOT EXISTS idx_participants_comp ON participants(competition_code);
CREATE INDEX IF NOT EXISTS idx_operators_phone ON operators(name, phone);
