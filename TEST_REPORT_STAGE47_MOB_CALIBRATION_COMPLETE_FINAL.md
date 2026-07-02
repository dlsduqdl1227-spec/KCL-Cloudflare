# Stage47 MOB Calibration Complete Final Test Report

## 수정 범위
- 대상: MOB 헤드 심사위원 켈리브레이션 목록/상세 화면
- 목적: 일반 심사위원 제출 데이터가 누적되어도 헤드 심사위원이 이미 검수한 참가자를 다시 보지 않도록 운영 혼선 최소화

## 반영 사항
1. MOB 평가 화면의 헤드 전용 버튼 문구를 `켈리브레이션 검수확인`으로 변경했습니다.
2. MOB 켈리브레이션 목록의 참가자별 액션 버튼 문구를 `검수확인`으로 변경했습니다.
3. MOB 켈리브레이션 상세 화면 상단에 `검수완료` 버튼을 별도 배치했습니다.
4. `검수완료` 처리 시 서버에 MOB_CALIBRATION_CHECK 세션을 저장하고, 이후 목록 조회에서 해당 참가자를 제외하도록 변경했습니다.
5. 검수완료 처리된 항목은 점수 데이터 자체를 삭제하지 않고, 목록 표시에서만 숨깁니다.
6. MOB 헤드 기준 평가 데이터는 기존과 동일하게 켈리브레이션 모드로 저장되며 순위·총점 집계에서 제외됩니다.

## 유지 사항
- MOB 센서리 역할: Sweetness, Flavor, Balance, Clean Cup, Mouthfeel, Professionalism, 결선 창작메뉴 센서리 항목만 표시
- MOB 테크니컬 역할: Pre-Service Station, Service Station, Post-Service Station, 결선 창작음료 테크니컬 항목, 경기시간, 시간감점, 총평가 반영점수 표시
- 센서리/테크니컬 역할 외 항목은 제출 시 빈값 저장 유지
- 기존 0점 저장 데이터도 역할 기준으로 검수 화면에서 필터링 유지

## 정적 검사
- functions/api/rpc.js: node --check 통과
- functions/api/health.js: node --check 통과
- public/assets/kcl-api-shim.js: node --check 통과
- public/assessment/index.html 내 script 추출 후 node --check 통과
- public/admin/index.html 내 script 추출 후 node --check 통과
- public/camera/index.html 내 script 추출 후 node --check 통과
- public/debriefing/index.html 내 script 추출 후 node --check 통과
- public/registry/index.html 내 script 추출 후 node --check 통과

## ZIP 검사
- 최종 ZIP 생성 후 unzip -t 무결성 검사 통과
