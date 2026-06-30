KCL Assessment 1.0ver - 전체 관리자 권한 새로고침 수정

수정 내용
- 같은 이름/연락처가 대회팀장(KCR/KCAC 등)과 전체관리자(ALL/ADMIN)를 동시에 갖는 경우, 로그인 세션이 예전 대회팀장 권한으로 남아 있어도 서버가 D1 operators 테이블을 다시 조회하여 최신 권한으로 보정합니다.
- SMS 테스트 권한 확인 시에도 저장된 브라우저 권한값만 믿지 않고 DB의 ALL/ADMIN 권한을 재확인합니다.
- 관리자 화면에 '다시 로그인 / 권한 새로고침' 버튼을 추가했습니다.
- role 값이 '전체관리자', '총괄관리자'처럼 입력되어도 ADMIN으로 인식되도록 보강했습니다.

교체 핵심 파일
- functions/api/rpc.js
- public/admin/index.html

적용 후 확인
1. GitHub에 위 파일 교체
2. Cloudflare 배포 Success 확인
3. /admin/ 접속
4. '다시 로그인 / 권한 새로고침' 클릭
5. 같은 이름/연락처로 다시 로그인
6. 환영 문구에 '전체 관리자'가 뜨는지 확인
7. SMS 테스트 발송

주의
- wrangler.toml은 기존 정상 파일을 유지하세요.
