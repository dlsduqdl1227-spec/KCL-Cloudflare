KCL Cloudflare v2 - V7 업데이트 가이드

교체 파일
1) functions/api/rpc.js
2) public/assessment/index.html
3) public/debriefing/index.html
4) public/registry/index.html  ← 신규 폴더/파일
5) migrations/0003_v7_registry.sql ← 선택 실행

이번 V7 목적
- 규정집 기반 대회별 순위/동점 기준 보강
- 블라인드 대회용 선수 사전 등록 및 컵번호/샘플번호 매핑
- 선수 디브리핑 인증을 선수명+연락처+대회코드+등록 매핑 기반으로 변경
- PDF는 서버 생성 전 단계로, 브라우저 인쇄 → PDF 저장 방식으로 구현
- 심사위원/운영자 CSV 일괄 등록 페이지 추가

추가 페이지
/registry/
- 관리자 로그인 후 선수/심사위원 CSV 등록 가능
- 블라인드 대회(KCR, IKRC, KCAC, MOC, KTCC)는 반드시 선수와 컵번호/샘플번호/팀번호 매핑을 먼저 등록

V7 등록 CSV 기본 형식
선수:
대회코드,참가자번호,선수명,소속,연락처,컵번호,샘플번호,팀번호,팀명,예선컵번호,본선컵번호,결선컵번호

심사위원:
대회코드,계정유형,심사위원명,소속,연락처,역할,평가팀

Cloudflare D1에서 0003_v7_registry.sql 실행 권장.
이미 배포된 코드의 ensureSchema도 인덱스를 자동 생성하지만, 콘솔에서 직접 실행해도 됩니다.
