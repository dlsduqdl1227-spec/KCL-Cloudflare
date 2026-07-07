# public/assets login files

이 폴더는 기존 운영용 로그인 파일을 보관하는 위치입니다.

- 기존에 사용하던 엑셀/CSV/JSON 로그인 파일은 삭제하지 마세요.
- 현재 로컬 프로젝트에는 실제 로그인 엑셀 파일이 포함되어 있지 않아서 새 파일로 대체하지 않았습니다.
- 기본 자동 탐색 파일명: `operators.xlsx`, `login.xlsx`, `operator_accounts.xlsx`, `운영탭.xlsx`, `로그인.xlsx`, `운영자.xlsx`
- CSV/JSON 파일도 같은 이름으로 사용할 수 있습니다.
- `.xlsx` 파일을 읽기 위한 파서는 `public/client/vendor/xlsx.full.min.js`에 로컬 포함되어 있습니다.
- 다른 파일명을 계속 써야 하면 `window.KCL_STATIC_LOGIN_ASSET = "/assets/파일명.xlsx";` 또는 `window.KCL_STATIC_LOGIN_ASSETS = [...]`로 지정할 수 있습니다.

Cloudflare에 전체 폴더를 다시 올릴 때도 이 폴더 안의 기존 로그인 파일을 함께 보존해야 합니다.
