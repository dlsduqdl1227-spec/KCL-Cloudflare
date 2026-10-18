# KCR 심사위원 총점 합산 수정

- 확인일: 2026-10-18 (한국 시간)
- 대상: https://kcl-cloudflare.pages.dev/
- 저장소: https://github.com/dlsduqdl1227-spec/KCL-Cloudflare
- 기준 커밋: `c1b6fd300a578477922c5fe5a838f07a5a6846fe`
- 기록 범위: GitHub 반영 전 수정 내용과 사전 검증 결과. 실제 반영·배포 결과는 해당 PR과 Cloudflare Pages 검사 기록에서 확인한다.

## 원인과 수정

[사실] `aggregateRankingGroup_()`의 KCR 분기가 심사위원별 공식 점수를 `avgRowsBy_()`로 계산했다. 화면의 총점 표기와 달리 평균값이 순위·상세·보고서·디브리핑에 전달됐다.

- KCR 공식 점수를 합산한다. 21 + 28 + 35점은 기존 평균 28점에서 총점 84점으로 바뀐다.
- 동점 비교의 Sweetness와 Overall도 합산한다.
- 순위의 점수 기준을 `심사위원 총점 합산` 또는 `정규화 총점 합산`으로 표시한다.
- 헤드 포함, 켈리브레이션 제외, 심사위원·역할별 최신 제출 선택, 라운드 분리, 실격 및 공식 확정값 우선 처리는 기존 로직을 사용한다.
- 심사위원 편차 확인용 평균·표준편차와 다른 대회의 집계 방식은 수정하지 않는다.
- 기존 API의 `avgScore` 호환 필드는 유지한다. KCR 공식 점수는 `score`, `rankingScore`, `totalScore`로 확인한다.

[추론] 운영에 같은 코드를 배포하면 저장된 원점수를 조회할 때 총점과 순위가 다시 계산된다. 점수 재입력이나 DB 마이그레이션이 필요하지 않다. 실제 운영 데이터로 배포 후 확인은 아직 수행하지 않았다.

## 검증

- 기본 `pretest`, `test`, `posttest`의 개별 명령과 신규 API 테스트를 합쳐 98개 실행: 95개 통과, 기존 실패 3개.
- 실패 3개는 변경 전 RPC 코드를 읽도록 한 별도 프로세스에서도 같은 진단으로 재현했다.
  - stage123: 과거 `validateKcrStationSubmission_(basePayload, cfg, completedUnits)` 호출 형태를 요구하는 소스 정규식 불일치.
  - stage158: 테스트 VM에 `participantStateForCode_`가 정의되지 않음.
  - stage176: 테스트 VM에 `kcrPrelimPending_`가 정의되지 않음.
- 신규 stage237을 변경 전 코드로 실행하면 `28 !== 84`로 실패하고, 수정 코드로 실행하면 통과한다.
- 신규 stage238 브라우저 검사: 390px·1440px에서 총점, 합산 순위, 상세, 관리자 디브리핑 일치. 가로 넘침과 JavaScript 오류 없음.
- 실제 RPC와 폐기 가능한 SQLite DB로 헤드 포함, 켈리브레이션 제외, 과거 중복 제출 제외, 빈 결선, 보고서 일치, 조회 전후 점수·참가자·대회 설정 보존 확인.
- `wrangler pages functions build --outdir tmp/kcr-total-build` 성공.
- `git diff --check` 통과.

이 환경의 pnpm은 의존성 빌드 스크립트 승인 설정 때문에 설치 종료 코드를 1로 반환했다. 필요한 패키지는 내려받았으며, 기본 테스트 명령은 기존 npm 런타임으로 실행하고 Wrangler는 설치된 진입점을 직접 실행했다. 의존성 버전·lockfile·설치 정책은 변경하지 않았다.

## 반영 준비와 재검증

[사실] 작업 재개 후 Git Credential Manager로 `dlsduqdl1227-spec` 인증을 완료했고, GitHub API에서 대상 저장소의 `push` 권한과 기본 브랜치 `main`을 확인했다. 기존 `main` 커밋에는 Cloudflare Pages의 `Deployed successfully` 검사 결과가 연결되어 있다.

- 원격 `main`은 수정 기준 커밋과 동일해 추가 변경과의 충돌이 없다.
- stage237 총점 API 검사와 stage238 모바일·PC 브라우저 검사를 재실행해 통과했다. 브라우저 검사는 번들 Playwright 경로를 `KCL_PLAYWRIGHT_MODULE`로 지정했다.
- Cloudflare Functions 빌드를 재실행해 통과했다.
- 수정 브랜치와 PR의 배포 검사 후 `main` 반영 및 운영 배포 결과를 확인한다.

점수·참가자·대회 설정의 변경이나 DB 마이그레이션은 포함하지 않는다.

## 업무 기록

- 업무 목표: KCR 평균 반영 오류를 총점 합산으로 수정.
- 확인한 자료: 사용자 사이트, 이전 관리 안내, 현재 GitHub 소스, 실제 RPC·브라우저 테스트, GitHub 저장소 권한과 Cloudflare Pages 검사 기록.
- 완료한 내용: 집계·동점 항목·기준 문구 수정, 회귀 기대값 갱신, 신규 API·브라우저 검사와 수정 패키지 작성.
- 주요 판단 근거: [사실] 기존 평균 코드와 테스트 재현 확인. [추론] 배포 후 기존 원점수로 총점 재계산 가능.
- 검증 결과: 98개 중 95개 통과, 기존 실패 3개 동일 재현. 추가 브라우저 검사 및 Functions 빌드 통과.
- 남은 문제: 이 사전 검증 기록 시점에는 운영 배포 및 실데이터 확인이 남아 있다.
- 다음 단계: 수정 브랜치·PR 반영 후 Cloudflare 배포 및 운영 결과 확인.
