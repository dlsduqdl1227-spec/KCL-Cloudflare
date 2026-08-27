-- Query-plan audit (2026-08-27): add only indexes proven to avoid repeated scans.
-- These support operator login, expired-session cleanup, and participant OTP lookup.
CREATE INDEX IF NOT EXISTS idx_operators_phone_id
  ON operators(phone, id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
  ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_participants_comp_phone_id
  ON participants(competition_code, phone, id);
