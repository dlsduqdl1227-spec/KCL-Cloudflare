# KCL Assessment 1.0ver - Security Stage 7 Auth Recovery

- Stage 5/6 보안 강화 후 기존 브라우저 세션이 만료되거나 judgeToken이 누락되어 전체관리자/등록권한이 끊기는 문제를 수정했습니다.
- 모든 권한 API에서 token이 없거나 만료되면, actor의 이름+연락처를 D1 operators 테이블과 다시 대조해 최신 권한을 재발급합니다.
- D1에 실제 ADMIN / ALL / 관리자 행이 있는 계정만 전체관리자로 통과합니다.
- SOLAPI 키/시크릿은 코드에 포함하지 않습니다.

배포 후 /admin/에서 다시 로그인 또는 권한 새로고침을 실행하세요.

관리자 행 확인 SQL:

```sql
SELECT id, account_type, name, phone, access, role, team_group
FROM operators
WHERE phone = '네연락처숫자만'
ORDER BY id;
```

전체관리자 행이 없다면:

```sql
INSERT INTO operators
(account_type, name, affiliation, phone, access, team_group, role, created_at, updated_at)
VALUES
('ADMIN', '네이름', 'KCL', '네연락처숫자만', 'ALL', '', '관리자', datetime('now'), datetime('now'));
```

# KCL Assessment 1.0ver Security Stage 6

Stage 6는 Stage 5의 보안 강화 이후 일부 브라우저에 남아 있던 구 로그인 정보 때문에 전체관리자/등록권한이 없다고 표시되는 문제를 해결한 안정화 버전입니다.

## 핵심 수정
- 기존 localStorage 관리자 정보에 judgeToken이 없거나 만료된 경우, 서버가 이름/연락처를 D1 operators 테이블과 대조해 최신 권한을 다시 발급합니다.
- refreshAdminActor, getSystemStatus에서 최신 권한을 재검증하고, 성공 시 새 judgeToken을 재저장합니다.
- 등록·권한 관리 화면에서 권한 새로고침 실패 시 오래된 권한으로 계속 진입하지 않도록 처리했습니다.
- 통합 운영관리 화면에서도 권한 새로고침 실패 시 /admin/ 재로그인을 안내합니다.
- 기존 보안 헤더, Origin 검증, 요청 크기 제한, rate limit, 개발용 관리자값 제거 상태를 유지합니다.

## 배포 필수 파일
- functions/api/rpc.js
- public/admin/index.html
- public/registry/index.html
- public/assessment/index.html
- public/_headers
- wrangler.toml

## 배포 후 권장 순서
1. Cloudflare 배포 Success 확인
2. /admin/ 접속
3. “다시 로그인 / 권한 새로고침” 클릭
4. 실제 전체관리자 이름/연락처로 로그인
5. 등록·권한 관리 진입 확인
6. 통합 운영관리 진입 확인
7. SMS 테스트 provider: solapi 확인
