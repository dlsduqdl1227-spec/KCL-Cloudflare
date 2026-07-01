-- V7 registry/debriefing support. Safe to run multiple times where Cloudflare D1 allows IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS idx_participants_lookup ON participants(competition_code, name, phone);
CREATE INDEX IF NOT EXISTS idx_participants_unit ON participants(competition_code, unique_no, cup_no, sample_no, team_no);
CREATE INDEX IF NOT EXISTS idx_scores_unit ON scores(competition_code, unit, review_status);
