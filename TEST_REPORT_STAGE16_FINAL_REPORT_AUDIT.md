# KCL Assessment Stage16 Final Report & Audit QA

## 업데이트 요약
- 관리자/대회팀장 권한에서 순위 화면의 **최종정리 엑셀 다운로드** 기능 추가
- 엑셀 구성: 안내, 라운드별 순위, 라운드별 점수, 검수완료 점수 시트
- 서버 API `getFinalReport` 추가: 검수완료 기준 순위와 전체 점수 원본을 한 번에 내려받도록 구성
- MOC/KTCC 디지털 서명이 실제 `scores.signature_data`에 저장되도록 `submitWithSignature` 연결 보강
- KCAC 라떼아트 패턴평가 이미지를 제출 데이터에 함께 저장하도록 보강
- KCAC는 패턴평가 잔의 스냅샷을 저장하지 않으면 제출이 차단되도록 안전장치 추가
- 검수 상세 및 순위 상세 디브리핑에서 저장 이미지/서명을 직접 확인할 수 있도록 표시 영역 추가

## 저장/기록 확인
- 모든 평가는 `scores` 테이블에 `submitted_at`, `competition_code`, `round`, `judge_name`, `role`, `unit`, `total_score`, `review_status`, `payload_json`으로 저장됨
- MOC/KTCC 서명은 `signature_data`에 저장되며, 검수완료 후에도 삭제되지 않음
- KCAC 이미지 스냅샷은 각 제출 row의 `payload_json.rows[].media.snapshots[]`에 저장됨
- 최종정리 엑셀에는 이미지/서명 원본을 직접 삽입하지 않고, `서명저장`, `이미지저장`, `이미지개수`로 감사 상태를 표기함
- 이미지/서명 원본은 관리자/팀장 검수 상세 및 순위 상세 디브리핑 화면에서 확인 가능

## 최종 QA
- `functions/api/rpc.js` 문법 검사 통과
- 모든 HTML 내장 스크립트 문법 검사 통과
- KCR 총점: Sweetness x2 서버 재계산 테스트 통과
- KCAC 다중 잔 합산 서버 재계산 테스트 통과
- KTCC 정답수+가산점 서버 재계산 테스트 통과
- 서명 데이터 노출/확인 테스트 통과
- KCAC 이미지 카운트 계산 테스트 통과
- ZIP 무결성 검사 대상

## 운영 전 마지막 현장 체크 권장
1. 관리자 로그인 후 테스트 대회 하나 선택
2. 테스트 선수/팀 1명 등록
3. 심사위원 계정으로 평가 제출
4. 팀장 또는 관리자로 검수 상세에서 이미지/서명 노출 확인
5. 검수완료 처리
6. 순위 화면에서 최종정리 엑셀 다운로드 확인

