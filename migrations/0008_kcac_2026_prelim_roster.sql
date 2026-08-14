-- 2026 KCAC 예선 확정 타임테이블(2026-09-03) 22명 반영.
-- 참가자 기본정보와 번호만 교정하며 기존 점수 데이터는 변경하지 않는다.

INSERT INTO participants (
  competition_code, name, affiliation, phone, unique_no, prelim_cup_no,
  main_cup_no, final_cup_no, cup_no, sample_no, team_name, team_no,
  extra_json, created_at, updated_at
)
SELECT
  'KCAC', '오수진', '코알라커피아카데미', '', '8', '8',
  '', '', '', '', '', '',
  '{"예선참가번호":"8","원본시트":"KCAC 예선 타임테이블","원본행":14,"대회일":"2026-09-03","예선일":"2026-09-03","competitionDate":"2026-09-03","경연순서":"8","시연시간":"11:45~12:00","소속":"코알라커피아카데미"}',
  datetime('now'), datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM participants WHERE competition_code='KCAC' AND name='오수진'
);

WITH official(name, participant_no, affiliation, performance_time) AS (
  VALUES
    ('강혜림','1','아야커피랩','10:00~10:15'),
    ('임현아','2','아야커피랩','10:15~10:30'),
    ('정성윤','3','퍼스트바리스타제과제빵학원','10:30~10:45'),
    ('정해승','4','오닉스 커피 학원','10:45~11:00'),
    ('오하영','5','논현요리제과커피학원','11:00~11:15'),
    ('이은빈','6','카멜커피','11:15~11:30'),
    ('신가은','7','그리드커피로스터스, 어딕티브','11:30~11:45'),
    ('오수진','8','코알라커피아카데미','11:45~12:00'),
    ('조동운','9','커비커피','13:00~13:15'),
    ('김서정','10','챔프스페이스 커피로스터스','13:15~13:30'),
    ('최지원','11','M바리스타학원','13:30~13:45'),
    ('양미지','12','스튜디오 시크릿','13:45~14:00'),
    ('민혜원','13','늘봄커피작업실','14:00~14:15'),
    ('김상연','14','렉서스 커넥트투','14:15~14:30'),
    ('염정원','15','무소속','14:30~14:45'),
    ('김지은','16','소소래카페','14:45~15:00'),
    ('이지수','17','리플렉트커피 (늘봄 커피작업실)','15:00~15:15'),
    ('홍성문','18','프리퍼 카페','15:15~15:30'),
    ('박성환','19','소소래카페','15:30~15:45'),
    ('문갑수','20','파우사커피로스터스','15:45~16:00'),
    ('위지성','21','유어홈커피','16:00~16:15'),
    ('홍성현','22','리프레셔스','16:15~16:30')
)
UPDATE participants
SET
  unique_no = (SELECT participant_no FROM official WHERE official.name=participants.name),
  prelim_cup_no = (SELECT participant_no FROM official WHERE official.name=participants.name),
  affiliation = (SELECT affiliation FROM official WHERE official.name=participants.name),
  extra_json = json_set(
    CASE WHEN json_valid(extra_json) THEN extra_json ELSE '{}' END,
    '$."예선참가번호"', (SELECT participant_no FROM official WHERE official.name=participants.name),
    '$."대회일"', '2026-09-03',
    '$."예선일"', '2026-09-03',
    '$.competitionDate', '2026-09-03',
    '$."경연순서"', (SELECT participant_no FROM official WHERE official.name=participants.name),
    '$."시연시간"', (SELECT performance_time FROM official WHERE official.name=participants.name),
    '$."소속"', (SELECT affiliation FROM official WHERE official.name=participants.name)
  ),
  updated_at = datetime('now')
WHERE competition_code='KCAC'
  AND EXISTS (SELECT 1 FROM official WHERE official.name=participants.name);
