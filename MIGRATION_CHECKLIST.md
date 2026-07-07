# KCL Cloudflare Migration Checklist

## 기존 함수 → 새 RPC/API 이전 상태

| 기존 함수 | 새 위치 | 상태 |
|---|---|---|
| `getConfig` | `src/worker/routes/config.ts` | MVP 구현 |
| `judgeLogin` | `src/worker/routes/auth.ts` | MVP 구현 |
| `getParticipantAssignments` | `src/worker/routes/participants.ts` | MVP 구현 |
| `submitScores` | `src/worker/routes/scores.ts` | MVP 구현, 동적 헤더 재계산 연결 TODO |
| `submitWithSignature` | `src/worker/routes/scores.ts` | MVP 구현 |
| `getReviewList` | `src/worker/routes/reviews.ts` | MVP 구현, 표준 컬럼 중심 |
| `updateReviewRow` | `src/worker/routes/reviews.ts` | MVP 구현, 동적 컬럼 수정 TODO |
| `updateReviewStatus` | `src/worker/routes/reviews.ts` | MVP 구현 |
| `updateReviewStatusBatch` | `src/worker/routes/reviews.ts` | MVP 구현 |
| `deleteReviewRow` | `src/worker/routes/reviews.ts` | MVP 구현 |
| `getRanking` | `src/worker/routes/rankings.ts` | MVP 구현, 상세 대회별 집계 연결 TODO |
| `getRankingDetail` | `src/worker/routes/rankings.ts` | MVP 구현, 표준 컬럼 중심 |
| `generate*Comment` | `src/worker/domain/comments/generateComment.ts` | 규칙 기반 구현 |
| `sendOTP` | `src/worker/routes/debriefing.ts` | MVP 구현 |
| `verifyOTP` | `src/worker/routes/debriefing.ts` | MVP 구현 |
| `createRankingDetailPdf` | `src/worker/routes/rankings.ts` | 2차 TODO 메시지 |
| `createDebriefPdfFromPayload` | `src/worker/routes/debriefing.ts` | 2차 TODO 메시지 |
| Admin/Seed/Calibration 계열 | `src/worker/routes/export.ts` | 명확한 TODO 응답 |

## 기존 시트 → D1 테이블 매핑

| 기존 시트/행 | D1 테이블 |
|---|---|
| `Config` | `competitions`, `competition_options` |
| `운영탭` | `operators`, `operator_permissions` |
| `선수등록` | `participants`, `participant_identifiers` |
| 대회별 점수 탭 | `submissions`, `submission_values`, `submission_smart_tags` |
| 검수 상태 변경 | `review_events` |
| 순위 저장본 | `ranking_snapshots` |
| OTP 캐시 | `otp_codes` |
| 디브리핑 토큰 | `debrief_tokens` |
| SMS 발송 로그 | `sms_logs` |
| `ErrorLogs` | `error_logs` |
| `__META__/IKRC_SEED_MATCH` | `ikrc_seed_matches` |
| `__META__/IKRC_CAL_CHECK` | `ikrc_calibration_checks` |
| `__META__/MOB_CAL_CHECK` | `mob_calibration_checks` |

## 프론트 호출 → Worker route 매핑

| 프론트 호출 | Worker |
|---|---|
| `google.script.run.*` | `src/client/rpc-client.js` → `POST /api/rpc` |
| `gasRun_(fn,args,...)` | `rpc-client.js`가 제공하는 `google.script.run` 호환 객체 |
| `/camera/` | 서버 호출 없음 |

## 점수 계산 로직 이전 상태

- `roundScore02`, `roundTotal`: 이전 완료
- KBC 시간 감점/실격: 이전 완료
- MOB 시간 감점/실격: 이전 완료
- MOC 정답/보너스/시간 실격: 이전 완료
- KTCC 정답/보너스/시간 실격: 이전 완료
- IKRC 가중치/Seed bonus: 이전 완료
- KCAC 소계/감점/그룹 실격: domain 모듈 이전 완료
- API 제출 경로에서 모든 대회별 헤더 재계산을 강제 적용하는 작업: TODO

## 코멘트 생성 로직 이전 상태

- GPT/OpenAI 호출 없음
- KCR/KBC/KCAC/MOB/IKRC 모두 규칙 기반 3개 초안 반환
- 프론트 “AI 자동 코멘트” 문구는 “규칙 기반 자동 코멘트”로 변경
- 기존 제출 전 직접 수정 요구 UI 유지

## SMS/OTP 이전 상태

- SOLAPI 유지
- Worker `fetch` 사용
- WebCrypto HMAC 사용
- OTP hash/salt/expires_at 저장
- 재요청 cooldown, 실패 횟수 제한 구현
- SOLAPI key는 wrangler secret

## PDF 제한사항

1차 MVP에서 서버 PDF 생성은 구현하지 않습니다.

- `createRankingDetailPdf`
- `createDebriefPdfFromPayload`

두 함수는 “PDF 서버 생성은 2차 구현 예정입니다. 브라우저 인쇄 기능을 사용해주세요.”를 반환합니다.

## 남은 TODO

- CSV 변환에서 `__META__` 타입별 완전 분리 보강
- 대회별 동적 헤더 매핑 저장 테이블 추가 여부 결정
- 제출 API에서 domain scoring 결과를 `submissions.total_score/final_score`에 강제 반영
- 검수 API에서 동적 평가 컬럼 수정 및 재계산 연결
- 기존 Code.gs 순위 상세 집계와 D1 집계 결과 대조 fixture 작성
- IKRC Seed to Cup 상세 API 구현
- IKRC/MOB 켈리브레이션 상세 API 구현
- 관리자 계정/대회 설정 CRUD 구현
- 서버 PDF 생성 2차 구현

## 수동 테스트 체크리스트

- [ ] `/` 평가 화면 로드
- [ ] `/debriefing/` 디브리핑 화면 로드
- [ ] `/camera/` 카메라 화면 로드
- [ ] 운영자 로그인 성공/실패
- [ ] 참가자 목록 조회
- [ ] 대회별 제출 1건 저장
- [ ] 검수 목록 조회
- [ ] 검수상태 변경
- [ ] 순위 조회
- [ ] 코멘트 자동생성 3개 초안 표시
- [ ] OTP 발송
- [ ] OTP 검증
- [ ] CSV 변환 report 확인
- [ ] D1 CSV export 확인

## 대회 당일 리스크

- SOLAPI 장애 또는 발신번호 설정 오류
- CSV migration 누락
- phone hash 불일치로 로그인/OTP 실패
- D1 원격 DB와 로컬 DB 혼동
- 기존 Apps Script URL로 참가자가 잘못 접속
- 카메라 권한이 HTTP 또는 iframe 정책 때문에 차단
- 대회별 동적 컬럼이 MVP 표준 컬럼 화면에 모두 표시되지 않는 문제
- 서버 PDF 미지원으로 인쇄 안내가 필요한 문제
