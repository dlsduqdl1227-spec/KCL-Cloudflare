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

## 모바일 지시와 클라우드 운영

운영 원본은 이 저장소입니다. 모바일에서 변경을 지시해도 연결된 GitHub로 수정하고 기존 Cloudflare Pages 연동으로 배포합니다. 일반 코드 배포에는 별도 Cloudflare API 토큰이 필요하지 않습니다.

Node.js 24와 pnpm 10.11.1을 사용합니다. 전체 저장소를 체크아웃해야 원본 사진을 포함한 검증이 가능합니다.

| 명령 | 범위 |
|---|---|
| `pnpm ops:doctor` | 실행 환경·연결 방식·진단 주소 확인 |
| `pnpm test` | 모든 API·집계·권한 회귀 검사 |
| `pnpm test:critical` | 제출·격리·권한·집계·과거 평가·단기 인증 핵심 검사 |
| `pnpm exec playwright install chromium` | 로컬 브라우저 설치 |
| `KCL_BROWSER_CHANNEL=bundled pnpm test:browser` | 모바일·데스크톱 화면 검사 |
| `pnpm ops:live` | GitHub main 작업에서만 운영 데이터 읽기 전용 진단 |

`pnpm install`의 배포 전 검사에 실패하면 검증 파일을 만들지 않습니다. Pages API가 이 파일을 필수로 참조하므로 검사를 생략한 빌드도 배포되지 않습니다. 실제 승인된 커밋과 검사 결과는 `/api/health`와 `/ops-build.json`에서 확인합니다. 상태 확인은 선수 정보나 점수를 공개하지 않습니다.

GitHub Actions의 **KCL Cloud** 작업은 전체 API 검사와 브라우저 검사를 실행합니다. main 배포 후 `live-audit` 작업은 일회성 GitHub 인증으로 7개 대회의 운영 기록을 읽기만 합니다. 이후 모바일 요청에서도 이 작업을 다시 실행해 점검할 수 있습니다. 장기 관리자 토큰이나 Cloudflare 비밀번호를 저장하지 않습니다.

운영 기록 진단은 상태·기록 수·오류 코드만 보고합니다. 미진행 라운드와 검수 대기는 오류로 단정하지 않습니다. 데이터 자체가 잘못됐다는 진단이 나오면 원문과 대회 규정 확인 후 별도로 수정하며, 진단 과정은 점수·순위·검수·선수·심사위원을 변경하지 않습니다.

상세 작업 기준: [운영 점검과 배포](docs/cloud-operations.md).
