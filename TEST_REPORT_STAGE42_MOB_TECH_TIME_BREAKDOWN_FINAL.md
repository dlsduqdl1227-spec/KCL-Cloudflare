# TEST REPORT · STAGE42 MOB TECHNICAL / TIME BREAKDOWN FINAL

## 목적
MOB 테크니컬 심사에서 테크니컬 항목 점수와 시간 감점이 한 총점 안에 섞여 보이던 문제를 정리했다. 테크니컬 평가는 항목 합산 점수로 확인하고, 시간 감점은 별도 항목으로 표시·저장하며, 최종 총평가 반영점수는 규정 기준에 따라 합산점수에서 시간 감점을 차감한다.

## 반영 내용
- MOB 평가 화면에 `MOB 점수 반영 기준` 요약 카드 추가
  - 테크니컬 총점
  - 센서리 총점
  - 창작메뉴 총점
  - 시간 감점
  - 총평가 반영점수
- MOB 제출 데이터 extraFields에 아래 값을 별도 저장
  - `테크니컬 총점`
  - `센서리 총점`
  - `창작메뉴 총점`
  - `감점 전 합산`
  - `총평가 반영점수`
- MOB 검수 상세 화면에도 동일한 점수 반영 기준 카드 추가
- 검수 수정 시 파생값이 hidden input으로 함께 저장되도록 보강
- 총점/순위 계산은 기존 규정 기준 유지
  - 예선: 센서리 + 테크니컬 - 시간감점
  - 결선: 센서리 + 테크니컬 + 창작메뉴 - 시간감점
- 시간 초과 1~15초 -6점, 16~30초 -24점, 31~60초 -40점, 1분 초과 실격 기준 유지

## 테스트 시나리오
1. MOB 예선 테크니컬 심사위원
   - 테크니컬 3항목 합산 15점
   - 경기시간 10분 20초 입력
   - 화면 표시: 테크니컬 총점 15.0점 / 시간 감점 -24점 / 총평가 반영점수 0.0점
   - 제출 payload에 별도 필드 저장 확인

2. MOB 예선 센서리 심사위원
   - 센서리 6항목 합산 표시
   - 시간 감점 입력 영역 없음
   - 총평가 반영점수는 센서리 점수 기준으로 표시

3. MOB 결선 창작 메뉴
   - 테크니컬 + 센서리 + 창작메뉴 합산
   - 시간 감점 별도 표시
   - 총평가 반영점수는 합산점수 - 시간감점 기준 표시

4. MOB 검수 상세
   - 기존 저장 데이터의 항목 점수 기준으로 테크니컬 총점 재계산
   - 경기시간 수정 시 시간 감점과 총평가 반영점수 자동 갱신
   - 검수 저장 시 파생값 hidden input 저장 확인

## 문법 검사
- functions/api/rpc.js: PASS
- functions/api/health.js: PASS
- public/assets/kcl-api-shim.js: PASS
- public/assessment/index.html inline script: PASS
- public/debriefing/index.html inline script: PASS
- public/admin/index.html inline script: PASS
- public/registry/index.html inline script: PASS
- public/camera/index.html inline script: PASS
- public/index.html inline script: PASS

## ZIP 무결성
- PASS
