# KCL Assessment 1.0ver 100% 업데이트 안내

이번 업데이트는 1.0ver 운영 테스트 기준에서 남아 있던 큰 항목인 SMS 실발송 연동과 디브리핑 PDF 품질 보강을 반영한 버전입니다.

## 적용 파일
- functions/api/rpc.js
- public/debriefing/index.html
- public/admin/index.html

기존 Cloudflare D1 연결이 정상이라면 wrangler.toml은 덮어쓰지 않는 것을 권장합니다.

## SMS 실발송 설정
Cloudflare Pages 프로젝트의 Settings → Environment variables에 아래 값을 추가합니다.

- SMS_PROVIDER = solapi
- SOLAPI_API_KEY = 솔라피 API Key
- SOLAPI_API_SECRET = 솔라피 API Secret
- SOLAPI_FROM = 사전 등록된 발신번호 숫자만

선택값:
- KCL_OTP_SMS_TEMPLATE = [KCL] {code} 디브리핑 인증번호는 {otp}입니다. 5분 안에 입력해주세요.
- KCL_ALLOW_FAST_OTP = true  // 테스트 때만 사용. 기본은 60초 재요청 제한.

환경변수 설정 후 Cloudflare에서 재배포해야 적용됩니다.

## 관리자 SMS 테스트
/admin/ 로그인 후 하단의 SMS / PDF 상태 영역에서 테스트 받을 번호를 입력하고 SMS 테스트를 누릅니다.

## PDF 저장 방식
/debriefing/에서 선수 인증 후 PDF 저장 / 다운로드 버튼을 누르면 브라우저 인쇄 창이 열립니다.
대상 또는 프린터를 PDF로 저장으로 선택하면 A4 형식으로 저장됩니다.

Cloudflare Workers 단독 환경에서는 서버 내부에 브라우저 렌더러가 없어 완전 자동 PDF 파일 생성을 바로 수행하기 어렵습니다. 이번 1.0ver에서는 외부 PDF 서비스 없이 운영 가능한 브라우저 PDF 저장 방식을 공식 지원합니다.

## 보강 내용
- SOLAPI SMS 실발송 어댑터 추가
- SMS 발송 로그 D1 테이블 자동 생성
- OTP 60초 재요청 제한 추가
- 관리자 SMS 테스트 UI 추가
- 시스템 상태 확인 UI 추가
- 디브리핑 A4 인쇄/PDF 전용 CSS 추가
- PDF 저장 시 파일명에 대회코드/선수명 반영
- 1.0ver 산식/동점 처리 보강본 유지


## 1.0ver-final 관리자 계정 안내
- 개발용 기본 관리자(관리자 / 01000000000)는 비활성화되었습니다.
- 새로 등록한 실제 관리자 또는 대회팀장 계정으로 로그인하세요.
- 브라우저에 예전 기본 관리자 정보가 저장되어 있어도 자동으로 제거됩니다.
