import { Env } from "./db/d1";
import { handleGas } from "./routes/gas";
import { handleRpc } from "./routes/rpc";
import { json } from "./utils/response";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/gas") {
      return handleGas({ env, request });
    }
    if (url.pathname === "/api/rpc") {
      // Legacy/future D1 migration path. Current production flow uses /api/gas.
      return handleRpc({ env, request });
    }
    if (url.pathname === "/api/health") {
      return json({ success: true, service: "kcl-cloudflare", time: new Date().toISOString() });
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  }
};
