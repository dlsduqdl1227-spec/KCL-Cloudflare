# TEST REPORT - Stage38 A4 Debriefing Layout Final

## 목적
선수 디브리핑 PDF가 4~5명의 평가 결과를 기준으로 A4 1장에 최대한 들어가도록 레이아웃을 압축하고, 긴 코멘트/이미지 데이터가 있는 경우에도 2장 이내에서 밀림 또는 잘림 없이 출력되도록 보강했다.

## 기준 버전
- Base: stage37-kbc-service-final
- 유지 사항:
  - Stage29 Option A Dark Glass PDF 톤
  - Stage34 검수 수정 후 점수 재계산 안정화
  - Stage35 검수 상세 UI 정리
  - Stage36 등록/권한 CRUD 정리
  - Stage37 KBC 예선 항목명 `서비스의 전문성` 반영

## 수정 파일
- `public/debriefing/index.html`
- `public/assessment/index.html`

## 주요 수정 내용

### 1. 선수 공개용 디브리핑 PDF 압축
- 인쇄 여백을 A4 기준 7mm로 조정.
- 헤더 높이 축소.
- 안내문 영역은 인쇄 시 숨김.
- 순위/공식점수 박스 높이 축소.
- 4~5명 평가 카드가 2열로 배치되도록 조정.
- 각 평가 카드 내부 점수 항목을 2열 소형 카드로 압축.
- 점수 미터는 인쇄 시 숨겨 공간을 절약.
- 스마트태그와 코멘트는 유지하되 폰트와 간격을 축소.
- 긴 코멘트는 카드 내부에서 자연스럽게 늘어나며, 내용이 많으면 다음 페이지로 넘어가도록 처리.

### 2. 관리자/팀장 상세 디브리핑 PDF 압축
- 상세 디브리핑 자료도 2열 카드 구조로 정리.
- 요약 영역과 상세 카드의 폰트, 간격, 여백을 축소.
- 이미지/서명 썸네일은 인쇄 시 작게 표시.
- 긴 코멘트는 잘리지 않도록 `overflow-wrap` 및 page-break 기준 보강.

### 3. 잘림/겹침 방지
- 결과 헤더의 인쇄용 레이블과 선수명이 겹치지 않도록 헤더 구조를 단순화.
- 카드 단위 `break-inside: avoid` 적용.
- 코멘트 영역은 긴 텍스트가 있을 때도 단어 단위로 줄바꿈되도록 보강.
- 기존 모바일 화면 레이아웃은 유지하고, 변경은 인쇄/PDF 영역 중심으로 제한.

## 샘플 렌더링 테스트
- KCR 예선 기준 심사위원 5명 평가 데이터 샘플 생성.
- 각 심사위원 카드에 6개 점수 항목 + 종합 코멘트 포함.
- PDF 렌더링 결과: A4 1페이지 출력 확인.
- 렌더 이미지 확인: 주요 내용 겹침/잘림 없음.

## 정적 검증
- `functions/api/rpc.js` 문법 검사 통과
- `functions/api/health.js` 문법 검사 통과
- `public/assets/kcl-api-shim.js` 문법 검사 통과
- `public/admin/index.html` inline script 검사 통과
- `public/assessment/index.html` inline script 검사 통과
- `public/camera/index.html` inline script 검사 통과
- `public/debriefing/index.html` inline script 검사 통과
- `public/registry/index.html` inline script 검사 통과
- ZIP 무결성 검사 통과

## 운영 참고
- 일반적인 4~5명 평가 + 짧은/중간 길이 코멘트는 A4 1장 기준으로 들어가도록 구성했다.
- 코멘트가 매우 길거나 KCAC 이미지/서명 자료가 많은 경우에는 2장까지 넘어갈 수 있다.
- 브라우저 PDF 저장 시 `배경 그래픽` 옵션을 켜야 Option A Dark Glass 톤이 정상 표시된다.
