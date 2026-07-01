# TEST_REPORT_STAGE37_KBC_SERVICE_PROFESSIONALISM

## 수정 목적
KBC 예선 평가 항목에서 `프레젠테이션` 표현을 제거하고, 사용자가 요청한 기준대로 `서비스의 전문성`으로 변경했다.

## 반영 내용

### 1. KBC 평가 화면 문구 변경
- 변경 전: `Presentation & Service(프레젠테이션과 서비스 전문성)`
- 변경 후: `Service Professionalism(서비스의 전문성)`

### 2. KBC 검수/수정 화면 문구 변경
- KBC 검수 상세에서 해당 항목이 `Service Professionalism(서비스의 전문성)`으로 표시되도록 변경했다.
- 수정완료 시 기존 Stage34/35에서 보강한 점수 재계산 흐름은 유지했다.

### 3. KBC 결과/PDF/엑셀 헤더 변경
- KBC 결과 헤더도 `Service Professionalism(서비스의 전문성)` 기준으로 변경했다.
- 코멘트 헤더: `Service Professionalism 코멘트`
- 스마트태그 헤더: `Service Professionalism 스마트태그`

### 4. 기존 데이터 호환 유지
기존에 이미 저장된 데이터가 아래 구버전 키를 사용하고 있어도 총점 계산과 동점 처리에서 읽을 수 있도록 호환 키를 유지했다.

- `Presentation & Service(프레젠테이션과 서비스 전문성)`
- `Presentation & Service`
- `프레젠테이션과 서비스 전문성`

따라서 기존 테스트 데이터가 남아 있어도 KBC 점수 재계산에는 문제가 없도록 처리했다.

## 점검 내용

- `functions/api/rpc.js` 문법 검사 통과
- `functions/api/health.js` 문법 검사 통과
- `public/assets/kcl-api-shim.js` 문법 검사 통과
- `public/admin/index.html` 내장 스크립트 검사 통과
- `public/assessment/index.html` 내장 스크립트 검사 통과
- `public/registry/index.html` 내장 스크립트 검사 통과
- `public/debriefing/index.html` 내장 스크립트 검사 통과
- `public/camera/index.html` 내장 스크립트 검사 통과

## 운영 기준
Stage36 기능은 유지하고, KBC 항목명만 Stage37 기준으로 정리한 버전이다.
