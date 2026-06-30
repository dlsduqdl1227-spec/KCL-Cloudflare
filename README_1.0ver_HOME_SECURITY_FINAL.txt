KCL Assessment 1.0ver HOME / SECURITY FINAL

반영 내용
1. /assessment/와 /debriefing/ 전역 좌측 상단에 홈 버튼을 추가했습니다.
   - 평가 입력 중 홈 이동 시 확인창이 먼저 표시됩니다.
   - PDF 출력/저장 시 홈 버튼은 자동으로 숨겨집니다.

2. 디브리핑 화면 문구를 선수 공개용 기준으로 정리했습니다.
   - 운영팀 검수 완료 공식 평가 항목만 기준으로 표시합니다.
   - 심사위원 개인명/관리자명/내부 운영 정보는 선수 화면에서 노출하지 않습니다.

3. 보안/배포 설정 점검
   - wrangler.toml 프로젝트명은 실제 Cloudflare Pages 프로젝트인 kcl-cloudflare로 정리했습니다.
   - keep_vars 항목은 Cloudflare Pages에서 지원하지 않으므로 포함하지 않았습니다.
   - 개발용 기본 관리자값 KCL_ADMIN_NAME=관리자 / KCL_ADMIN_PHONE=01000000000은 wrangler.toml에 포함하지 않았습니다.
   - SOLAPI API KEY/SECRET은 코드와 wrangler.toml에 포함하지 않았습니다. Cloudflare Pages Secret으로만 관리해야 합니다.

적용 필수 파일
- functions/api/rpc.js
- public/assessment/index.html
- public/debriefing/index.html
- wrangler.toml

적용 후 확인
1. GitHub 업로드 후 Cloudflare 배포 Success 확인
2. https://kcl-cloudflare.pages.dev/ 접속
3. 평가 화면 진입 후 좌측 상단 홈 버튼 확인
4. 디브리핑 화면 진입 후 좌측 상단 홈 버튼 확인
5. /admin/ SMS 테스트 provider: solapi 확인
6. 평가 제출 → 검수완료 → 디브리핑 OTP → PDF 저장 확인

검수 결과
- public/assessment/index.html script syntax OK
- public/debriefing/index.html script syntax OK
- public/admin/index.html script syntax OK
- public/registry/index.html script syntax OK
- public/camera/index.html script syntax OK
- functions/api/rpc.js syntax OK
- functions/api/health.js syntax OK
- wrangler.toml keep_vars 미포함 확인
- wrangler.toml 개발용 관리자값 미포함 확인
- ZIP 무결성 테스트 통과
