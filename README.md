# KCL Assessment Web App

Cloudflare Pages + Functions + D1 기반 KCL 디지털 평가 웹앱 최종본입니다.

## 엑셀 등록 템플릿 위치

- 등록 화면 다운로드용 템플릿은 `public/assets/KCL_Registry_Import_Template.xlsx` 한 곳에만 보관합니다.
- ZIP 루트 폴더의 중복 템플릿은 혼동 방지를 위해 제거했습니다.
- 배포 후 `/registry/` 화면의 `엑셀 템플릿 다운로드` 버튼에서 동일 파일을 받을 수 있습니다.

## 포함 기능 요약

- 대회별 선수/운영/관리자 등록
- 대회별 블라인드 번호 표시
- 심사위원 평가 제출 및 본인 평가 검수
- 관리자/대회팀장 검수 및 순위 확인
- 최종정리 엑셀 다운로드
- KCAC 이미지 압축 저장
- MOC/KTCC 서명 저장
- 평가 중 자동 임시저장 및 이어쓰기
