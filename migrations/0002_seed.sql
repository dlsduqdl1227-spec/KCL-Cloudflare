INSERT OR IGNORE INTO competitions (code, name, is_active, current_round, sheet_name, debriefing, sms_prefix, option_settings, updated_at) VALUES
('KBC','Korea Barista Championship',1,'예선','KBC',0,'KBC','{}',datetime('now')),
('KTCC','Korea Team Coffee Championship',1,'예선','KTCC',0,'KTCC','{}',datetime('now')),
('MOC','Master of Coffee',1,'예선','MOC',0,'MOC','{}',datetime('now')),
('MOB','Master of Brewing',1,'예선','MOB',0,'MOB','{}',datetime('now')),
('KCR','Korea Coffee Roasting',1,'예선','KCR',0,'KCR','{}',datetime('now')),
('IKRC','International Korea Roasting Championship',1,'예선','IKRC',0,'IKRC','{}',datetime('now')),
('KCAC','Korea Cup Tasters Art Championship',1,'예선','KCAC',0,'KCAC','{}',datetime('now'));

-- 배포 후 실제 관리자 이름/연락처로 수정하세요.
INSERT OR IGNORE INTO operators (account_type, name, affiliation, phone, access, team_group, role, created_at, updated_at)
VALUES ('ADMIN','관리자','KCL','01000000000','ALL','','관리자',datetime('now'),datetime('now'));
