# KCL Digital Assessment Web App

Stage23 final: registry original template cleanup.

## 핵심 기준
- 다운로드 엑셀은 사용자가 처음 제공한 `KCL_Registry_Import_Template.xlsx` 원본 공통 양식을 그대로 유지합니다.
- 웹앱은 대회별 규정에 따라 필요한 번호만 내부 등록값으로 매핑합니다.
- KCR / KCAC 예선 / IKRC 예선은 블라인드 흐름을 유지합니다.
- KBC / MOC / MOB / KTCC는 현장 즉시 입력 또는 사전등록 선택을 모두 지원합니다.
- 선수/운영/관리자 등록 화면, 자동 임시저장, KCAC 이미지 압축 저장, 검수/순위/엑셀 리포트 기능은 Stage20~22 기준을 유지합니다.

## 배포 전 확인
1. `/registry/`에서 엑셀 템플릿 다운로드
2. 원본 양식 그대로 업로드하여 전체 미리보기
3. 전체 등록 실행
4. 심사위원 평가 제출 → 본인 검수완료
5. 관리자/팀장 순위 확인 및 최종정리 엑셀 다운로드
