# TEST_REPORT_STAGE46_ROLE_MATCH_FINAL

## 목적
MOB 테스트 중 센서리 검수 화면에 테크니컬 점수 입력란이 표시된다는 제보를 기준으로, 평가 화면과 검수 화면의 역할별 항목 매칭을 다시 점검하고 수정했다.

## 수정 요약

### 1. MOB 역할 판정 보강
- `센서리 심사위원`, `센서리1`, `센서리 1`, `Sensory`, `Sensor`, `S1`, `S2` 등 센서리 역할을 폭넓게 감지하도록 보강했다.
- `테크니컬 심사위원`, `테크니컬`, `Technical`, `Tech`, `T1` 등 테크니컬 역할도 폭넓게 감지하도록 보강했다.
- 역할명이 모호하거나 기존 데이터에서 일반 `심사위원`으로 저장된 경우, 실제 저장된 점수 영역을 기준으로 센서리/테크니컬을 추론하도록 보강했다.

### 2. MOB 센서리 검수 화면 항목 정리
- 센서리 검수 화면에는 센서리 항목만 표시되도록 필터를 보강했다.
- 테크니컬 항목, 경기시간, 시간감점은 센서리 검수 화면에서 제외된다.
- 창작 메뉴 결선의 경우 센서리 역할에는 창작메뉴 센서리 항목만 추가 표시된다.

### 3. MOB 테크니컬 검수 화면 항목 정리
- 테크니컬 검수 화면에는 테크니컬 평가 항목, 경기시간, 시간감점, 총평가 반영점수 기준만 표시되도록 보강했다.
- 센서리 항목과 창작메뉴 센서리 항목은 테크니컬 검수 화면에서 제외된다.

### 4. MOB 저장 구조 안정화
- 센서리 심사위원 제출 시 테크니컬 항목을 `0`으로 저장하지 않고 빈값으로 저장하도록 변경했다.
- 테크니컬 심사위원 제출 시 센서리 항목을 `0`으로 저장하지 않고 빈값으로 저장하도록 변경했다.
- 기존에 0으로 저장된 데이터도 역할/점수 추론 필터로 검수 화면에서 잘못 노출되지 않도록 처리했다.

## 전체 대회 영향 검토
- KCR, IKRC: 센서리 단일 구조이므로 기존 평가/검수 항목 매칭 유지.
- MOC, KTCC: 스텝 운영형 정답수/가산점/종료시간 중심 검수 구조 유지.
- KBC: 예선/본선/결선 평가 항목과 검수 항목 매칭 유지.
- KCAC: 예선 2잔/결선 영역별 검수 구조 유지.
- MOB: 역할별 항목 표시 및 총점/시간감점 분리 표시 재보강.

## 정적 테스트
- functions/api/rpc.js: PASS
- functions/api/health.js: PASS
- public/assets/kcl-api-shim.js: PASS
- public/assessment/index.html inline script: PASS
- public/registry/index.html inline script: PASS
- public/debriefing/index.html inline script: PASS
- public/camera/index.html inline script: PASS
- public/admin/index.html inline script: PASS

## 결론
Stage45의 점수체계 보강은 유지하면서, MOB 센서리/테크니컬 검수 항목 혼입 가능성을 집중 수정했다. Stage46 사용 권장.
