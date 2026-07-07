# Stage76 점수/검수 백업 엑셀 보완 검수

## 반영 목적
- 선수등록용 엑셀과 운영계정등록용 엑셀 import 방식은 기존 그대로 유지합니다.
- 각 대회의 예선/본선/결선 점수와 검수 상태를 운영자가 대회별 엑셀로 즉시 내려받을 수 있게 보완했습니다.

## 핵심 판단
- `public/assets`의 엑셀 파일은 Cloudflare Pages 배포 후 정적 파일입니다. 서버가 이 파일을 실시간으로 수정하는 방식은 Pages/Functions 배포 구조에서 안정적이지 않습니다.
- 따라서 점수 제출과 검수 변경은 기존처럼 Cloudflare D1에 즉시 저장하고, 관리자/대회팀장이 버튼을 누르는 시점에 D1 원본 기준 엑셀을 생성하도록 처리했습니다.

## 변경 파일
- `functions/api/rpc.js`
  - `getScoreBackupReport` RPC 추가.
  - 대회별 전체 점수 행을 `미검수`, `검수완료`, `수정완료`, `수정요청` 등 검수 상태와 함께 반환합니다.
- `public/assessment/index.html`
  - 관리자 대회 카드에 `점수·검수 백업` 버튼 추가.
  - 순위/디브리핑 화면에 `점수·검수 백업 엑셀` 버튼 추가.
  - 엑셀 시트는 `안내`, `전체_점수검수`, 라운드별 `점수_라운드명`으로 제한해 시트 과다로 인한 혼란을 줄였습니다.

## 검증 결과
- `node --check functions/api/rpc.js` 통과.
- `public/assessment/index.html` inline script 문법 검사 통과.
- 로컬 Cloudflare Pages Functions `/api/health` 정상 응답 확인.
- 관리자 로그인 API 정상 확인.
- KCR 테스트 점수 제출 직후 백업 API에서 `미검수` 상태 포함 확인.
- 같은 행을 `검수완료`로 변경 후 백업 API에 즉시 반영되는 것 확인.
- KCR, KCAC, MOC, MOB, KTCC, KBC, IKRC 전체 대회 코드에서 `getScoreBackupReport` 정상 응답 확인.
- Chrome/Playwright로 `/assessment/` 로드, `downloadScoreBackupExcel` 함수 등록 및 순위 화면 버튼 존재 확인.

## 주의
- 이 백업 엑셀은 다운로드 시점의 D1 데이터를 파일로 생성하는 방식입니다. 정적 `assets` 폴더의 엑셀 파일을 서버가 실시간 덮어쓰는 방식이 아닙니다.
