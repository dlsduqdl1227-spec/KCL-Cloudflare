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

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const keepData = url.searchParams.get('keepData') === '1' || url.searchParams.get('keep') === '1';
  const expected = (env && (env.KCL_LIVE_AUDIT_TOKEN || env.LIVE_AUDIT_TOKEN)) || LIVE_AUDIT_DEFAULT_TOKEN;
  if (!token || token !== expected) {
    return json({ success:false, message:'라이브 검수 토큰이 올바르지 않습니다.' }, 403);
  }
  const rpcUrl = new URL('/api/rpc', url.origin);
  const res = await fetch(rpcUrl.toString(), {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ action:'liveAuditRun', args:[{ token, keepData }] })
  });
  const text = await res.text();
  try {
    return json(JSON.parse(text), res.status);
  } catch (_) {
    return json({ success:false, message:'RPC 응답을 JSON으로 해석하지 못했습니다.', status:res.status, raw:text.slice(0, 2000) }, 502);
  }
}

export async function onRequestPost(context) {
  return onRequestGet(context);
}
