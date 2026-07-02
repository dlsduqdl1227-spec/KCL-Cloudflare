# TEST_REPORT_STAGE32_REVIEW_STAFF_FINAL_EXPORT_AUDIT

## 점검 목적
MOC 스텝 검수 중 수정 버튼이 열리지 않고 검수완료만 가능한 문제, 검수완료 후 수정 점수가 최종 순위/엑셀에 반영되지 않을 수 있는 문제, 최종정리 엑셀에 미검수 데이터까지 포함되는 문제를 기준으로 전체 검수/수정/결과 흐름을 재점검했다.

## 수정 사항

### 1. MOC / KTCC 운영 스텝 검수 수정 권한 보강
- 기존: MOC, KTCC 검수 상세 수정은 관리자/대회팀장 중심으로 제한되어 있어 스텝이 본인 제출 건을 열어도 수정 입력이 제한될 수 있었다.
- 수정: MOC, KTCC는 심사위원 없이 스텝이 운영하는 현장 흐름을 반영하여, 운영진/스텝도 본인 제출 건에 한해 점수·시간·코멘트 수정 및 검수완료가 가능하도록 수정했다.
- 서버 목록 조회는 기존처럼 관리자/대회팀장은 전체, 심사위원/스텝은 본인 제출 건만 반환한다.

### 2. 제출자 식별값 저장 보강
- 기존: 일부 제출 payload에 제출자 연락처/역할 정보가 누락되면 이후 본인 제출 건 판별이 불안정할 수 있었다.
- 수정: 평가 제출 시 서버에서 로그인된 actor 기준으로 judgeName, judgePhone, operatorName, operatorPhone, role, actorType, teamGroup을 payload에 보강 저장한다.
- 목적: 스텝도 심사위원과 동일하게 본인 제출 건만 수정·검수하도록 안정화.

### 3. 검수완료 시 점수 반영 재점검
- updateReviewRow는 수정값을 payload.extraFields와 row.extraFields에 반영한 뒤, 서버 canonicalScoreForPayload_ 기준으로 총점을 재계산한다.
- MOC: 정답수 + 가산점 기준 재계산.
- KTCC: Section1/2/3 정답수 + Section3 가산점 기준 재계산.
- KCR/IKRC/KBC/MOB/KCAC도 기존 canonical 계산 로직 유지 확인.

### 4. 최종정리 엑셀 검수완료 데이터만 포함하도록 변경
- 기존: 순위는 검수완료 기준이지만, 점수 시트에 미검수 데이터도 포함될 수 있었다.
- 수정: 최종정리 엑셀의 라운드별 점수 시트와 검수완료 점수 시트 모두 검수완료 데이터만 포함한다.
- 안내 시트 문구도 “미검수 데이터는 다운로드 파일에 포함하지 않음”으로 변경했다.

## 전체 대회 체크 항목

### KBC
- 평가 제출 후 검수 목록 조회 가능.
- 본인 제출 건 검수/수정 가능.
- 서버 기준 총점 재계산 유지.
- 검수완료 데이터만 순위 및 최종정리 엑셀에 반영.

### KCR
- 블라인드 심사위원 화면 유지.
- 관리자/팀장 결과 화면 및 PDF에서는 선수명 표시 유지.
- 본인 제출 건 검수/수정 가능.
- Sweetness x2 서버 재계산 유지.

### MOC
- 스텝이 본인 제출 건을 열어 정답수/가산점/종료시간 수정 가능하도록 변경.
- 수정 후 검수완료 시 총점이 정답수+가산점 기준으로 재계산되도록 서버 로직 확인.
- 서명 저장 구조 유지.

### MOB
- Stage30 켈리브레이션 빈 목록 오류 수정 유지.
- 헤드 평가 순위 제외 유지.
- 일반 심사위원 제출 데이터 기반 켈리브레이션 목록/상세/확인 처리 유지.

### IKRC
- 켈리브레이션/Seed to Cup 기능 유지.
- Seed to Cup 가산점이 최종점수에 반영되는 구조 유지.
- 예선 블라인드 표시와 관리자/팀장 이름 표시 구분 유지.

### KCAC
- 이미지 압축 저장 유지.
- 예선 블라인드 표시 유지.
- 관리자/팀장 PDF/상세에서는 선수명 표시 유지.
- 검수완료 데이터만 결과에 반영.

### KTCC
- 스텝이 본인 제출 건을 열어 Section 정답수/시간 항목 수정 가능하도록 변경.
- Section3 정답수 2개일 때 가산점 자동 계산 유지.
- 팀 기준 결과 및 서명 저장 구조 유지.

## 정적/문법 검사
- functions/api/rpc.js: node --check 통과
- functions/api/health.js: node --check 통과
- public/assets/kcl-api-shim.js: node --check 통과
- public/assessment/index.html inline script: node --check 통과
- public/registry/index.html inline script: node --check 통과
- public/debriefing/index.html inline script: node --check 통과
- public/camera/index.html inline script: node --check 통과
- public/admin/index.html inline script: node --check 통과

## 결론
Stage32는 MOC/KTCC 스텝 검수 수정 권한, 검수완료 후 점수 재계산, 최종정리 엑셀 검수완료 데이터 제한을 반영한 안정화 버전이다.
