import { apiJson, type AuthEnv } from "./auth";
import type { WebhookEnv } from "./webhook";
import { readSession, clearSessionCookie } from "./session";
import { memberCheckinIndex, openCheckin } from "./checkinRecords";
import { parseCheckinTimes } from "../../src/domain/checkinTimes";
import { dateKey, weekKey, shiftDate } from "../../src/domain/attendance";
export async function gymMasterCheckins(
  request: Request,
  env: AuthEnv & WebhookEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/gymmaster/checkins") return null;
  if (request.method !== "GET")
    return apiJson({ error: "method_not_allowed" }, 405, { Allow: "GET" });
  if (url.search || request.headers.get("Sec-Fetch-Site") === "cross-site")
    return apiJson({ error: "request_not_allowed" }, 400);
  const session = await readSession(request, env.GYMMASTER_API_KEY);
  if (!session)
    return apiJson({ error: "session_expired" }, 401, {
      "Set-Cookie": clearSessionCookie(),
    });
  if (
    !env.GYMMASTER_WEBHOOK_TOKEN ||
    !env.GYMMASTER_CHECKIN_INBOX ||
    !env.LOGIN_RATE_LIMITER
  )
    return apiJson({ error: "checkins_unavailable" }, 503);
  try {
    if (
      !(
        await env.LOGIN_RATE_LIMITER.limit({
          key: `checkins:${session.memberId}`,
        })
      ).success
    )
      return apiJson({ error: "too_many_attempts" }, 429, {
        "Retry-After": "60",
      });
    const memberKey = await memberCheckinIndex(
      session.memberId,
      env.GYMMASTER_WEBHOOK_TOKEN,
    );
    const through = dateKey(new Date()),
      from = shiftDate(weekKey(through), -14);
    const inbox = env.GYMMASTER_CHECKIN_INBOX.get(
      env.GYMMASTER_CHECKIN_INBOX.idFromName("hiitco-checkin-inbox-v1"),
    );
    const response = await inbox.fetch(
      new Request("https://inbox.internal/checkins/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberKey, from, through }),
      }),
    );
    if (!response.ok) throw Error();
    const value = (await response.json()) as { records?: unknown };
    if (
      !Array.isArray(value.records) ||
      value.records.length > 1000 ||
      value.records.some((record) => typeof record !== "string")
    )
      throw Error();
    const records = await Promise.all(
      value.records.map((record) =>
        openCheckin(record, env.GYMMASTER_WEBHOOK_TOKEN!, memberKey),
      ),
    );
    const checkins = parseCheckinTimes(records);
    if (checkins.some((record) => record.date < from || record.date > through))
      throw Error();
    return apiJson({ checkins, timeZone: "Pacific/Auckland" });
  } catch {
    return apiJson({ error: "checkins_unavailable" }, 503);
  }
}
