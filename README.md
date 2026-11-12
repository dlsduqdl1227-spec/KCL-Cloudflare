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

`pnpm release:prepare`는 핵심 검사 통과 후 검증된 소스 지문을 생성합니다. 생성된 `lib/release-info.mjs`, `public/ops-build.json`을 소스와 함께 반영합니다. 설치 시 지문을 대조하며, 운영 진단도 실행 중인 소스 지문을 대조합니다. 정확한 배포 커밋은 GitHub의 Cloudflare Pages 검사로 확인합니다. 상태 확인은 선수 정보나 점수를 공개하지 않습니다.

GitHub Actions의 **KCL Cloud** 작업은 전체 API 검사와 브라우저 검사를 실행합니다. main 배포 후 `live-audit` 작업은 일회성 GitHub 인증으로 7개 대회의 서버 내부 진단을 요청합니다. 이후 모바일 요청에서도 이 작업을 다시 실행해 점검할 수 있습니다. 장기 관리자 토큰이나 Cloudflare 비밀번호를 저장하지 않습니다.

자동 진단은 서버 안에서만 기록을 확인하고 성공 여부만 클라우드에 반환합니다. 운영 점수·기록 수·라운드별 현황·선수 정보는 GitHub 로그·보고서·첨부 결과로 내보내지 않습니다. 세부 진단은 관리자·해당 대회팀장 세션에서만 조회합니다. 미진행 라운드와 검수 대기는 오류로 단정하지 않습니다. 데이터 자체가 잘못됐다는 진단이 나오면 원문과 대회 규정 확인 후 별도로 수정하며, 진단 과정은 점수·순위·검수·선수·심사위원을 변경하지 않습니다.

상세 작업 기준: [운영 점검과 배포](docs/cloud-operations.md).

로컬 실행 환경이 없어도 `ops/…` 브랜치의 KCL Cloud가 핵심 검사·전체 API·브라우저 검사를 실행하고 검증 산출물을 생성합니다. `api-audit` 로그의 `KCL_RELEASE_INFO`와 생성된 소스 지문을 그대로 반영한 뒤 배포할 수 있습니다. `KCL Auth Doctor`는 비밀값 없이 GitHub 인증 발급·공개키·서명을 점검합니다.
