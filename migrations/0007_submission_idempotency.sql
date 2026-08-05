-- Prevent a retried browser submission from creating a second score row.
-- Multi-cup submissions share one clientSubmissionId, so unit remains part of the key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_client_submission_unit
  ON scores(competition_code, judge_name, json_extract(payload_json, '$.clientSubmissionId'), unit)
  WHERE COALESCE(json_extract(payload_json, '$.clientSubmissionId'), '') <> '';
