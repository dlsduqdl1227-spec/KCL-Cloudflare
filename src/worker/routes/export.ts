import { todo } from "../utils/response";

export async function cleanupCompetitionSheetTabs() {
  return todo("Google Sheets 보조 탭 정리 기능은 Cloudflare/D1 구조에서는 사용하지 않습니다. 레거시 CSV 변환 스크립트에서 __META__ 행 분리를 수행하세요.");
}

export async function getAdminConsoleData() {
  return todo("관리 콘솔 전체 데이터 API는 MVP 이후 구현 예정입니다. 현재는 Config/운영자 CSV import로 초기 데이터를 구성하세요.");
}

export async function updateCompetitionAdminSettings() {
  return todo("대회 설정 수정 UI API는 MVP 이후 구현 예정입니다. competitions 테이블 또는 CSV import로 설정을 관리하세요.");
}

export async function upsertOperatorAccount() {
  return todo("운영자 계정 CRUD API는 MVP 이후 구현 예정입니다. operators/operator_permissions 테이블 또는 CSV import로 관리하세요.");
}

export async function deleteOperatorAccount() {
  return todo("운영자 계정 삭제 API는 MVP 이후 구현 예정입니다. D1에서 비활성화하거나 CSV를 재import하세요.");
}

export async function getMobCalibrationParticipantNumbers() {
  return todo("MOB 켈리브레이션 목록 API는 테이블 구조만 준비되어 있으며 MVP 이후 상세 연결 예정입니다.");
}

export async function markMobCalibrationChecked() {
  return todo("MOB 켈리브레이션 확인 저장 API는 테이블 구조만 준비되어 있으며 MVP 이후 상세 연결 예정입니다.");
}

export async function getMobCalibrationResultsByParticipant() {
  return todo("MOB 켈리브레이션 상세 API는 테이블 구조만 준비되어 있으며 MVP 이후 상세 연결 예정입니다.");
}

export async function getIkrcSeedToCupConsole() {
  return todo("IKRC Seed to Cup 운영 API는 테이블 구조만 준비되어 있으며 MVP 이후 상세 연결 예정입니다.");
}

export async function saveIkrcSeedToCupMatch() {
  return todo("IKRC Seed to Cup 매치 저장 API는 MVP 이후 구현 예정입니다.");
}

export async function updateIkrcSeedToCupResult() {
  return todo("IKRC Seed to Cup 결과 저장 API는 MVP 이후 구현 예정입니다.");
}

export async function getIkrcCalibrationCupNumbers() {
  return todo("IKRC 켈리브레이션 컵 목록 API는 테이블 구조만 준비되어 있으며 MVP 이후 상세 연결 예정입니다.");
}

export async function markIkrcCalibrationChecked() {
  return todo("IKRC 켈리브레이션 확인 저장 API는 테이블 구조만 준비되어 있으며 MVP 이후 상세 연결 예정입니다.");
}

export async function getIkrcCalibrationResultsByCup() {
  return todo("IKRC 켈리브레이션 상세 API는 테이블 구조만 준비되어 있으며 MVP 이후 상세 연결 예정입니다.");
}
