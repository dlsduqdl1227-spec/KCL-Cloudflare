# KCL Assessment 1.0ver Security Stage 12

- 관리자 로그인 UI를 아이디/비밀번호/시크릿 코드 3단계 입력으로 변경
- `adminLogin` API 보강: 전체 관리자 + 시크릿 코드 검증 통과
- Cloudflare Pages Secret `KCL_ADMIN_PASSWORD`가 설정되어 있으면 관리자 비밀번호로 사용
- Secret 미설정 시 기존 현장 호환을 위해 비밀번호 칸에 기존 연락처 입력으로 로그인 가능
- Stage 10 모바일 레이아웃, Stage 8 권한복구, Stage 5 보안 헤더 유지

- 관리자 시크릿 코드 기본값: `5061` (`KCL_ADMIN_SECRET_CODE` Secret으로 변경 가능)
- 통합 운영관리/대회팀장 화면을 독립 스크롤 컨테이너로 고정해 마우스 휠·터치 스크롤 문제 보정
- Stage 12 모의테스트 결과는 `TEST_REPORT_STAGE12.md` 참고
