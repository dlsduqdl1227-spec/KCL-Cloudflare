export async function onRequestGet(context) {
  return Response.json({ success: true, message: 'KCL Assessment 1.0 health ok', now: new Date().toISOString() });
}
