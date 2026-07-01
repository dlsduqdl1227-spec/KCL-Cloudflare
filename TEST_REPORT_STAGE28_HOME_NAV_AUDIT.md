# TEST REPORT STAGE28 - HOME NAVIGATION / UI AUDIT

## 목적
- 상단 `홈` 버튼 클릭 시 `/admin/` 또는 `KCL 개발·관리자` 화면으로 이동하는 문제 점검
- Stage26 기준 기능 유지 여부 확인
- PDF 디자인은 별도 시안으로 분리하여 선택 후 반영 예정

## 수정 사항
1. `public/assessment/index.html`
   - `goRootHome_()`를 항상 `/`로 이동하도록 수정
   - `isAdminCenterEntry_()`는 실제 `?admin=1` 진입 여부만 판단하도록 수정
   - 관리자 권한이라는 이유만으로 홈 버튼이 `/admin/`으로 이동하지 않도록 수정

2. `public/debriefing/index.html`
   - `from=admin` 파라미터가 있어도 상단 `홈` 버튼은 항상 `/`로 이동하도록 수정

3. 사용자 노출 문구 정리
   - `KCL 개발·관리자` -> `KCL 관리자`
   - `개발 / 관리자 로그인` -> `관리자 로그인`
   - 메인 홈의 `개발 / 관리자` 버튼 -> `관리자`

## 점검 결과
- `/assessment/` 상단 홈 버튼: `/` 이동 기준 확인
- `/assessment/?admin=1` 상단 홈 버튼: `/` 이동 기준 확인
- `/debriefing/` 상단 홈 버튼: `/` 이동 기준 확인
- `/debriefing/?from=admin` 상단 홈 버튼: `/` 이동 기준 확인
- 관리자 전용 진입 버튼은 메인 홈의 `관리자` 버튼으로만 분리 유지

## 문법 검사
- `functions/api/rpc.js`: PASS
- `functions/api/health.js`: PASS
- `public/admin/index.html` inline script: PASS
- `public/assessment/index.html` inline script: PASS
- `public/camera/index.html` inline script: PASS
- `public/debriefing/index.html` inline script: PASS
- `public/registry/index.html` inline script: PASS

## ZIP 무결성
- `unzip -t kcl-assessment-1.0ver-security-stage28-home-pdf-design-audit.zip`: PASS

## 남은 선택 사항
- PDF 디자인은 아직 코드에 강제 반영하지 않음
- 별도 디자인 시안 PDF에서 A/B/C/D 중 선택 후, 해당 스타일을 순위 PDF와 개별 디브리핑 PDF에 적용 예정
