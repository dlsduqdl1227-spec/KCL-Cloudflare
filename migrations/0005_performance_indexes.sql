-- Query indexes for score review/ranking and debriefing authentication.
-- Safe to run multiple times.
CREATE INDEX IF NOT EXISTS idx_scores_comp_id
  ON scores(competition_code, id);
CREATE INDEX IF NOT EXISTS idx_scores_submitter_unit
  ON scores(competition_code, round, judge_name, unit, id DESC);
CREATE INDEX IF NOT EXISTS idx_otps_lookup
  ON otps(competition_code, name, phone, id DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_kind
  ON sessions(kind);
