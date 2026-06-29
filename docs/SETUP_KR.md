# KCL Cloudflare v2 설치 가이드

## 목표
KCL 평가 시스템을 Cloudflare 중심 구조로 운영합니다.
Cloudflare Pages + Functions + D1을 사용하며, 기존 Apps Script/Google Sheets 저장 방식은 사용하지 않습니다.

## 구조
- `public/assessment/` 평가/관리자 화면
- `public/debriefing/` 디브리핑 화면
- `public/camera/` KCAC 카메라 화면
- `public/assets/kcl-api-shim.js` 기존 `google.script.run` 호출을 `/api/rpc`로 변환하는 호환 레이어
- `functions/api/rpc.js` Cloudflare Functions API
- `migrations/` D1 데이터베이스 스키마

## 1. GitHub 저장소 업로드
이 폴더 전체를 새 GitHub 저장소에 업로드합니다.

## 2. Cloudflare Pages 생성
Cloudflare → Workers & Pages → Pages → Import existing Git repository

설정:
- Framework preset: None
- Build command: 비워두기
- Build output directory: `public`

## 3. D1 데이터베이스 생성
Cloudflare D1에서 `kcl-v2-db` 생성 후 `wrangler.toml`의 `database_id`를 교체합니다.

또는 터미널에서:
```bash
npm install
npx wrangler login
npm run d1:create
```

## 4. 마이그레이션 적용
```bash
npm run d1:migrate:remote
```

## 5. Cloudflare 환경변수 설정
Pages 프로젝트 → Settings → Variables and secrets

필수/권장:
- `KCL_ADMIN_NAME` 최초 관리자 이름
- `KCL_ADMIN_PHONE` 최초 관리자 연락처 숫자만
- `KCL_ADMIN_AFFILIATION` 관리자 소속

문자 발송은 추후 연결:
- `SMS_PROVIDER`
- `SMS_API_KEY`
- `SMS_API_SECRET`
- `SMS_FROM`

현재 SMS_PROVIDER가 비어 있으면 개발 모드로 인증번호가 화면 응답에 표시됩니다.

## 6. 접속 경로
- `/` 메인
- `/assessment/` 평가/관리자
- `/debriefing/` 디브리핑
- `/camera/` KCAC 카메라

## 현재 구현 범위
- 기존 HTML 화면 재사용
- `google.script.run` 호환 레이어
- D1 기반 대회 설정/계정/참가자/점수 저장/검수/순위 기본 구조
- KCAC 카메라 Cloudflare 내부 호스팅

## 다음 단계
1. 실제 대회별 점수 계산 로직 세부 이식
2. 선수/운영진 CSV 업로드 관리자 기능 추가
3. SMS 발송 서비스 연결
4. PDF 생성 기능 Workers 전용으로 재구현
5. D1 데이터 내보내기/백업 기능 추가
