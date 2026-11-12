import {fileURLToPath} from 'node:url';
import {releaseIdentity} from './release-identity.mjs';
import {RELEASE_INFO} from '../lib/release-info.mjs';
const actual=releaseIdentity(fileURLToPath(new URL('../',import.meta.url)));
if(RELEASE_INFO.sourceId!==actual.sourceId||RELEASE_INFO.files!==actual.files||RELEASE_INFO.gate?.status!=='passed')throw new Error('검증 후 소스가 변경됐습니다. node scripts/release-gate.mjs 로 검사한 뒤 다시 배포하세요.');
console.log('KCL_VERIFIED_SOURCE '+actual.sourceId);
