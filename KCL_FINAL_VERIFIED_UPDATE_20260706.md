# KCL 대회용 웹앱 최종 검수 업데이트

작성일: 2026-07-07  
대상 폴더: `C:\Users\user\Documents\Code 이전(새배포)\kcl-cloudflare`  
근거 자료: 사용자가 제공한 KCR, KCAC, MOC, MOB, KTCC, KBC, IKRC 2026 규정집 PDF

## 1. 최종 반영 요약

기존 화면 틀은 유지하면서 대회 운영 중 바로 문제가 될 수 있는 라운드 선택, 참가자 번호 호출, 점수 저장, 순위 집계, 로그인 fallback을 보강했습니다.

특히 대회별 라운드 구조를 다시 맞췄습니다.

| 대회 | 최종 라운드 구조 |
|---|---|
| KCR | 예선, 결선 |
| KCAC | 예선, 결선 |
| MOC | 예선, 본선, 결선 |
| MOB | 예선, 결선 |
| KTCC | 예선, 결선 |
| KBC | 예선, 본선, 결선 |
| IKRC | 예선, 결선 |

## 2. 수정된 주요 문제

### 라운드 구조 불일치

MOB, KCAC, KCR, IKRC, KTCC처럼 본선이 없는 대회에서 과거 설정값이나 화면 옵션 때문에 `본선`이 섞일 수 있던 부분을 정리했습니다.

- MOB 관리자 라운드 옵션을 `예선`, `결선`으로 제한했습니다.
- 서버 공통 라운드 정규화 함수를 추가해 본선이 없는 대회는 `본선/main` 입력이 들어와도 운영상 `결선`으로 처리되게 했습니다.
- MOC, KBC는 규정대로 `예선`, `본선`, `결선`을 유지했습니다.

### 라운드별 시간 기준 오류 가능성

KBC, MOC, MOB는 라운드에 따라 제한 시간이 달라집니다. 서버 저장/집계 경로에서 라운드명이 잘못 들어오면 예선 기준으로 계산될 위험이 있었습니다.

- KBC: 예선 7분, 본선/결선 10분 기준 반영
- MOC: 예선 5분, 본선/결선 6분 기준 반영
- MOB: 예선 10분, 결선 15분 기준 반영

### 참가자 번호 호출 오류 가능성

참가자 배정 API가 라운드와 무관하게 예선 컵 번호를 우선 사용할 수 있었습니다.

- 예선은 `prelim_cup_no`
- 본선은 `main_cup_no`
- 결선은 `final_cup_no`

현재 라운드 기준으로 참가자 번호를 불러오게 수정했습니다.

### 점수 저장 라운드 불일치

프론트에서는 결선처럼 입력했는데 서버 저장값은 `본선` 등으로 남을 수 있던 문제를 막았습니다.

- `submitScores()` 저장 시 서버 정규화 라운드를 사용합니다.
- 반환값의 `round`도 실제 저장 라운드와 일치하도록 맞췄습니다.

### 순위 집계 오류 가능성

기존 순위 API는 모든 라운드를 섞어 조회하거나 참가자별 최대 점수만 보는 구조가 있어, 대회별 집계 방식과 맞지 않을 수 있었습니다.

- 현재 라운드만 조회합니다.
- 같은 참가자/심사위원/역할의 재제출은 최신 제출값 기준으로 묶습니다.
- KBC, IKRC, KCR은 평균 기준으로 집계합니다.
- KCAC, MOB는 합산 기준으로 집계합니다.
- MOC, KTCC는 현재 라운드 최신 제출 기준으로 집계합니다.
- MOB/IKRC 캘리브레이션 제출은 순위에서 제외합니다.

### 실격값 처리 오류

`disqualified: "N"` 같은 정상 문자열이 JavaScript에서 truthy로 처리되어 실격처럼 저장될 수 있던 위험을 수정했습니다.

- `Y`, `DQ`, `실격`, `true`, `1`만 실격으로 처리합니다.
- `N`, `정상`, `false`, `0`은 정상으로 처리합니다.

### MOB 총점 저장 안정화

MOB 제출 배열에서 시간감점/경기시간이 총점으로 잘못 해석될 수 있던 부분을 막았습니다.

- 프론트에서 MOB `extraFields["총점"]`을 명시적으로 전송합니다.
- 서버는 `최종점수`, `총점` 같은 명시 필드를 우선 사용합니다.

### 동점 기준 복원

순위 API가 제출 raw data만으로 동점 기준을 복원할 때 일부 평가 항목명이 빠질 수 있었습니다.

