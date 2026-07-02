# TEST REPORT · STAGE43 RESET / SCROLL / MOB FINAL

## Build target
- Source: stage43_final
- Output: kcl-assessment-1.0ver-security-stage43-reset-scroll-mob-final.zip

## Implemented changes

### 1. Competition score reset
- Added RPC handler: `clearScores`
- Added registry UI button: `점수 데이터 초기화`
- Reset scope:
  - `scores` rows for selected competition
  - MOB calibration check sessions
  - IKRC calibration / Seed to Cup helper sessions
- Preserves participants and operator/admin accounts.

### 2. MOB technical / time penalty separation
- Evaluation header now separates:
  - Technical/Sensory item score
  - Time penalty
  - Official reflected total
- MOB score breakdown panel retained at bottom of the evaluation screen.
- MOB submit payload keeps:
  - 테크니컬 총점
  - 센서리 총점
  - 창작메뉴 총점
  - 감점 전 합산
  - 시간감점
  - 총평가 반영점수

### 3. MOB review/ranking/debriefing visibility
- Review list summary now shows MOB breakdown instead of only one total.
- Review detail filters fields by judge role.
- Ranking/detail view uses official reflected total for MOB.
- Public debriefing adds MOB score breakdown and filters fields by role.

### 4. Scroll stability
- Added Stage43 scroll guards to assessment and debriefing pages.
- Checked page-level script syntax for assessment, registry, debriefing, camera, and admin pages.

## Static checks

- `node --check functions/api/rpc.js`: PASS
- `node --check functions/api/health.js`: PASS
- `node --check public/assets/kcl-api-shim.js`: PASS
- Inline script check: `public/assessment/index.html`: PASS
- Inline script check: `public/registry/index.html`: PASS
- Inline script check: `public/debriefing/index.html`: PASS
- Inline script check: `public/camera/index.html`: PASS
- Inline script check: `public/admin/index.html`: PASS

## Notes

This audit verifies code structure, script syntax, reset wiring, MOB role filters, and output packaging. After Cloudflare deployment, run one live browser check with test data before using with real competition data.
