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
