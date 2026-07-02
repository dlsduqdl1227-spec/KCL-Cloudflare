# TEST REPORT - STAGE34 REVIEW EDIT / RECALC FINAL

## 목적
검수 상세 화면에서 `수정완료` 또는 `검수완료`를 눌렀는데 점수가 바뀌지 않는 치명 오류를 전면 점검하고 수정했다.

## 확인된 원인
기존 서버 로직은 검수 수정값을 `payload.extraFields`에 저장했지만, 원본 `rows[0].data` 값은 그대로 남아 있었다.
`extractExtra()`가 원본값과 수정값을 `기존값\n수정값` 형태로 합치면서, 총점 재계산 함수가 첫 번째 숫자인 기존값을 읽는 문제가 발생했다.

예: KCR Flavor 3점 -> 4점 수정
- 기존 저장 구조: `3\n4`
- 기존 총점 계산: 첫 번째 숫자 3을 사용
- 결과: 수정완료를 눌러도 총점이 기존 점수로 유지됨

## 수정 내용
1. `updateReviewRow()` 수정
   - 검수 수정 시 `payload.rows[0].data` 원본 배열까지 직접 갱신
   - `extraFields`에도 최신값 유지
   - 모든 대회 공통 적용

2. `extractExtra()` 수정
   - 검수 수정값은 원본값보다 우선하도록 변경
   - 기존 DB에 이미 `기존값\n수정값` 형태로 남은 데이터도 새 버전에서 최신값 기준으로 읽히게 보강

3. 저장 경합 방지
   - 자동 저장 중 수동 `수정완료/검수완료`를 누르면 자동 저장 완료 후 최종 저장하도록 보정
   - 이전 자동 저장이 늦게 도착해 최종 수정값을 덮어쓰는 위험 감소

4. 검수 상세 레이아웃 보정
   - 상단 `이전/홈` 고정 버튼과 검수 상세 제목이 겹치는 현상 완화
   - 검수 상세 sticky action 위치 조정

## 대회별 점수 재계산 테스트
아래는 원본값이 남아 있고 수정값만 extraFields에 있는 상황을 재현하여 테스트한 결과다.

- KCR: Flavor 3 -> 4 수정 후 총점 22로 재계산 확인
- MOC: 정답수 4 -> 6, 가산점 1 수정 후 총점 7 확인
- KTCC: Section1/2/3 정답수 및 가산점 수정 후 총점 8 확인
- IKRC: Flavor 3 -> 4 수정 후 가중치 반영 총점 33 확인
- KBC: Espresso Taste 1 -> 2 수정 후 x2 가중치 반영 총점 14 확인
- MOB: Flavor 1 -> 2 수정 후 총점 10 확인
- KCAC: 최종점수 10 -> 12 수정 후 총점 12 확인

## 문법 및 무결성 검사
- functions/api/rpc.js: node --check 통과
- functions/api/health.js: node --check 통과
- public/assessment/index.html 내장 스크립트: node --check 통과
- public/registry/index.html 내장 스크립트: node --check 통과
- public/debriefing/index.html 내장 스크립트: node --check 통과
- public/camera/index.html 내장 스크립트: node --check 통과
- public/admin/index.html 내장 스크립트: node --check 통과
- ZIP 무결성 검사 예정

## 운영 기준
- 수정완료: 수정값 저장 + 총점 재계산 + 미검수 상태 유지
- 검수완료: 수정값 저장 + 총점 재계산 + 검수완료 상태 반영
- 최종순위/최종정리 엑셀: 검수완료 데이터만 반영
