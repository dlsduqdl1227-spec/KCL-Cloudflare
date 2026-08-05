-- Global assessment-login security code configuration.
-- The code itself is never stored; setting_value contains a salted HMAC-SHA256 record.
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
