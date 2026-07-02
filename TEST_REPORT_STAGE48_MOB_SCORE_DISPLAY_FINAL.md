# Stage48 MOB Score Display Final Test Report

## 수정 범위
- 대상: MOB 평가 화면 / MOB 헤드 켈리브레이션 목록·상세 화면
- 목적: 센서리와 테크니컬의 점수 표시 구조를 실제 운영 의도에 맞게 조정

## 반영 사항
1. MOB 센서리 평가 화면의 상단 점수 영역에서 `센서리 평가항목`과 `센서리 반영점수`가 중복으로 나뉘어 보이지 않도록 수정했습니다.
2. MOB 센서리 점수 반영 기준 박스는 `센서리 반영점수`만 표시하도록 정리했습니다.
3. MOB 테크니컬 평가 화면은 `테크니컬 총점`, `시간감점`, `총평가 반영점수`를 분리 표시하도록 유지·보강했습니다.
4. MOB 켈리브레이션 상세 화면의 집계표도 역할별로 다르게 표시되도록 수정했습니다.
   - 센서리: `센서리 반영점수` 중심 표시
   - 테크니컬: `테크니컬 총점`, `시간감점`, `총평가 반영점수` 분리 표시
5. 서버의 MOB 켈리브레이션 응답에 `technicalTotal`, `sensoryTotal`, `creativeTotal`, `grossTotal`, `officialTotal`, `timePenalty`, `timeText`를 보강해 상세 화면에서 안정적으로 집계할 수 있도록 했습니다.
6. Stage47에서 추가한 `검수확인` 버튼명, `검수완료` 버튼, 검수완료 항목 목록 숨김 처리 흐름은 유지했습니다.
7. MOB 헤드 기준 평가는 기존과 동일하게 켈리브레이션 모드로 저장되며 순위·총점 집계에서 제외됩니다.

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
