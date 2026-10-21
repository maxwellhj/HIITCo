import { apiJson, limitedText, type AuthEnv } from "./auth";
import { clearSessionCookie, readSession } from "./session";
import { parseDailyVisits } from "../../src/domain/gymmasterVisits";
import { dateKey, shiftDate, weekKey } from "../../src/domain/attendance";
import { memberStreak } from "../../src/member/attendance";
export async function gymMasterVisits(
  request: Request,
  env: AuthEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/gymmaster/visits") return null;
  if (request.method !== "GET")
    return apiJson({ error: "method_not_allowed" }, 405, { Allow: "GET" });
  // The authenticated cookie selects the member. Never accept caller-supplied tokens or IDs.
  if (url.search || request.headers.get("Sec-Fetch-Site") === "cross-site")
    return apiJson({ error: "request_not_allowed" }, 400);
  const session = await readSession(request, env.GYMMASTER_API_KEY);
  if (!session)
    return apiJson({ error: "session_expired" }, 401, {
      "Set-Cookie": clearSessionCookie(),
    });
  if (!env.LOGIN_RATE_LIMITER)
    return apiJson({ error: "connection_unavailable" }, 503);
  try {
    if (
      !(
        await env.LOGIN_RATE_LIMITER.limit({
          key: `visits:${session.memberId}`,
        })
      ).success
    )
      return apiJson({ error: "too_many_attempts" }, 429, {
        "Retry-After": "60",
      });
  } catch {
    return apiJson({ error: "connection_unavailable" }, 503);
  }
  const now = new Date();
  const today = dateKey(now);
  const currentWeek = weekKey(today);
  const start = shiftDate(currentWeek, -14);
  // GymMaster support confirmed these required fields are omitted from the docs.
  // Request 52 weeks for streaks; only the latest three weeks of days reach the client.
  const historyStart = shiftDate(currentWeek, -51 * 7);
  const upstreamUrl = new URL(
    "https://hiitco.gymmasteronline.com/portal/api/v2/member/visits/daily",
  );
  upstreamUrl.search = new URLSearchParams({
    api_key: env.GYMMASTER_API_KEY!,
    token: session.token,
    startdate: historyStart,
    enddate: today,
  }).toString();
  let stage = "request";
  try {
    const response = await fetch(upstreamUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403)
      return apiJson({ error: "session_expired" }, 401, {
        "Set-Cookie": clearSessionCookie(),
      });
    if (response.status === 429)
      return apiJson({ error: "too_many_attempts" }, 429, {
        "Retry-After": "60",
      });
    if (response.status >= 300 && response.status < 400)
      return apiJson({ error: "provider_redirect" }, 502);
    if (!response.ok)
      return apiJson(
        { error: "provider_http_error", providerStatus: response.status },
        502,
      );
    stage = "response";
    const body: unknown = JSON.parse(await limitedText(response.body, 1048576));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
    const data = body as Record<string, unknown>;
    if (typeof data.error === "string" && data.error.trim())
      return apiJson({ error: "visits_not_available" }, 502);
    const rows = parseDailyVisits(data.result).filter(
      (row) => row.date >= historyStart && row.date <= today,
    );
    return apiJson({
      days: rows.filter((row) => row.date >= start && row.date <= today),
      from: start,
      through: today,
      streak: memberStreak(rows, now),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
    )
      return apiJson({ error: "provider_timeout" }, 504);
    return apiJson(
      {
        error:
          stage === "response" ? "visits_format" : "provider_network_error",
      },
      502,
    );
  }
}
