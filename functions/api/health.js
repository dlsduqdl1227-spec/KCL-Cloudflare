export async function onRequestGet(context) {
  return Response.json({ success: true, message: 'KCL Cloudflare v2 health ok', now: new Date().toISOString() });
}
