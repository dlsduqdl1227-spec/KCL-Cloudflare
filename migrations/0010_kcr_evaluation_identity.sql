-- Only new server-keyed KCR evaluations participate. Existing scores stay unchanged.
-- The key separates judge, round, participant, and station-scoped calibration.
CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_kcr_evaluation_key
  ON scores(json_extract(payload_json, '$.kcrEvaluationKey'))
  WHERE competition_code='KCR' AND COALESCE(json_extract(payload_json, '$.kcrEvaluationKey'), '') <> '';
