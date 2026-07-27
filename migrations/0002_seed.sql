INSERT OR IGNORE INTO competitions (code, name, is_active, current_round, sheet_name, debriefing, sms_prefix, option_settings, updated_at) VALUES
('KBC','Korea Barista Championship',1,'예선','KBC',0,'KBC','{}',datetime('now')),
('KTCC','Korea Team Cupping Championship',1,'예선','KTCC',0,'KTCC','{}',datetime('now')),
('MOC','Master of Cupping',1,'예선','MOC',0,'MOC','{}',datetime('now')),
('MOB','Master of Brewing',1,'예선','MOB',0,'MOB','{}',datetime('now')),
('KCR','Korea Coffee Roasting',1,'예선','KCR',0,'KCR','{}',datetime('now')),
('IKRC','IKAWA Korea Roasting Championship',1,'예선','IKRC',0,'IKRC','{}',datetime('now')),
('KCAC','Korea Coffee Art Championship',1,'예선','KCAC',0,'KCAC','{}',datetime('now'));

-- 1.0ver-final부터 개발용 기본 관리자(관리자 / 01000000000)는 생성하지 않습니다.
-- 실제 관리자/대회팀장은 /registry/ 엑셀 등록 또는 Cloudflare 환경변수(KCL_ADMIN_NAME/KCL_ADMIN_PHONE)로 등록하세요.
