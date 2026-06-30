KCL Assessment 1.0ver - 대회 실사용 안정화 패치

적용 핵심
1. KCR/IKRC 다중 컵·샘플 제출 시 컵/샘플별로 분리 저장
2. 기존 제출 데이터의 data 배열을 대회별 공식 헤더로 복원해 디브리핑에 점수/코멘트 표시
3. 검수완료 데이터만 디브리핑 공개
4. 디브리핑 화면에서 관리자/운영자 이름 노출 제거
5. 디브리핑 화면에 검수완료 배지, 공식 점수, 평가 키워드, 코멘트 표시
6. SMS_PROVIDER가 dev로 돌아가지 않도록 wrangler.toml 정리

가장 먼저 교체할 파일
- functions/api/rpc.js
- public/debriefing/index.html
- wrangler.toml

주의
- wrangler.toml의 database_id는 현재 프로젝트 기준으로 들어가 있습니다.
- 다른 D1을 쓰는 경우 database_id만 해당 D1 값으로 바꾸세요.
- KCL_ADMIN_NAME / KCL_ADMIN_PHONE / KCL_ADMIN_AFFILIATION 개발용 기본값은 넣지 마세요.

검수/디브리핑 확인 순서
1. GitHub에 위 파일 교체 후 Commit
2. Cloudflare Pages 배포 Success 확인
3. /admin/에서 해당 대회 디브리핑 공개 ON 확인
4. 평가 제출
5. 관리자 검수 화면에서 검수완료 처리
6. /debriefing/에서 선수명/연락처로 OTP 인증
7. 점수·코멘트·평가 키워드·검수완료 배지 확인

기존 테스트 데이터가 이미 저장되어 있더라도 이번 패치 후에는 data 배열에서 점수/코멘트를 복원해 표시합니다.
다만 KCR/IKRC의 과거 다중 컵 제출은 첫 번째 컵 중심으로 복원됩니다. 새 제출부터는 컵/샘플별로 분리 저장됩니다.
