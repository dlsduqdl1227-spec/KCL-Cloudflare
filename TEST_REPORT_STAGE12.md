# KCL Assessment Stage 12 Test Report

## 적용 내용

1. 관리자 로그인 3단계 인증
   - `/admin/` 관리자 홈 로그인 입력값을 `관리자 아이디 / 관리자 비밀번호 / 시크릿 코드`로 확장.
   - `/registry/` 등록·권한 관리 로그인 입력값도 동일하게 확장.
   - Cloudflare Functions `adminLogin` API를 `adminId, password, secretCode` 구조로 변경.
   - 시크릿 코드 기본값은 `5061`이며, 운영 환경에서는 `KCL_ADMIN_SECRET_CODE` 또는 `ADMIN_SECRET_CODE` Secret으로 변경 가능.
   - 기존 `KCL_ADMIN_PASSWORD`가 있으면 비밀번호로 사용하고, 없으면 기존 현장 호환을 위해 비밀번호 칸에 관리자 연락처를 입력하는 방식을 유지.

2. 통합 운영관리 스크롤 수정
   - `/assessment/?admin=1`의 `통합 운영관리`와 `대회 팀장` 화면을 독립 스크롤 컨테이너로 전환.
   - 마우스 휠, 터치 스크롤, 모바일 safe-area 조건에서 화면 하단 내용이 내려가지 않는 문제를 보정.
   - 평가 전체화면과 운영관리 화면의 스크롤 상태가 서로 섞이지 않도록 `body.kcl-admin-scroll-mode`를 추가.

3. 레이아웃 보강
   - 관리자 로그인 입력칸 3개가 PC/태블릿/모바일에서 가로 넘침 없이 배치되도록 보정.
   - 통합 운영관리 탭과 대회 카드가 모바일에서 겹치지 않도록 폭·줄바꿈·스크롤 규칙 추가.

## 실행한 검수

### 1. JavaScript 문법 검수

- `functions/api/rpc.js`: `node --check` 통과
- `/admin/`, `/registry/`, `/assessment/`, `/debriefing/`, `/camera/` inline script 추출 후 `node --check` 통과

### 2. 로직 모의테스트

Node VM + Mock D1 환경에서 아래 항목을 검수했습니다.

- 관리자 로그인
  - 잘못된 시크릿 코드 입력 시 로그인 차단 확인
  - `5061` 입력 시 전체 관리자 로그인 성공 확인
  - 성공 응답에 `ADMIN`, `ALL`, `judgeToken` 포함 확인

- KCR 순위 동점 처리
  - 총점 동점 상황에서 `Sweetness`가 높은 참가자가 상위 순위로 정렬되는지 확인
  - 동점 기준 라벨: `총점 → Sweetness → Overall`

- MOC 순위 동점 처리
  - 총점 동점 상황에서 종료 시간이 짧은 참가자가 상위 순위로 정렬되는지 확인
  - 동점 기준 라벨: `총점 → 종료시간 짧은 순`

결과: `PASS stage12: admin secret, KCR tie, MOC tie`

### 3. 브라우저 레이아웃/스크롤 검수

Chromium headless 환경에서 실제 CSS를 적용해 확인했습니다.

- `/admin/` 로그인 입력칸 3개 표시 확인
- `/registry/` 로그인 입력칸 3개 표시 확인
- PC 1365×900, 모바일 390×844, 태블릿 768×1024 기준 가로 넘침 없음 확인
- `/assessment/` 통합 운영관리 패널에 테스트 카드 28개를 삽입한 뒤 `pAdmin` 독립 스크롤 가능 여부 확인
- 마우스 휠 입력 후 `pAdmin.scrollTop` 증가 확인

결과: `PASS stage12 browser layout/scroll checks`

## 참고

- 실제 Cloudflare D1 원격 DB 배포 환경의 Secret 설정 여부는 이 로컬 패키지에서 직접 확인할 수 없습니다.
- 운영 배포 시 `KCL_ADMIN_SECRET_CODE=5061`을 명시하거나, 미설정 상태에서도 기본값 `5061`로 작동합니다.
- 관리자 비밀번호를 연락처가 아닌 별도 비밀번호로 고정하려면 Cloudflare Pages Secret에 `KCL_ADMIN_PASSWORD`를 추가하세요.
