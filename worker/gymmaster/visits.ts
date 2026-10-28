import { controlData, type ControlDataEnv } from "../control/data";
import { trainingMemberKey, sealTraining } from "../training";
import { apiJson, limitedText, type AuthEnv } from "./auth";
import { clearSessionCookie, readSession } from "./session";
import { parseDailyVisits } from "../../src/domain/gymmasterVisits";
import { dateKey, shiftDate, weekKey } from "../../src/domain/attendance";
import { memberStreak } from "../../src/member/attendance";
export async function gymMasterVisits(
  request: Request,
  env: AuthEnv & ControlDataEnv,
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
  // Start with one year, then page backwards only while the confirmed streak
  // reaches the start of the fetched history. This avoids capping it at 52.
  let historyStart = shiftDate(currentWeek, -51 * 7);
  let stage = "request";
  try {
    const signal = AbortSignal.timeout(15000);
    async function fetchRange(from: string, through: string) {
      stage = "request";
      const upstreamUrl = new URL(
        "https://hiitco.gymmasteronline.com/portal/api/v2/member/visits/daily",
      );
      upstreamUrl.search = new URLSearchParams({
        api_key: env.GYMMASTER_API_KEY!,
        token: session!.token,
        startdate: from,
        enddate: through,
      }).toString();
      const response = await fetch(upstreamUrl, {
        method: "GET",
        redirect: "manual",
        signal,
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
      const body: unknown = JSON.parse(
        await limitedText(response.body, 1048576),
      );
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw Error();
      const data = body as Record<string, unknown>;
      if (typeof data.error === "string" && data.error.trim())
        return apiJson({ error: "visits_not_available" }, 502);
      return parseDailyVisits(data.result).filter(
        (row) => row.date >= from && row.date <= through,
      );
    }
    const firstPage = await fetchRange(historyStart, today);
    if (firstPage instanceof Response) return firstPage;
    const rows = firstPage;
    let summary = memberStreak(rows, now);
    // Bound subrequests, total time, and retained records. If older data cannot
    // be read, retain the confirmed count and its existing lower-bound marker.
    for (let pages = 1; pages < 40 && !signal.aborted; pages++) {
      if (!summary.count || summary.exact) break;
      const currentAttended = rows.some(
        (row) => row.date >= currentWeek && row.visits > 0,
      );
      const earliestStreakWeek = shiftDate(
        currentWeek,
        -(summary.count - 1 + (currentAttended ? 0 : 1)) * 7,
      );
      if (earliestStreakWeek > historyStart) break;
      const olderStart = shiftDate(historyStart, -52 * 7);
      try {
        const older = await fetchRange(olderStart, shiftDate(historyStart, -1));
        if (older instanceof Response) {
          if (older.status === 401) return older;
          break;
        }
        if (rows.length + older.length > 10000) break;
        rows.push(...older);
        historyStart = olderStart;
        summary = memberStreak(rows, now);
      } catch {
        break;
      }
    }
    if (env.CONTROL_STORE) {
      try {
        const memberKey = await trainingMemberKey(
          session.memberId,
          env.GYMMASTER_API_KEY!,
        );
        const updatedAt = now.toISOString();
        const sealed = await sealTraining(
          {
            days: rows.filter((row) => row.date >= start && row.date <= today),
            from: start,
            through: today,
            updatedAt,
          },
          env.GYMMASTER_API_KEY!,
          "control.attendance:" + memberKey,
        );
        await controlData(env, "/attendance", { memberKey, sealed, updatedAt });
      } catch {
        console.error("GM-ATTENDANCE-SYNC");
      }
    }
    return apiJson({
      days: rows.filter((row) => row.date >= start && row.date <= today),
      from: start,
      through: today,
      streak: summary,
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
