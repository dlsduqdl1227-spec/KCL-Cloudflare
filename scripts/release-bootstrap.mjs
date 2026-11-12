import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('./release-gate.mjs',import.meta.url));
// Dashboard NODE_VERSION can override .node-version. Use the same tested runtime
// without requiring an account-setting change or changing the production runtime.
if(Number(process.versions.node.split('.')[0])===24)await import('./release-gate.mjs');
else{
  const result=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['--yes','--package=node@24.22.1','node',script],{stdio:'inherit',env:process.env,timeout:180000});
  if(result.error)console.error(result.error.message);process.exit(result.status??1);
}
