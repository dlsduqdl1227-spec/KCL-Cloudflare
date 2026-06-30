KCL Assessment 1.0ver FIELD READY FINAL

이번 최종본 반영 사항
1. 검수/수정 상세 화면에 “수정완료” 버튼을 추가했습니다.
   - 검수완료 상태에서도 점수·코멘트를 수정한 뒤 명시적으로 저장할 수 있습니다.
   - “검수완료” 버튼은 미검수 데이터를 최종 검수완료 처리할 때 사용합니다.

2. KCR 디브리핑 점수 매칭을 보강했습니다.
   - Aftertaste(애프터테이스트) / Sweetness(스윗니스) ×2 항목을 디브리핑 점수표에서 정확히 표시하도록 수정했습니다.
   - 총점은 기존 산식 Flavor + Aftertaste + Acidity + Body + Sweetness×2 + Overall 기준을 유지합니다.

3. 디브리핑 코멘트/키워드 정리
   - 숫자만 들어간 코멘트(예: 3, 3.0, 3.0)는 선수 공개 화면에서 숨깁니다.
   - 스마트태그가 코멘트 영역에 중복 노출되지 않도록 수정했습니다.
   - 스마트태그 중복값을 제거하고 “채소같은 → 채소 같은”, “발효된 → 발효 계열”처럼 자연스럽게 표시합니다.
   - 기존 자동 생성 코멘트가 어색하게 누적된 경우, 점수/키워드 기반의 자연스러운 전문가형 종합 코멘트로 대체 표시합니다.

4. PDF 디자인 보강
   - 인쇄/PDF 저장 시 흐리게 보이는 로고는 숨기고, 대회명·선수명·공식 리포트 정보를 중심으로 정리했습니다.
   - A4 PDF에서 카드, 점수표, 평가 키워드, 종합 코멘트가 더 깔끔하게 보이도록 레이아웃을 조정했습니다.

5. 보안/배포 설정 확인
   - wrangler.toml에는 SOLAPI Key/Secret이 포함되어 있지 않습니다.
   - 개발용 기본 관리자값은 wrangler.toml에 포함되어 있지 않습니다.
   - keep_vars는 Cloudflare Pages에서 지원하지 않으므로 포함하지 않았습니다.

필수 교체 파일
- functions/api/rpc.js
- public/assessment/index.html
- public/debriefing/index.html
- wrangler.toml

배포 후 확인
1. Cloudflare 배포 Success
2. /assessment/ → 검수/수정 → 수정완료 버튼 확인
3. KCR 테스트 점수 제출 → 검수완료 → /debriefing/ OTP 인증
4. Aftertaste, Sweetness, 총점, 종합코멘트, PDF 저장 확인
5. /admin/ SMS 테스트 provider: solapi 확인
