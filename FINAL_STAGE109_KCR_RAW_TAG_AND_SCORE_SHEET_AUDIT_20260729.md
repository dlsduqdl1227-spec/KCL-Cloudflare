# Stage 109 KCR 스마트태그 및 수기 평가표 검수 보고서

## 1. 기준 자료

- 최신 규정집: `@2026_KCR_룰북(수정완료)@_(260729).pdf`
- 기존 예선 평가표: `KCL_2026_KCR_PRELIMINARY_score_sheet_CLEAR_FINAL_v2.pdf`
- 기존 결선 평가표: `KCL_2026_KCR_FINAL_score_sheet_CLEAR_FINAL_v2.pdf`
- 적용 범위: KCR Flavor 스마트태그, KCR 예선·결선 수기 평가표

## 2. 코드 수정

- Flavor 보완 표현에서 `생두 / Raw` 태그와 저장 ID `flavor_improvement_raw`를 제거했다.
- KCR 태그 수는 139개에서 138개로 변경됐다.
- 항목별 태그 수는 Flavor 70, Mouthfeel 18, Acidity 15, Sweetness 14, Aftertaste 21이다.
- 태그 선택 제한, 선택 순서, 점수 독립성, 자동 코멘트 보호, 검수·디브리핑 ID 변환 로직은 변경하지 않았다.
- 회귀 테스트에서 `생두` 표시명과 `flavor_improvement_raw` ID의 재유입을 차단한다.

## 3. 수기 평가표 수정

- 기존 2페이지 A4 구조, 컵 정보, 0-5점 및 0.2점 눈금, 점수 기록칸, 컵 코멘트 영역을 유지했다.
- 최신 규정에 맞춰 평가 순서를 `Flavor -> Aftertaste -> Acidity -> Sweetness -> Mouthfeel -> Overall`로 변경했다.
- `Body(바디)`를 `Mouthfeel(마우스필)`로 변경했다.
- `Sweetness`를 네 번째 항목으로 이동하고 공식 집계 `x2`를 명확히 표시했다.
- 기존 10분·15분·20분 분리 안내를 제거했다.
- `물 붓기 10분 경과 후 지정 순서로 평가, 30분 내 모든 평가 종료`로 진행 기준을 수정했다.
- 예선과 결선 양식은 라운드명만 다르고 평가 구조는 동일하다.

## 4. 생성 파일

- `output/pdf/KCL_2026_KCR_PRELIMINARY_score_sheet_CLEAR_FINAL_v3.pdf`
- `output/pdf/KCL_2026_KCR_FINAL_score_sheet_CLEAR_FINAL_v3.pdf`

## 5. 검증 결과

- `npm test`: 통과
- JavaScript 문법 검사: 통과
- KCR 태그 총 138개 및 항목별 개수: 통과
- `생두 / Raw` 최종 태그 미포함: 통과
- PDF 페이지 수: 각 2페이지
- PDF 용지: A4
- PDF 평가 항목 순서: 통과
- PDF `Body/바디` 잔존 여부: 없음
- PDF 기존 15분·20분 평가 안내 잔존 여부: 없음
- PDF Sweetness x2: 정상
- PDF 시각 검수: 글자 잘림, 표 겹침, 깨진 한글 없음

## 6. 최종 판단

KCR 스마트태그와 예선·결선 수기 평가표 변경 범위는 배포 가능 상태다. 운영 D1 백업과 배포 전후 데이터 건수 확인 후 GitHub와 Cloudflare Pages에 배포한다.
