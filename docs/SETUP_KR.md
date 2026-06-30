# KCL Assessment 1.0ver 설정 가이드

## 1. GitHub 업로드
이 패키지의 파일을 `KCL-Cloudflare` 저장소 루트에 업로드합니다.

## 2. Cloudflare Pages 설정
- Project name: `kcl-cloudflare`
- Production branch: `main`
- Framework preset: `None`
- Build command: 비워두기
- Build output directory: `public`

## 3. D1 연결
`wrangler.toml`에서 아래 값을 현재 D1 Database ID로 맞춥니다.

```toml
[[d1_databases]]
binding = "DB"
database_name = "kcl-cloudflare"
database_id = "현재 D1 Database ID"
```

기존 DB를 계속 사용할 경우 이미 입력해둔 `database_id`를 유지하세요.

## 4. 마이그레이션
D1 Console에서 아래 SQL 파일을 순서대로 실행합니다. 이미 실행한 DB라면 중복 실행해도 기존 테이블은 유지됩니다.

1. `migrations/0001_init.sql`
2. `migrations/0002_seed.sql`
3. `migrations/0003_registry.sql`

## 5. 등록 관리
`/admin/`에서 관리자 로그인 후 `등록 관리`로 이동합니다.
엑셀 템플릿 하나를 업로드하면 대회별 선수/운영계정 탭을 자동으로 읽어 전체 등록합니다.

## 6. 디브리핑 PDF
1.0ver은 브라우저 인쇄 기능으로 PDF 저장을 지원합니다. 디브리핑 화면에서 PDF 저장 버튼을 누른 뒤 인쇄 대상에서 “PDF로 저장”을 선택하세요.

## 7. 남은 고도화 항목
- SMS 실발송 연동
- 서버 자동 PDF 생성
- 실제 대회별 산식/동점 처리 검수
- 실데이터 대량 업로드 현장 테스트


## 1.0ver Bugfix
- 동일 이름/연락처가 KCR·KCAC 등 여러 대회의 대회팀장을 겸임해도 각 대회 권한이 덮어쓰기 되지 않도록 운영계정 갱신 기준을 수정했습니다.
- 로그인 시 같은 사람의 여러 운영계정 행을 통합해 담당 대회 전체를 표시합니다.
- 대회팀장 계정은 담당 대회 범위 안에서 등록 관리 페이지 접근이 가능하도록 보강했습니다.
- 계정유형에 한국어(대회팀장, 팀장, 운영진, 스텝, 관리자)를 넣어도 내부 권한 코드로 자동 정규화합니다.

## SMS 실발송 연동
Cloudflare Pages → Settings → Environment variables에 아래 값을 추가합니다.

```text
SMS_PROVIDER=solapi
SOLAPI_API_KEY=솔라피 API Key
SOLAPI_API_SECRET=솔라피 API Secret
SOLAPI_FROM=사전 등록된 발신번호 숫자만
```

저장 후 반드시 재배포합니다. 관리자 페이지 `/admin/`에서 SMS 테스트를 실행할 수 있습니다.

## 디브리핑 PDF 저장
선수 인증 후 `/debriefing/` 결과 화면에서 `PDF 저장 / 다운로드` 버튼을 누르면 브라우저 인쇄 창이 열립니다. 대상/프린터를 `PDF로 저장`으로 선택합니다.


## 1.0ver-final 관리자 계정 안내
- 개발용 기본 관리자(관리자 / 01000000000)는 비활성화되었습니다.
- 새로 등록한 실제 관리자 또는 대회팀장 계정으로 로그인하세요.
- 브라우저에 예전 기본 관리자 정보가 저장되어 있어도 자동으로 제거됩니다.
