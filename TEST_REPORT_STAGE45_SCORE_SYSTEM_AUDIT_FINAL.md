# TEST REPORT · STAGE45 SCORE SYSTEM AUDIT FINAL

## 목적
대회별 총점 산출이 규정과 평가 화면 기준에 맞게 합산되는지 재검토하고, 총점 불일치 가능 지점을 보강했다.

## 기준 파일
- Base: Stage44 reset isolation rule audit final
- Output: Stage45 score system audit final

## 수정/보강 사항

### 1. KCAC 총점 산출 보강
- 기존 제출 데이터에 `소계`가 없는 경우, 서버가 `최종점수/총점` 값에 의존할 수 있었다.
- 이제 서버에서 원점수만 있어도 KCAC 예선/결선 원시 항목을 규정 배점으로 재계산한다.
- 예선: 패턴 완성도 20, 대칭과 균형 10, 표면 품질 5, 위치와 비율 5, 패턴 선명도 10 = 1잔 50점, 2잔 100점.
- 결선 패턴: 주제 표현력 10, 디자인 완성도 20, 표면 품질 5, 위치와 대칭 5, 작업 수행 완성도 10, 청결 10 = 60점.
- 결선 센서리: 맛의 균형 10, 질감 5, 프레젠테이션 5 = 1잔 20점, 2잔 40점.

### 2. KBC 동점 산출 보강
- KBC 순위 동점 기준에서 `Espresso Total`과 세부 에스프레소 원점수가 동시에 있을 때 중복 합산될 수 있는 위험을 제거했다.
- `Espresso Total`이 있으면 이를 우선 사용하고, 없을 때만 원점수 기준으로 `Taste & Design×2 + Clean Cup + Mouthfeel + Flavor`를 계산한다.

### 3. MOB 총점 산출 보강
- MOB는 테크니컬 총점, 센서리 총점, 창작메뉴 총점, 시간감점이 별도 필드로 저장될 수 있으므로 서버 재계산 시 해당 분리 필드도 안전하게 인식하도록 보강했다.
- 원시 항목이 있으면 원시 항목을 우선 계산하고, 원시 항목이 없으면 분리 저장 필드로 `테크니컬 + 센서리 + 창작메뉴 - 시간감점`을 산출한다.
- MOB 동점 산출에서 결선 창작음료 테크니컬 항목도 테크니컬 합산에 포함되도록 정리했다.

## 공식 테스트 케이스

| 대회 | 테스트 | 기대값 | 결과 |
|---|---:|---:|---|
| KCR | Flavor+Aftertaste+Acidity+Body+Sweetness×2+Overall | 28 | PASS |
| IKRC | Flavor×3+Clean Cup×2+Sweetness×2+Acidity+Mouthfeel×2 | 75 | PASS |
| IKRC | 위 점수 + Seed to Cup 3점 | 78 | PASS |
| KBC 예선 | 서비스+에스프레소+머신-시간감점 | 26 | PASS |
| KBC 본/결선 | 서비스+에스프레소+창작메뉴+머신 | 46 | PASS |
| MOB | 테크니컬 15점, 시간감점 24점 | 0 | PASS |
| MOB | 분리 필드: 테크니컬 15 + 센서리 24 + 창작 20 - 시간감점 6 | 53 | PASS |
| KCAC 예선 | 2잔 원점수 만점 재계산 | 100 | PASS |
| KCAC 결선 | 패턴 60 + 센서리 20 + 센서리 20 | 100 | PASS |
| MOC | 정답수 4 + 가산점 1 | 5 | PASS |
| KTCC | Section1 2 + Section2 2 + Section3 2 + 가산점 2 | 8 | PASS |
| KBC 동점 | Espresso Total 중복 합산 방지 | 18 | PASS |
| MOB 동점 | 창작음료 테크니컬 포함 | 20 | PASS |

## 정적 검사
- `functions/api/rpc.js`: PASS
- `functions/api/health.js`: PASS
- `public/assets/kcl-api-shim.js`: PASS
- `public/admin/index.html`: PASS
- `public/assessment/index.html`: PASS
- `public/camera/index.html`: PASS
- `public/debriefing/index.html`: PASS
- `public/registry/index.html`: PASS

## 최종 판단
코드/샌드박스 정적 검사 및 공식 계산 케이스 기준으로 총점 산출의 주요 불일치 위험을 보강했다.
배포 후 실제 운영 전에는 테스트 선수 1명으로 각 대회별 `평가 → 검수 수정 → 검수완료 → 순위 → 엑셀/디브리핑` 흐름을 확인하는 것을 권장한다.
