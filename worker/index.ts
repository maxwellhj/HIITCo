export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Set as an encrypted Cloudflare runtime secret, never a VITE_ build variable. */
  GYMMASTER_API_KEY?: string;
}

function json(
  data: Record<string, string>,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/api/health") {
      if (request.method !== "GET")
        return json({ error: "Method not allowed" }, 405, { Allow: "GET" });
      // Public liveness only. Never reveal secret values or credential status.
      return json({ status: "ok" });
    }
    if (path === "/api/gymmaster" || path.startsWith("/api/gymmaster/")) {
      // No passthrough or real-member data until authenticated access is implemented.
      return json(
        { error: "GymMaster integration is not connected yet." },
        501,
      );
    }
    if (path === "/api" || path.startsWith("/api/")) {
      return json({ error: "API route not found" }, 404);
    }
    return env.ASSETS.fetch(request);
  },
};
