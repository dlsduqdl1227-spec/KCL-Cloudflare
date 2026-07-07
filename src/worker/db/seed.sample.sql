INSERT OR IGNORE INTO competitions
  (code, name, is_active, current_round, legacy_sheet_name, debriefing_enabled, sms_prefix)
VALUES
  ('KCR', 'Korea Coffee Roasting Championship', 1, '예선', 'KCR', 0, '[KCL]'),
  ('KCAC', 'Korea Coffee Art Championship', 1, '예선', 'KCAC', 0, '[KCL]'),
  ('KBC', 'Korea Barista Championship', 1, '예선', 'KBC', 0, '[KCL]');
