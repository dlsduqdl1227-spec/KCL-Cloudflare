# KCL 클린 배포 업로드 안내

이 폴더는 GitHub 저장소를 처음 구성하거나 전체 프로젝트를 다시 정리해 올릴 때 쓰는 클린 배포 패키지입니다.

## 포함 항목

- `src`
- `public`
- `tests`
- `scripts`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `wrangler.toml`
- 배포/검수 문서

## 제외 항목

- `node_modules`
- `.wrangler`
- `data`
- CSV 원본/정제 파일
- 마이그레이션 산출물
- 임시 번들

## 기존 assets 로그인 파일 보존

주의: 현재 로컬 프로젝트에는 실제 운영용 로그인 엑셀 파일이 들어 있지 않았습니다.

클린 배포 패키지를 사용하면 기존 GitHub 저장소의 `public/assets` 안에 있던 엑셀 파일이 빠질 수 있습니다. 업로드 전에 기존 로그인 파일을 반드시 `public/assets` 폴더에 다시 넣어야 합니다.

기본 자동 탐색 이름은 `operators.xlsx`, `login.xlsx`, `operator_accounts.xlsx`, `운영탭.xlsx`, `로그인.xlsx`, `운영자.xlsx`입니다.

`.xlsx` 파일을 안정적으로 읽기 위해 `public/client/vendor/xlsx.full.min.js`를 함께 포함했습니다.

다른 파일명을 유지해야 하면 `public/index.html`에서 `rpc-client.js` 로드 전에 아래처럼 지정하세요.

```html
<script>
  window.KCL_STATIC_LOGIN_ASSET = "/assets/기존파일명.xlsx";
</script>
```

## 권장 기준

기존 GitHub 저장소가 이미 있다면 `KCL_MINIMAL_UPDATE_20260707`만 올리는 것이 더 안전합니다.

새 저장소를 처음 만들거나 전체 프로젝트를 다시 올려야 한다면 이 클린 패키지를 사용하되, `public/assets`의 기존 로그인 파일을 빠뜨리지 마세요.

## HTTP 405 로그인 오류

`로그인 중 오류 발생: HTTP 405`는 Cloudflare API 경로가 POST 요청을 받지 못할 때 주로 발생합니다.

이 클린 패키지는 `wrangler.toml`, `src/worker`, `public/client/rpc-client.js`를 포함합니다. Cloudflare Pages의 단순 정적 배포가 아니라 Worker 방식으로 배포해야 `/api/gas`, `/api/rpc`가 정상 작동합니다.

이번 업데이트에서는 `/api/gas`가 막히면 `/api/rpc`로 자동 우회하고, 로그인 API가 막히거나 DB 계정이 없을 때 기존 `public/assets` 로그인 파일을 마지막 fallback으로 읽도록 보강했습니다.
