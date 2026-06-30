# KCL Assessment 1.0ver Security Stage 5

Cloudflare Pages + Functions + D1 기반 코리아커피리그 심사 웹앱입니다.

## 운영 진입 구조
- 첫 화면: 평가 / 대회팀장 / 심사위원, 선수 디브리핑, 개발 / 관리자
- 개발 / 관리자: 통합 운영관리, 등록·권한 관리, 선수 디브리핑 확인
- 통합 운영관리: 대회 실행, 대회/디브리핑 관리
- 등록·권한 관리: 선수·팀 등록, 운영진·심사위원·대회팀장·관리자 권한 등록

## Stage 5 보안 강화
- API 서버 오류 stack trace 외부 노출 제거
- API 요청 본문 크기 제한
- 동일 출처 중심 CORS 적용
- 로그인 / OTP 발송 / OTP 확인 / 평가 제출 / SMS 테스트 rate limit 적용
- 평가 제출 시 judgeToken 세션 검증
- 검수 상태 변경 및 삭제 시 서버단 권한 재검증
- 검수 데이터 삭제는 전체 관리자만 가능
- 보안 헤더 강화: CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS
- SOLAPI API KEY / SECRET은 코드에 포함하지 않고 Cloudflare Secret으로만 관리

## 배포 전 확인
`wrangler.toml`의 D1 database_id는 현재 운영 DB ID입니다. 운영 DB를 그대로 사용할 경우 이 값을 유지하세요.

## 필수 Cloudflare Secret
- SOLAPI_API_KEY
- SOLAPI_API_SECRET
- SOLAPI_FROM
- KCL_OTP_SMS_TEMPLATE 선택

`wrangler.toml`의 [vars]는 아래 상태를 유지합니다.

```toml
[vars]
SMS_PROVIDER = "solapi"
KCL_SMS_PROVIDER = "solapi"
```

## 적용 후 리허설
1. 개발 / 관리자 로그인
2. 통합 운영관리 진입
3. 등록·권한 관리에서 선수/운영계정 확인
4. 평가 / 대회팀장 / 심사위원에서 심사위원 또는 대회팀장 로그인
5. 평가 제출
6. 검수/수정 → 수정완료 → 검수완료
7. 대회/디브리핑 공개
8. 선수 디브리핑 OTP 인증
9. PDF 저장

## 보안 주의
보안은 절대적으로 100%를 보장할 수 없습니다. 실제 대회 전에는 D1 백업, 전 종목 리허설, 수기 기록 백업안을 함께 준비하세요.