- IKRC 평가 항목 헤더 복원 보강
- MOB 센서리/테크니컬/창작 항목 헤더 복원 보강
- KBC/MOC/KTCC는 기존 extraFields 구조 유지

### 로그인 405 및 기존 assets 로그인 보존

사용자가 기존에 `public/assets`에 둔 엑셀 로그인 파일 방식이 사라지지 않도록 fallback을 추가했습니다.

- `/api/gas` 로그인 실패 시 `/api/rpc`로 자동 우회합니다.
- `/api/rpc`도 막히거나 DB 계정에서 찾지 못하면 마지막으로 `public/assets`의 로그인 파일을 읽습니다.
- 기본 탐색 파일명: `operators.xlsx`, `login.xlsx`, `operator_accounts.xlsx`, `운영탭.xlsx`, `로그인.xlsx`, `운영자.xlsx`
- CSV/JSON도 같은 이름으로 지원합니다.
- `.xlsx` 파서는 외부 CDN 의존도를 줄이기 위해 `public/client/vendor/xlsx.full.min.js`로 로컬 포함했습니다.
- 다른 파일명은 `window.KCL_STATIC_LOGIN_ASSET = "/assets/파일명.xlsx";`로 지정할 수 있습니다.

확인된 사실: 현재 로컬 프로젝트에는 실제 운영용 로그인 엑셀 파일이 포함되어 있지 않았습니다. 따라서 새 패키지에 엑셀 파일을 임의로 넣거나 덮어쓰지 않았습니다.

## 3. 수정 파일

- `public/index.html`
- `public/client/rpc-client.js`
- `public/client/vendor/xlsx.full.min.js`
- `public/assets/README_KEEP_ASSETS.md`
- `src/client/api.js`
- `src/client/rpc-client.js`
- `src/worker/domain/scoring/common.ts`
- `src/worker/domain/scoring/kbc.ts`
- `src/worker/domain/scoring/mob.ts`
- `src/worker/domain/scoring/moc.ts`
- `src/worker/domain/ranking/tieRules.ts`
- `src/worker/domain/ranking/compareRankingRows.ts`
- `src/worker/routes/auth.ts`
- `src/worker/routes/rpc.ts`
- `src/worker/routes/participants.ts`
- `src/worker/routes/scores.ts`
- `src/worker/routes/rankings.ts`
- `tests/scoring.test.ts`
- `tests/submission.test.ts`

## 4. 검증 결과

실행한 검증:

```bash
npm.cmd test
npm.cmd run typecheck
npm.cmd run deploy -- --dry-run
node --check public/client/rpc-client.js
node --check src/client/rpc-client.js
```

결과:

- 테스트 파일 4개 통과
- 테스트 16개 통과
- TypeScript 타입체크 통과
- Cloudflare Worker dry-run 통과
- D1 바인딩 확인: `DB: kcl-db`
- 로그인 래퍼 JS 문법 검사 통과

참고: dry-run에서 Wrangler 3.114.17이 최신 major 버전보다 낮다는 경고가 표시됩니다. 현재 번들 생성과 dry-run은 성공했지만, 실제 배포 PC에서는 Wrangler 버전 고정 또는 사전 업데이트 여부를 운영 일정에 맞춰 결정하는 것이 좋습니다.

## 5. 배포 전 확인 사항

- 기존 GitHub 저장소가 이미 있다면 `KCL_MINIMAL_UPDATE_20260707` 패키지만 올리는 것을 권장합니다.
- 클린 배포 패키지를 사용할 경우 기존 `public/assets` 로그인 엑셀 파일을 반드시 다시 넣어야 합니다.
- `HTTP 405`가 계속되면 Cloudflare Pages 정적 배포가 아니라 `wrangler.toml`이 포함된 Worker 배포인지 확인해야 합니다.
- 원격 D1 DB에 최신 스키마가 반영되어 있는지 확인해야 합니다. 이번 수정은 새 DB 컬럼을 요구하지 않습니다.

## 6. 남은 운영 확인 항목

코드 검수 범위를 넘어 실제 운영 방식 확인이 필요한 항목입니다.

- KCR 결선의 공식 순위 산정식이 평균/분포 기반 표현 외에 별도 공식 운영 방식으로 확정되어 있는지
- KTCC 결선 마지막 라운드의 세부 미션별 입력 UI가 추가로 필요한지
- 실제 `public/assets` 로그인 엑셀 파일명이 기본 탐색 목록과 다른지

위 항목을 제외하면 예선/본선/결선 라운드 구조, 시간 기준, 정상/실격 저장, 참가자 번호 호출, 기본 순위 집계, 로그인 fallback은 이번 업데이트에 반영했습니다.
