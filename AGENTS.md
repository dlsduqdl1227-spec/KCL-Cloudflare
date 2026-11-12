# KCL 작업 지침

## 저장소와 배포

- 이 저장소는 `dlsduqdl1227-spec/KCL-Cloudflare`이며 기본 브랜치는 `main`이다.
- Cloudflare Pages 프로젝트는 `kcl-cloudflare`, 서비스 주소는 `https://kcl-cloudflare.pages.dev`이다.
- 기존 Cloudflare GitHub 연동을 우선 사용한다. 연결된 GitHub 계정의 권한으로 코드를 수정하고, 사용자가 허용한 변경을 저장소에 반영한 뒤 Cloudflare의 자동배포 결과를 확인한다.
- 로컬에 `CLOUDFLARE_API_TOKEN`이 없다는 이유만으로 코드 수정이나 Git 연동 배포가 불가능하다고 판단하지 않는다. 일반적인 코드 배포를 위해 사용자에게 토큰을 새로 만들거나 채팅에 제공하도록 요구하지 않는다.
- `main` 반영은 운영 배포를 트리거할 수 있으므로 사용자가 요청한 범위만 변경한다.
- 직접 Wrangler 배포, 원격 D1 작업, Cloudflare 계정 설정 변경은 Git 연동 배포와 별도 작업이다. 필요한 경우에만 해당 작업의 인증과 권한을 확인한다.

## 작업 순서

1. `README.md`, `package.json`, `wrangler.toml`과 관련 코드를 읽는다.
2. 최신 소스와 기존 작업을 확인하고 요청된 변경을 구현한다.
3. 동작 변경에는 관련 회귀 테스트를 실행한다. 기본 검증 명령은 `pnpm install --frozen-lockfile`, `pnpm test`이다. 문서만 변경한 경우 불필요한 애플리케이션 테스트는 생략할 수 있다.
4. 사용자가 코드 반영과 배포를 요청했다면 기존 GitHub 연결을 통해 변경을 반영한다.
5. 반영한 정확한 커밋의 GitHub check-runs에서 `Cloudflare Pages` 결과를 확인한다. combined commit status가 비어 있어도 check-runs를 별도로 확인한다.
6. `completed`와 `success` 및 해당 커밋의 배포 결과를 확인한 뒤에만 배포 성공으로 보고한다. 확인한 커밋과 배포 URL을 함께 기록한다.
7. `scripts/kcl.mjs doctor`로 환경을 먼저 확인한다. `pnpm test`는 등록된 모든 API 검사를 실행한다. 누락된 테스트가 있으면 `node scripts/kcl.mjs catalog`로 목록을 갱신한다.
8. 화면 변경은 KCL Cloud의 `browser-audit` 결과도 확인한다. 작업 환경에서 브라우저 실행이 제한되면 GitHub 호스팅 검사를 사용한다. 실행하지 않은 검사를 완료했다고 보고하지 않는다.
9. 모바일 지시에도 같은 저장소·Actions·Pages 경로를 사용한다. `/api/health`의 소스 지문과 정확한 배포 커밋의 Pages 결과를 대조하고 main의 `live-audit`을 확인/재실행한다. 단기 OIDC 진단은 읽기 전용이며 관리자 로그인이나 영구 토큰이 필요하지 않다.
10. 변경 완료 후 `pnpm release:prepare`로 핵심 검사를 통과시켜 `lib/release-info.mjs`, `public/ops-build.json`을 생성하고 함께 커밋한다. 값을 손으로 작성하지 않는다. `pnpm release:verify`는 소스 지문을 대조한다. 정적 Pages 배포에서도 검증 산출물을 재사용하므로 Cloudflare 설정 변경에 의존하지 않는다.

## 데이터와 대회 구분

- 기존 `public/`, `functions/`, `migrations/`, `tests/` 구조와 D1 바인딩을 존중한다.
- MOB를 포함한 각 대회의 점수, 선수, 심사위원, 라운드 데이터가 다른 대회에 섞이지 않도록 영향 범위를 확인한다.
- 일반 코드 배포 과정에 원격 데이터 초기화나 D1 마이그레이션을 임의로 추가하지 않는다.
- 토큰과 비밀번호를 코드, 커밋, 답변에 포함하지 않는다.
