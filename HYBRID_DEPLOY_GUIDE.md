# KCL Hybrid Deploy Guide

이 배포 방식은 Cloudflare를 화면 제공과 API 프록시로만 사용하고, 운영 데이터 저장과 백엔드는 기존 Google Apps Script와 Google Sheet에 둡니다.

## 1. 최종 구조

- Cloudflare Assets: 평가 화면, 디브리핑 화면, 카메라 화면, 관리자 안내 화면 제공
- Cloudflare Worker: `/api/gas` 프록시 제공
- Google Apps Script: 로그인, 참가자 조회, 점수 저장, 카메라 결과 저장, 디브리핑 조회
- Google Sheet: `Config`, `운영탭`, `선수등록`, `Scores_*` 유지
- D1 코드: 삭제하지 않고 `src/worker/db`, 기존 `/api/rpc` 아래 future migration 용도로 보존

## 2. Cloudflare 배포

```powershell
cd "C:\Users\user\Documents\Code 이전(새배포)\kcl-cloudflare"
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npx.cmd wrangler deploy --dry-run
npm.cmd run deploy
```

현재 운영 요청은 `/api/gas`를 사용합니다. `/api/rpc`와 D1 라우트는 보존되어 있지만 운영 메인 경로가 아닙니다.

## 3. GAS Web App 배포

1. 기존 Google Sheet를 엽니다.
2. `확장 프로그램` → `Apps Script`를 엽니다.
3. [gas/Code.gs](./gas/Code.gs)의 내용을 붙여 넣습니다.
4. Script Properties에 `GAS_SHARED_SECRET`을 등록합니다.
5. 이 스크립트가 Sheet에 바인딩되어 있지 않다면 `SPREADSHEET_ID`도 등록합니다.
6. 카메라 이미지를 Drive 파일로 저장하려면 `CAMERA_DRIVE_FOLDER_ID`를 등록합니다.
7. `배포` → `새 배포` → 유형 `웹 앱`을 선택합니다.
8. 실행 사용자: 본인
9. 액세스 권한: 필요한 운영 범위에 맞게 설정합니다. Cloudflare Worker에서만 호출할 예정이면 secret 검증이 필수입니다.
10. Web App URL을 복사합니다.

## 4. Google Sheet 구조

필수 탭:

- `Config`
  - `code`, `name`, `is_active`, `current_round`, `score_sheet_name`, `debriefing_active`, `sms_prefix`
- `운영탭`
  - `계정구분`, `이름`, `소속`, `연락처`, `담당대회`, `팀구분`, `역할`
- `선수등록`
  - `대회코드`, `이름`, `소속`, `핸드폰번호`, `고유번호`, `예선컵번호`, `본선컵번호`, `결선컵번호`, `샘플번호`
- `Scores_KBC`, `Scores_KCR`, `Scores_KCAC`, `Scores_MOB`, `Scores_MOC`, `Scores_KTCC`, `Scores_IKRC`

카메라 저장을 사용하면 `CameraResults` 탭이 없을 때 자동 생성됩니다.

## 5. Wrangler Secret 설정

브라우저에는 GAS URL과 secret이 노출되면 안 됩니다. 반드시 Worker secret 또는 비공개 env로 설정합니다.

```powershell
npx.cmd wrangler secret put GAS_WEBAPP_URL
npx.cmd wrangler secret put GAS_SHARED_SECRET
```

로컬 개발에서만 `wrangler.toml`의 `[vars]`에 `GAS_WEBAPP_URL`을 임시로 둘 수 있습니다. 운영 배포에는 secret 사용을 권장합니다.

## 6. API 동작

브라우저는 `/api/gas`만 호출합니다.

요청 예:

```json
{
  "action": "loginOperator",
  "payload": {
    "name": "심사위원 이름",
    "phone": "01012345678"
  }
}
```

Worker는 이 요청에 `GAS_SHARED_SECRET`을 붙여 GAS Web App으로 전달합니다. 브라우저 응답에는 secret과 Web App URL이 포함되지 않습니다.

주요 action:

- `ping`
- `getConfig`
- `loginOperator`
- `loginParticipant`
- `getParticipantAssignments`
- `saveScore`
- `saveCameraResult`
- `getDebriefing`

기존 화면 호환을 위해 `judgeLogin`, `submitScores`, `sendOTP`, `verifyOTP` 같은 기존 함수명은 `rpc-client.js`에서 위 action으로 변환됩니다.

## 7. 테스트 순서

1. Cloudflare Worker 빌드 검증

```powershell
npm.cmd run typecheck
npm.cmd test
npx.cmd wrangler deploy --dry-run
```

2. GAS 직접 ping

GAS Web App URL에 접속해 JSON 응답이 오는지 확인합니다.

3. Worker 프록시 ping

```powershell
curl https://<cloudflare-domain>/api/gas
```

응답의 `gasConfigured`가 `true`인지 확인합니다.

4. 평가 화면 로그인

- `/` 접속
- 운영탭의 이름과 연락처로 로그인
- 응답 실패 시 `운영탭` 연락처 형식과 secret 설정을 먼저 확인합니다.

5. 점수 저장

- 평가를 1건 제출합니다.
- 해당 `Scores_*` 시트에 행이 추가되는지 확인합니다.

6. 카메라 권한

- `/camera/` 접속
- iPhone Safari, Android Chrome에서 카메라 권한 허용
- 촬영 후 저장
- `CameraResults` 탭에 행이 추가되는지 확인합니다.

7. 디브리핑 조회

- `/debriefing/` 접속
- 선수등록의 이름과 연락처로 조회
- 해당 참가자의 점수 행이 반환되는지 확인합니다.

## 8. 장애 대응

- `/api/gas`가 `GAS_WEBAPP_URL is not configured`를 반환하면 Worker secret 누락입니다.
- GAS가 `Invalid shared secret`을 반환하면 Worker와 GAS Script Property의 `GAS_SHARED_SECRET` 값이 다릅니다.
- 로그인 실패는 대부분 Sheet 탭명, 헤더명, 전화번호 형식 문제입니다.
- 카메라 저장에서 이미지 URL이 비어 있으면 `CAMERA_DRIVE_FOLDER_ID`가 없거나 Drive 권한이 없는 상태입니다. 그래도 `CameraResults`에는 payload가 저장됩니다.

## 9. 운영 원칙

- Google Sheet가 운영 원본입니다.
- D1 import/export는 현재 운영 절차에서 사용하지 않습니다.
- 관리자 데이터 수정은 기존처럼 Google Sheet에서 진행합니다.
- Cloudflare는 화면 제공, secret 보호, GAS 프록시 역할만 담당합니다.
