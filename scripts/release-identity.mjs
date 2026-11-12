import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export function releaseIdentity(root){
  const files=[];
  function visit(relative){
    const absolute=path.join(root,relative),stat=fs.lstatSync(absolute);
    if(stat.isDirectory())for(const name of fs.readdirSync(absolute).sort())visit(relative+'/'+name);
    else if(stat.isFile()&&!['lib/release-info.mjs','lib/verified-release.mjs','public/ops-build.json'].includes(relative))files.push(relative);
  }
  for(const name of ['public','functions','lib','scripts','tests','.github/workflows','package.json','pnpm-lock.yaml','wrangler.toml','.node-version'])visit(name);
  const hash=createHash('sha256');for(const name of files.sort())hash.update(name+'\0'+createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')+'\n');
  return {sourceId:hash.digest('hex'),files:files.length};
}
