# TEST REPORT — STAGE55 KCR EVALUATION-SCREEN CALIBRATION RESTORE FINAL

## 수정 목적
Stage53~54에서 KCR 켈리브레이션 진입 버튼이 관리자/대회 선택 흐름에 별도 노출되면서, 기존 운영 방식인 **KCR 평가 설정 화면 내부의 켈리브레이션 모드 체크 방식**과 달라진 문제를 복구했다.

## 최종 반영 사항

### 1. KCR 별도 켈리브레이션 진입 버튼 제거
- 대회 선택 화면의 `KCR 켈리브레이션 입력` 별도 버튼 제거
- 관리자 실행 카드의 `KCR 켈리브레이션 입력` 별도 버튼 제거
- `adminOpenKcrCalibration_` 직접 진입 함수 제거
- `goCalibration()`의 KCR 직접 진입 분기 제거

### 2. KCR 기존 평가 화면 선택 방식 복구
- KCR은 일반 `평가 시작`으로 진입
- KCR 컵 설정 화면에서 `켈리브레이션 모드` 체크박스로 선택
- 체크 시 제출 모드는 기존처럼 `켈리브레이션`으로 저장
- 순위·총점 집계 제외 로직 유지

### 3. 권한 흐름 유지
- KCR 켈리브레이션 체크박스는 KCR 헤드 심사위원, 대회팀장, 관리자 권한에서 표시
- 일반 KCR 평가자는 일반 평가 입력 흐름만 사용
- MOB / IKRC의 별도 헤드 켈리브레이션 흐름은 유지

### 4. 기존 Stage52~54 보완 사항 유지
- MOB 중복 점수/코멘트 참고 UI 숨김 유지
- 전체 대회 코멘트 참고 요약 숨김 유지
- MOB/IKRC 헤드 데이터 순위 혼입 방지 유지
- KCR 켈리브레이션 제출값 순위 제외 유지

## 검증 결과

### 문자열 검증
- `KCR 켈리브레이션 입력` 노출 문구 제거 확인
- `data-act="kcr-cal"` 관리자 버튼 제거 확인
- `adminOpenKcrCalibration_` 함수 제거 확인
- KCR 평가 설정 화면의 `cuppingCalibrationMode` 체크박스 유지 확인

### 문법 검사
- `functions/api/rpc.js` 통과
- `functions/api/health.js` 통과
- `public/assets/kcl-api-shim.js` 통과
- `public/assessment/index.html` 내부 스크립트 통과
- `public/admin/index.html` 내부 스크립트 통과
- `public/camera/index.html` 내부 스크립트 통과
- `public/debriefing/index.html` 내부 스크립트 통과
- `public/registry/index.html` 내부 스크립트 통과

## 결론
KCR 켈리브레이션은 다시 **관리자 모드 별도 버튼 방식이 아니라, KCR 평가 화면에서 체크박스로 선택하는 기존 방식**으로 복구됐다.
