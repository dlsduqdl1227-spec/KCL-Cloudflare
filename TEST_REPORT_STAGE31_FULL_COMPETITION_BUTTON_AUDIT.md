# TEST REPORT — STAGE31 FULL COMPETITION BUTTON AUDIT

## 목적
MOB 켈리브레이션 오류와 같은 문제가 다른 대회/버튼에서도 발생하지 않도록, 실제 운영 흐름 기준으로 API·권한·평가·검수·순위·결과 파일·켈리브레이션 기능을 재점검했습니다.

## 주요 수정

### 1. IKRC 켈리브레이션 API 실제 구현
기존 화면에는 `getIkrcCalibrationCupNumbers`, `getIkrcCalibrationResultsByCup`, `markIkrcCalibrationChecked` 호출이 있었으나 서버 dispatch에 실제 구현이 연결되어 있지 않았습니다.

수정 후:
- IKRC 헤드/팀장/관리자가 컵별 켈리브레이션 목록 조회 가능
- 제출 데이터가 없을 때 오류가 아니라 빈 목록 반환
- 컵별 심사위원 점수/평균/표준편차 상세 조회 가능
- 확인 완료 상태 저장 가능

### 2. IKRC Seed to Cup API 구현
기존 Seed to Cup 버튼은 화면은 있으나 서버 응답이 빈 스텁이었습니다.

수정 후:
- 결선/제출 데이터 기반 참가자 목록 생성
- Seed to Cup 매치 저장
- 참가자/샘플별 0~3점 가산점 저장
- 저장 결과를 콘솔에서 재조회 가능
- 저장된 가산점을 IKRC 순위 계산에 반영

### 3. 켈리브레이션 빈 목록 안정 처리
MOB/IKRC 모두 일반 심사위원 제출 데이터가 없을 경우:
- `.map is not a function` 오류 방지
- 정상적으로 빈 배열 반환
- 화면에서는 “아직 제출 데이터가 없습니다” 안내 표시

### 4. 버튼별 주요 API 점검
점검 대상:
- 평가 제출
- 본인 검수/팀장 검수
- 순위 조회
- 순위 상세 조회
- 최종정리 엑셀 데이터 생성
- MOB 켈리브레이션 목록/상세/확인
- IKRC 켈리브레이션 목록/상세/확인
- IKRC Seed to Cup 목록/매치 저장/결과 저장
- PDF 관련 브라우저 저장 안내 API

## 실행 테스트
모의 D1 환경을 구성해 아래 흐름을 직접 실행했습니다.

### 계정 테스트
- 관리자 로그인 성공
- KCR/KBC/KCAC/MOC/KTCC/MOB/IKRC 심사위원 로그인 성공
- MOB 센서리 헤드/테크니컬 헤드 로그인 성공
- IKRC 헤드 로그인 성공

### 대회별 평가 제출 테스트
- KCR 제출 성공
- KBC 제출 성공
- KCAC 제출 성공
- MOC 서명 포함 제출 성공
- KTCC 서명 포함 제출 성공
- MOB 센서리/테크니컬 제출 성공
- IKRC 제출 성공

### 대회별 검수/순위/결과 테스트
7개 대회 전체에 대해 아래 흐름 통과:
- 검수 목록 조회
- 검수완료 처리
- 순위 조회
- 순위 상세 조회
- 최종정리파일 데이터 조회

### 켈리브레이션 테스트
- MOB 일반 심사 데이터 없는 상태: 빈 배열 정상 반환
- IKRC 일반 심사 데이터 없는 상태: 빈 배열 정상 반환
- MOB 일반 심사 데이터 있는 상태: 목록/상세/확인 완료 통과
- IKRC 일반 심사 데이터 있는 상태: 목록/상세/확인 완료 통과

### Seed to Cup 테스트
- IKRC Seed to Cup 콘솔 조회 성공
- 매치 저장 성공
- 가산점 결과 저장 성공
- 저장 결과 재조회 성공

## 문법/무결성 점검
- `functions/api/rpc.js` 문법 검사 통과
- `functions/api/health.js` 문법 검사 통과
- `public/assets/kcl-api-shim.js` 문법 검사 통과
- `public/assessment/index.html` 내장 스크립트 검사 통과
- `public/registry/index.html` 내장 스크립트 검사 통과
- `public/debriefing/index.html` 내장 스크립트 검사 통과
- `public/camera/index.html` 내장 스크립트 검사 통과
- `public/admin/index.html` 내장 스크립트 검사 통과
- ZIP 무결성 검사 통과

## 최종 판단
Stage31은 MOB에서 발견된 목록 오류를 기준으로, 같은 유형의 배열/객체 응답 오류와 미구현 서버 액션을 다른 대회까지 확장 점검해 수정한 버전입니다.
