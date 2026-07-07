PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS competitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  current_round TEXT NOT NULL DEFAULT '',
  legacy_sheet_name TEXT,
  debriefing_enabled INTEGER NOT NULL DEFAULT 0,
  sms_prefix TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS competition_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  option_key TEXT NOT NULL,
  option_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (competition_id, option_key)
);

CREATE TABLE IF NOT EXISTS operators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_type TEXT NOT NULL DEFAULT 'JUDGE',
  name TEXT NOT NULL,
  affiliation TEXT NOT NULL DEFAULT '',
  phone_hash TEXT NOT NULL,
  phone_last4 TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  team_group TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  legacy_row_index INTEGER,
  legacy_sheet_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operators_login ON operators(name, phone_hash, is_active);

CREATE TABLE IF NOT EXISTS operator_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_id INTEGER NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  competition_code TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  team_group TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (operator_id, competition_code, role, team_group)
);

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  team_name TEXT NOT NULL DEFAULT '',
  team_no TEXT NOT NULL DEFAULT '',
  affiliation TEXT NOT NULL DEFAULT '',
  phone_hash TEXT,
  phone_last4 TEXT NOT NULL DEFAULT '',
  unique_no TEXT NOT NULL DEFAULT '',
  prelim_cup_no TEXT NOT NULL DEFAULT '',
  main_cup_no TEXT NOT NULL DEFAULT '',
  final_cup_no TEXT NOT NULL DEFAULT '',
  cup_no TEXT NOT NULL DEFAULT '',
  sample_no TEXT NOT NULL DEFAULT '',
  legacy_row_index INTEGER,
  legacy_sheet_name TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_participants_lookup ON participants(competition_id, name, phone_hash);
CREATE INDEX IF NOT EXISTS idx_participants_unique ON participants(competition_id, unique_no);

CREATE TABLE IF NOT EXISTS participant_identifiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  identifier_type TEXT NOT NULL DEFAULT 'raw',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (participant_id, identifier, identifier_type)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  operator_id INTEGER REFERENCES operators(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL DEFAULT 'judge',
  payload_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  competition_code TEXT NOT NULL,
  round TEXT NOT NULL DEFAULT '',
  judge_name TEXT NOT NULL DEFAULT '',
  judge_team TEXT NOT NULL DEFAULT '',
  judge_role TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'judge',
  participant_key TEXT NOT NULL DEFAULT '',
  participant_name TEXT NOT NULL DEFAULT '',
  team_name TEXT NOT NULL DEFAULT '',
  total_score REAL,
  final_score REAL,
  review_status TEXT NOT NULL DEFAULT '미검수',
  disqualified INTEGER NOT NULL DEFAULT 0,
  disqualification_reason TEXT NOT NULL DEFAULT '',
  signature_base64 TEXT,
  legacy_row_index INTEGER,
  legacy_sheet_name TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_submissions_comp_round ON submissions(competition_code, round);
CREATE INDEX IF NOT EXISTS idx_submissions_participant ON submissions(competition_code, participant_key);
CREATE INDEX IF NOT EXISTS idx_submissions_legacy ON submissions(legacy_sheet_name, legacy_row_index);

CREATE TABLE IF NOT EXISTS submission_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  header_key TEXT NOT NULL,
  header_label TEXT NOT NULL DEFAULT '',
  value_text TEXT,
  value_number REAL,
  value_json TEXT,
  ordinal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (submission_id, header_key)
);

CREATE TABLE IF NOT EXISTS submission_smart_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  attribute_key TEXT NOT NULL,
  tag_text TEXT NOT NULL,
  tag_tone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS review_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  actor_operator_id INTEGER REFERENCES operators(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  updates_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ranking_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  round TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT NOT NULL,
  created_by_operator_id INTEGER REFERENCES operators(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
  phone_hash TEXT NOT NULL,
  phone_last4 TEXT NOT NULL DEFAULT '',
  otp_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  cooldown_until TEXT,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otp_lookup ON otp_codes(competition_id, phone_hash, consumed_at, expires_at);

CREATE TABLE IF NOT EXISTS debrief_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sms_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL DEFAULT 'SOLAPI',
  to_phone_hash TEXT NOT NULL,
  to_phone_last4 TEXT NOT NULL DEFAULT '',
  message_preview TEXT NOT NULL DEFAULT '',
  provider_status INTEGER,
  provider_body TEXT,
  success INTEGER NOT NULL DEFAULT 0,
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  context_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_operator_id INTEGER REFERENCES operators(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ikrc_seed_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
  match_no TEXT NOT NULL,
  participant_a_json TEXT NOT NULL DEFAULT '{}',
  participant_b_json TEXT NOT NULL DEFAULT '{}',
  memo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '오픈',
  legacy_row_index INTEGER,
  legacy_sheet_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (competition_id, match_no)
);

CREATE TABLE IF NOT EXISTS ikrc_seed_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_value TEXT NOT NULL,
  bonus INTEGER NOT NULL DEFAULT 0,
  memo TEXT NOT NULL DEFAULT '',
  legacy_row_index INTEGER,
  legacy_sheet_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (competition_id, target_type, target_value)
);

CREATE TABLE IF NOT EXISTS ikrc_calibration_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
  sample_no TEXT NOT NULL,
  team TEXT NOT NULL DEFAULT '',
  checker_name TEXT NOT NULL DEFAULT '',
  checker_role TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  legacy_row_index INTEGER,
  legacy_sheet_name TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (competition_id, sample_no, team, checker_role)
);

CREATE TABLE IF NOT EXISTS mob_calibration_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
  participant_no TEXT NOT NULL,
  team TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  checker_name TEXT NOT NULL DEFAULT '',
  checker_role TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  legacy_row_index INTEGER,
  legacy_sheet_name TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (competition_id, participant_no, team, category, checker_role)
);
