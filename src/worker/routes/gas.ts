import { AppContext } from "../db/d1";
import { json } from "../utils/response";

type GasRequestBody = {
  action?: string;
  payload?: unknown;
  args?: unknown[];
  fn?: string;
  requestId?: string;
};

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}

function actionFromBody(body: GasRequestBody): string {
  return String(body.action || body.fn || "").trim();
}

export async function handleGas(ctx: AppContext): Promise<Response> {
  if (ctx.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (ctx.request.method === "GET") {
    return json({
      success: true,
      service: "kcl-gas-proxy",
      gasConfigured: Boolean(ctx.env.GAS_WEBAPP_URL),
      secretConfigured: Boolean(ctx.env.GAS_SHARED_SECRET),
      time: new Date().toISOString()
    }, { headers: corsHeaders() });
  }

  if (ctx.request.method !== "POST") {
    return json({ success: false, message: "Method not allowed" }, { status: 405, headers: corsHeaders() });
  }

  if (!ctx.env.GAS_WEBAPP_URL) {
    return json({ success: false, message: "GAS_WEBAPP_URL is not configured on the Worker." }, { status: 500, headers: corsHeaders() });
  }
  if (!ctx.env.GAS_SHARED_SECRET) {
    return json({ success: false, message: "GAS_SHARED_SECRET is not configured on the Worker." }, { status: 500, headers: corsHeaders() });
  }

  let body: GasRequestBody;
  try {
    body = await ctx.request.json<GasRequestBody>();
  } catch {
    return json({ success: false, message: "Invalid JSON body" }, { status: 400, headers: corsHeaders() });
  }

  const action = actionFromBody(body);
  if (!action) {
    return json({ success: false, message: "Missing GAS action" }, { status: 400, headers: corsHeaders() });
  }

  const upstreamBody = {
    token: ctx.env.GAS_SHARED_SECRET,
    action,
    payload: body.payload ?? {},
    args: Array.isArray(body.args) ? body.args : [],
    legacyFn: body.fn || "",
    requestId: body.requestId || crypto.randomUUID(),
    source: "cloudflare-worker"
  };

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(ctx.env.GAS_WEBAPP_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(upstreamBody)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ success: false, message: `GAS fetch failed: ${message}` }, { status: 502, headers: corsHeaders() });
  }

  const text = await upstreamResponse.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { success: false, message: "GAS returned a non-JSON response", raw: text.slice(0, 1000) };
  }

  const status = upstreamResponse.ok ? 200 : upstreamResponse.status || 502;
  return json(data, { status, headers: corsHeaders() });
}
