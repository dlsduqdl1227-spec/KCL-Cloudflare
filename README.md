# KCL Assessment 1.0ver

Cloudflare Pages + Functions + D1 기반 코리아커피리그 심사 웹앱입니다.

## 포함 기능
- 메인: 평가/심사위원, 디브리핑, 관리자 진입
- 관리자: 등록 관리, 평가 관리, 디브리핑 이동
- 등록 관리: 엑셀 1개 업로드로 전 대회 선수/운영계정 일괄 등록
- 평가/심사위원: 모바일·태블릿 대응 평가 입력, 검수/수정, 검수완료, 순위 확인
- 디브리핑: 선수 인증, 상세 점수/코멘트 확인, 브라우저 PDF 저장
- 프리텐다드 폰트 통일

## 대회 라운드 구조
- KBC, MOC: 예선 / 본선 / 결선
- MOB, KTCC, KCR, IKRC, KCAC: 예선 / 결선

## 배포 시 주의
`wrangler.toml`의 `database_id`는 현재 Cloudflare D1 데이터베이스 ID로 유지하거나 교체하세요.
기존 운영 DB를 그대로 쓰는 경우 `wrangler.toml`을 덮어쓰기 전에 database_id를 확인하세요.

## 주요 파일
- `public/index.html`
- `public/admin/index.html`
- `public/assessment/index.html`
- `public/debriefing/index.html`
- `public/registry/index.html`
- `public/assets/KCL_Registry_Import_Template.xlsx`
- `functions/api/rpc.js`
- `functions/api/health.js`

## 버전
1.0ver
