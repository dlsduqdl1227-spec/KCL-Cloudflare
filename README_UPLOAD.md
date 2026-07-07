# KCL 클린 배포 업로드 안내

이 폴더는 GitHub 저장소를 처음 구성하거나, 전체 코드를 다시 정리해서 올릴 때 쓰는 클린 배포 패키지입니다.

## 포함한 것

- `src`
- `public`
- `tests`
- `scripts`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `wrangler.toml`
- 배포/검수 문서

## 제외한 것

- `node_modules`
- `.wrangler`
- `data`
- CSV 원본/정제 파일
- 마이그레이션 산출물
- 임시 번들

## 사용 기준

- 기존 GitHub 저장소가 이미 있으면 `KCL_MINIMAL_UPDATE_20260707`만 올리는 것이 더 안전합니다.
- 새 저장소를 처음 만들거나 전체 프로젝트를 다시 정리해야 하면 이 폴더를 올리면 됩니다.

## 배포 전 확인

GitHub 업로드 후 Cloudflare에서 빌드/배포할 때는 의존성을 직접 올리지 않습니다. `node_modules`는 업로드하지 않고, Cloudflare 또는 로컬에서 `npm install`로 설치합니다.
