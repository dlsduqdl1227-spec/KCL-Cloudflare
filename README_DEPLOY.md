# KCL Cloudflare MVP 배포 가이드

이 문서는 기존 Google Apps Script 기반 KCL 평가 시스템을 Cloudflare Pages + Workers + D1로 옮기는 1차 MVP 배포 절차입니다.

## 1. 전체 구조

- `public/`: 기존 `evaluation.html`, `debriefing.html`, `camera.html`을 Pages 정적 파일로 배치합니다.
- `src/client/rpc-client.js`: 기존 `google.script.run.withSuccessHandler(...).functionName(...)` 호출을 `/api/rpc`로 연결하는 호환 레이어입니다.
- `src/worker/`: Cloudflare Worker API와 RPC whitelist입니다.
- `src/worker/domain/`: 점수 계산, 순위, 코멘트 자동생성 로직입니다.
- `src/worker/db/schema.sql`: D1 테이블 정의입니다.
- `scripts/`: Google Sheets CSV를 D1 SQL로 바꾸고 다시 CSV로 백업하는 도구입니다.

## 2. Google Apps Script/Google Sheets 제거 이유

대회 당일 제출, 검수, 순위 계산이 Apps Script 실행 시간, 동시 실행 제한, Google Sheets 행/컬럼 변형에 의존하면 장애 가능성이 큽니다. D1은 제출 데이터를 명시적 테이블에 저장하고, Worker가 API와 계산 로직을 담당하므로 운영 핵심에서 GAS와 Sheets를 제거할 수 있습니다.

## 3. GPT/OpenAI API를 사용하지 않는 이유

코멘트 자동생성은 대회 점수, 스마트태그, 강도, 시간 감점, 실격 여부를 기준으로 한 규칙 기반 템플릿입니다. 외부 AI API를 쓰지 않으면 비용, 응답 지연, 네트워크 장애, 개인정보 전송 위험을 줄일 수 있습니다.

## 4. Cloudflare 계정 준비

1. Cloudflare 계정을 만듭니다.
2. Workers & Pages 메뉴를 활성화합니다.
3. 결제 수단이 필요한 플랜을 사용할 경우 사전에 등록합니다.

## 5. GitHub 저장소 생성

1. GitHub에 새 저장소를 만듭니다.
2. 이 `kcl-cloudflare/` 폴더 내용을 저장소에 올립니다.
3. Cloudflare Pages에서 해당 저장소를 연결합니다.

## 6. Wrangler 설치

```bash
npm install
npx wrangler login
```

## 7. D1 DB 생성

```bash
npx wrangler d1 create kcl-db
```

출력된 `database_id`를 `wrangler.toml`의 `database_id`에 넣습니다.

## 8. wrangler.toml 설정

`wrangler.toml`에서 아래 값을 확인합니다.

- `name`
- `main`
- `assets.directory`
- `d1_databases.database_name`
- `d1_databases.database_id`

## 9. schema.sql 적용

로컬:

```bash
npm run db:schema
```

원격:

```bash
npm run db:schema:remote
```

## 10. 기존 Google Sheets를 CSV로 내보내기

Google Sheets에서 각 탭을 열고 `파일 > 다운로드 > 쉼표로 구분된 값(.csv)`을 선택합니다.

필수 CSV:

- `Config.csv`
- `운영탭.csv`
- `선수등록.csv`
- 대회별 점수 탭 CSV: `KCR.csv`, `KCAC.csv`, `KBC.csv`, `MOB.csv`, `IKRC.csv`, `MOC.csv`, `KTCC.csv`

## 11. CSV를 D1로 import

CSV 폴더를 준비한 뒤:

```bash
node scripts/convert-sheet-csv-to-d1.js ./csv migration_insert.sql migration_report.json
node scripts/import-csv-to-d1.js migration_insert.sql
```

원격 DB로 넣을 때:

```bash
node scripts/import-csv-to-d1.js migration_insert.sql --remote
```

`migration_report.json`에 누락, `__META__`, 알 수 없는 시간/행 정보가 기록됩니다.

## 12. SOLAPI 키 secret 등록

브라우저에 SMS 키를 넣지 않습니다. Worker secret으로 등록합니다.

```bash
npx wrangler secret put SOLAPI_API_KEY
npx wrangler secret put SOLAPI_API_SECRET
npx wrangler secret put SOLAPI_FROM
```

`SOLAPI_FROM`은 하이픈 없는 발신번호입니다.

## 13. 로컬 실행

```bash
npm run dev
```

브라우저에서:

