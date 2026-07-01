# TEST REPORT STAGE15 FINAL QA

## 목적
대회 현장 사용 직전 기준으로 평가 저장, 총점 계산, 검수 반영, 순위 산출, 동점 처리, 모바일 사용 안정성을 최종 점검했다.

## 핵심 보강
1. 서버 기준 총점 재계산 추가
   - 클라이언트에서 넘어온 총점만 신뢰하지 않고, 서버에서 대회별 규정 컬럼을 기준으로 총점을 다시 계산한다.
   - KCR: Flavor + Aftertaste + Acidity + Body + Sweetness×2 + Overall
   - IKRC: Flavor×3 + Clean Cup×2 + Sweetness×2 + Acidity + Mouthfeel×2 + Seed to Cup 가산점
   - KCAC: 잔별 최종점수를 합산해 1명의 심사 제출 세트 점수로 저장
   - KBC: Presentation + Espresso 항목 + Signature 항목 + Machine - 시간감점
   - MOB: Technical / Sensory / Creative 항목 및 시간감점 반영
   - MOC: 정답수 + 가산점
   - KTCC: Section1~3 정답수 + Section3 가산점

2. 라운드 고정 저장
   - 평가 제출 시점의 current_round를 scores.round에 저장하도록 보강했다.
   - 이후 운영자가 라운드를 예선→본선→결선으로 변경해도 과거 점수가 새 라운드로 이동해 보이는 문제를 방지한다.

3. KCAC 합산 오류 방지
   - 다중 잔 제출값이 줄바꿈으로 합쳐질 때 숫자가 이어붙는 문제를 방지했다.
   - 예: 50점 + 40점이 5040점처럼 해석되지 않고 90점으로 계산된다.

4. MOB 순위 집계 보강
   - 테크니컬 심사위원과 센서리 심사위원이 각각 일부 항목만 입력하는 구조를 반영했다.
   - Technical 평균 + Sensory 평균 + Creative 평균 - 시간감점 방식으로 순위용 점수를 산출한다.
   - 단일 심사위원이 전체 항목을 입력하는 경우에도 기존 총점과 동일하게 계산된다.

5. 중복 제출 방지
   - 동일 심사위원, 동일 대회, 동일 라운드, 동일 참가자번호/컵번호/샘플번호/팀번호, 동일 payload가 20초 안에 재전송되면 중복 저장하지 않는다.
   - 네트워크 지연이나 더블클릭으로 같은 점수가 2번 저장되는 상황을 줄인다.

6. 동점 처리 보강
   - KCR: 총점 → Sweetness → Overall
   - IKRC: 총점 → Flavor → Sweetness → Mouthfeel
   - MOC / KTCC: 총점 → 종료시간 짧은 순
   - MOB: 총점 → Sensory → Technical → Creative → 경기시간
   - KCAC 예선: 총점 → Pattern Completion → Pattern Balance → 경기시간
   - KCAC 결선: 총점 → Sensory → Design → 경기시간
   - KBC: 총점 → Espresso → Presentation → Machine

## 실행 점검
- functions/api/rpc.js 문법 검사 통과
- public/assessment/index.html 내부 스크립트 문법 검사 통과
- public/registry/index.html 내부 스크립트 문법 검사 통과
- public/admin/index.html 내부 스크립트 문법 검사 통과
- public/debriefing/index.html 내부 스크립트 문법 검사 통과
- public/camera/index.html 내부 스크립트 문법 검사 통과

## 내부 계산 테스트
- KCR canonical total: 통과
- IKRC canonical total: 통과
- KCAC 2잔 합산 total: 통과
- MOC 정답수+가산점 total: 통과
- KTCC Section 합산+가산점 total: 통과
- MOB 시간감점 반영 total: 통과
- KCAC ranking aggregate: 통과
- MOB category-average ranking aggregate: 통과

## 운영 주의
- 순위는 검수상태가 `검수완료`인 점수만 반영한다.
- `미검수` 상태 점수는 기록에는 남지만 순위에는 반영하지 않는다.
- 실격 데이터는 순위표 하단에 `실격`으로 표시된다.
- 실제 배포 후에는 현장 데이터 입력 전, 각 대회별 테스트 참가자 1명으로 `제출 → 검수완료 → 순위 확인`만 마지막으로 확인하면 된다.
