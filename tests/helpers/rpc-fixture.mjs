import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

// Real Pages RPC + disposable SQLite. No Cloudflare credentials or network calls.
export async function createRpcFixture(options = {}) {
  const source = options.source || fs.readFileSync(new URL('../../functions/api/rpc.js',import.meta.url),'utf8');
  const api = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const db = new DatabaseSync(':memory:');
  class Statement {
    constructor(sql,params=[]) { this.sql=sql; this.params=params; }
    bind(...params) { return new Statement(this.sql,params); }
    async first() { return db.prepare(this.sql).get(...this.params) || null; }
    async all() { return {results:db.prepare(this.sql).all(...this.params)}; }
    runSync() { const r=db.prepare(this.sql).run(...this.params);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}; }
    async run() { return this.runSync(); }
  }
  const env = {DB:{prepare:sql=>new Statement(sql),async batch(statements){
    if(options.beforeBatch)await options.beforeBatch(statements);
    // A D1 batch is atomic. Do not yield mid-transaction when testing concurrent requests.
    db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(s.runSync());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}
  }},KCL_ADMIN_NAME:'검수 QA',KCL_ADMIN_PHONE:'01099990000',KCL_ADMIN_PASSWORD:'local-qa-only',KCL_ADMIN_SECRET_CODE:'5061'};
  let sequence=0;
  async function handle(body) {
    const request=new Request('https://qa.test/api/rpc',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://qa.test','CF-Connecting-IP':'198.51.100.'+(++sequence%200+1)},body:JSON.stringify(body)});
    return api.onRequestPost({request,env});
  }
  async function rpc(action,...args) {
    const result=await (await handle({action,args})).json();
    if(!result.success)throw new Error(action+': '+result.message);
    return result;
  }
  await rpc('ping');
  const actor=await rpc('adminLogin','01099990000','local-qa-only','5061');
  return {db,actor,rpc,handle,close:()=>db.close()};
}