- `http://localhost:8787/`
- `http://localhost:8787/debriefing/`
- `http://localhost:8787/camera/`

## 14. 배포

```bash
npm run deploy
```

Cloudflare Pages로 연결해 운영할 경우 Pages 빌드 산출물은 `public/`입니다. Worker static assets 설정도 포함되어 있습니다.

## 15. 평가 화면 테스트

1. `/` 접속
2. 운영자 로그인
3. 대회 선택
4. 참가자 목록 로드
5. 평가 제출
6. D1 `submissions`, `submission_values` 저장 확인

## 16. 검수 화면 테스트

1. 팀장 또는 관리자 로그인
2. 검수 목록 열기
3. 제출 행 상태를 `검수완료`로 변경
4. `review_events` 기록 확인

## 17. 순위 화면 테스트

1. 관리자 또는 팀장 로그인
2. 순위 화면 열기
3. D1 `submissions` 기반 집계가 표시되는지 확인
4. 동점/실격 세부 검증은 `tests/ranking.test.ts`와 실제 fixture로 보강합니다.

## 18. 디브리핑 OTP 테스트

1. `competitions.debriefing_enabled = 1` 확인
2. `/debriefing/` 접속
3. 선수 이름/연락처 입력
4. SOLAPI SMS 수신 확인
5. OTP 검증 후 `debrief_tokens` 생성 확인

## 19. 카메라 테스트

iPhone Safari:

- HTTPS 배포 URL에서 `/camera/` 접속
- 카메라 권한 허용
- 후면 카메라 실행 확인
- 캡처/가이드 조정/다운로드 확인

Android Chrome:

- HTTPS 배포 URL에서 `/camera/` 접속
- 권한 허용
- 후면 카메라와 캔버스 조작 확인

## 20. 대회 당일 체크리스트

- Cloudflare 배포 URL 접속 확인
- D1 원격 DB schema 적용 확인
- 운영자 로그인 2명 이상 확인
- 각 대회 제출 1건 테스트
- 검수완료 상태 변경 테스트
- 순위 화면 테스트
- OTP SMS 테스트
- 카메라 페이지 HTTPS 권한 테스트
- CSV 백업 파일 최신화

## 21. 장애 발생 시 대응

- Worker 오류: Cloudflare Logs 확인
- SMS 실패: `sms_logs`와 SOLAPI 콘솔 확인
- 로그인 실패: `operators`, `operator_permissions`, phone hash 확인
- 데이터 누락: `migration_report.json` 확인
- 순위 이상: 원본 CSV와 `submissions.raw_json` 비교

## 22. CSV 백업/복원

백업:

```bash
node scripts/export-d1-to-csv.js d1-export --remote
```

복원:

```bash
node scripts/convert-sheet-csv-to-d1.js ./d1-export restore.sql restore_report.json
node scripts/import-csv-to-d1.js restore.sql --remote
```

## 23. 기존 Apps Script와 병행 테스트

1. 기존 GAS URL과 Cloudflare URL을 둘 다 열어 같은 테스트 데이터를 입력합니다.
2. 총점, 감점, 실격, 검수상태, 순위 결과를 비교합니다.
3. 차이가 있으면 원본 CSV, `raw_json`, domain scoring test fixture를 함께 보정합니다.
4. 운영 전환 전 최소 한 번은 실제 대회별 샘플 데이터로 비교합니다.

## 24. 최종 전환일 절차

1. Google Sheets 최종 CSV export
2. D1 원격 DB 초기화 또는 신규 DB 생성
3. schema 적용
4. CSV 변환 및 import
5. 운영자 로그인 테스트
6. 제출/검수/순위/OTP 테스트
7. 기존 Apps Script URL 공지 중단
8. Cloudflare URL을 공식 운영 URL로 공지

## 25. 1차 MVP 제한사항

- 서버 PDF 생성은 2차 구현 예정입니다. 현재 `createRankingDetailPdf`, `createDebriefPdfFromPayload`는 브라우저 인쇄 사용 안내를 반환합니다.
- 검수 목록과 순위 API는 D1 표준 컬럼 중심으로 동작합니다. 대회별 동적 평가 컬럼 전체 노출은 CSV import header mapping 확장 후 보강해야 합니다.
- IKRC Seed to Cup, IKRC/MOB 켈리브레이션 상세 API는 테이블 구조와 RPC TODO 응답까지 준비되어 있습니다.
- 관리자 UI에서 계정/대회 설정을 직접 수정하는 API는 2차 구현 예정입니다.
