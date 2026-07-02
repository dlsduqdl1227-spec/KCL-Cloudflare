import { onRequestPost as rpcOnRequestPost, onRequestOptions as rpcOnRequestOptions } from './_worker-rpc.js';

const LIVE_AUDIT_DEFAULT_TOKEN = 'STAGE62-LIVE-AUDIT-5061-7d9f8c2a9b1e';

function json(data, status = 200) {
  return new Response(JSON.stringify(data || {}, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    }
  });
}

function notAllowed() {
  return json({ success:false, message:'허용되지 않은 요청 방식입니다.' }, 405);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/api/health') {
      if (request.method !== 'GET') return notAllowed();
      return json({ success:true, message:'KCL Assessment health ok - advanced worker mode', now:new Date().toISOString() });
    }

    if (path === '/api/rpc') {
      if (request.method === 'OPTIONS') return rpcOnRequestOptions({ request, env, ctx });
      if (request.method !== 'POST') return notAllowed();
      return rpcOnRequestPost({ request, env, ctx });
    }

    if (path === '/api/live-audit-run') {
      if (request.method !== 'GET' && request.method !== 'POST') return notAllowed();
      const token = url.searchParams.get('token') || '';
      const keepData = url.searchParams.get('keepData') === '1' || url.searchParams.get('keep') === '1';
      const expected = (env && (env.KCL_LIVE_AUDIT_TOKEN || env.LIVE_AUDIT_TOKEN)) || LIVE_AUDIT_DEFAULT_TOKEN;
      if (!token || token !== expected) {
        return json({ success:false, message:'라이브 검수 토큰이 올바르지 않습니다.' }, 403);
      }
      const rpcReq = new Request(new URL('/api/rpc', url.origin).toString(), {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Origin': url.origin },
        body: JSON.stringify({ action:'liveAuditRunStep', args:[{ token, keepData }] })
      });
      return rpcOnRequestPost({ request:rpcReq, env, ctx });
    }

    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not found', { status:404 });
  }
};
