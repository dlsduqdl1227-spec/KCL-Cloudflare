# KCL 평가 웹앱

이 폴더가 GitHub와 Cloudflare Pages에 배포되는 단일 운영 원본입니다.

## 유지 대상

- `public/`: 평가·검수·순위·관리 화면과 정적 자산
- `functions/`: Cloudflare Pages Functions API
- `migrations/`: D1 데이터베이스 마이그레이션
- `tests/`: 대회별 회귀 및 데이터 독립성 테스트
- `package.json`, `pnpm-lock.yaml`, `wrangler.toml`: 실행·배포 설정

## 로컬 보관 규칙

- 날짜 폴더는 `YYYYMMDD` 형식으로만 만들고 Git에는 포함하지 않습니다.
- 데이터베이스 백업과 최종 엑셀/PDF만 날짜 폴더에 보관합니다.
- `tmp`, `output`, `outputs`, `.wrangler`, `node_modules`, `.pnpm-store`는 재생성 가능한 임시 산출물이므로 보관하지 않습니다.
- 운영 데이터 초기화 전에는 날짜 폴더의 SQL·엑셀 백업이 정상적으로 열리는지 먼저 확인합니다.

## 확인 명령

```powershell
pnpm install --frozen-lockfile
pnpm test
```
