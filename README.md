# KCL Assessment Web App - Stage50

Stage50은 Stage49 기준에서 KCR, IKRC, KBC, MOB, MOC, KTCC, KCAC 전체 대회 흐름을 다시 점검하고 공통 오류 가능성을 보완한 최종 안정화본입니다.

핵심 보완:
- 최종 리포트 생성 시 존재하지 않는 변수 참조로 오류가 발생할 수 있는 문제 수정
- MOB/IKRC Head Judge 및 Calibration 제출 데이터를 일반 검수/순위 산정에서 분리
- MOB 켈리브레이션 `검수확인` / `검수완료` / 완료 후 숨김 기능 유지
- MOB 센서리는 `센서리 반영점수` 중심 표시 유지
- MOB 테크니컬은 `테크니컬 총점`, `시간감점`, `총평가 반영점수` 분리 표시 유지
- KBC/MOB 시간감점 검수 입력 범위를 실제 계산 구조에 맞게 양수 감점값으로 보정
- 전체 JS 문법, HTML 내 스크립트, 주요 로직 문자열, ZIP 무결성 검사 완료

사용 파일: `kcl-assessment-1.0ver-security-stage50-full-competition-audit-final.zip`
