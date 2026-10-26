import { apiJson, limitedText } from "../gymmaster/auth";
import { readSession } from "../gymmaster/session";
import { sealTraining, openTraining } from "../training";
import { controlData } from "./data";
import type { ControlEnv } from "./access";
import { parseClubEvent } from "../../src/domain/club";
export async function clubApi(
  request: Request,
  env: ControlEnv,
): Promise<Response | null> {
  const url = new URL(request.url),
    path = url.pathname,
    admin =
      path === "/api/control/club" || path.startsWith("/api/control/club/");
  if (!admin && path !== "/api/gymmaster/club") return null;
  if (!admin && !(await readSession(request, env.GYMMASTER_API_KEY)))
    return apiJson({ error: "session_expired" }, 401);
  if (
    request.headers.get("Sec-Fetch-Site") === "cross-site" ||
    (request.method !== "GET" && request.headers.get("Origin") !== url.origin)
  )
    return apiJson({ error: "request_not_allowed" }, 403);
  if (!env.CONTROL_STORE || !env.GYMMASTER_API_KEY)
    return apiJson({ error: "club_unavailable" }, 503);
  try {
    if (
      admin &&
      env.CONTROL_RATE_LIMITER &&
      !(
        await env.CONTROL_RATE_LIMITER.limit({
          key: "club:" + request.headers.get("CF-Connecting-IP"),
        })
      ).success
    )
      return apiJson({ error: "too_many_attempts" }, 429);
    if (
      request.method === "GET" &&
      (path === "/api/control/club" || path === "/api/gymmaster/club")
    ) {
      const data = await controlData(env, "/club");
      const setting = data.target
        ? await openTraining(
            data.target,
            env.GYMMASTER_API_KEY,
            "control.club-target",
          )
        : null;
      const events = await Promise.all(
        data.rows.map(async (r: { id: string; sealed: string }) =>
          parseClubEvent(
            await openTraining(
              r.sealed,
              env.GYMMASTER_API_KEY!,
              "control.event:" + r.id,
            ),
          ),
        ),
      );
      return apiJson({
        weeklyTarget: setting?.weeklyTarget ?? 3,
        events: events.sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.time.localeCompare(b.time) ||
            a.title.localeCompare(b.title),
        ),
      });
    }
    if (!admin || request.method !== "POST")
      return apiJson({ error: "method_not_allowed" }, 405);
    if (request.headers.get("Content-Type") !== "application/json")
      return apiJson({ error: "invalid_request" }, 400);
    let body;
    try {
      body = JSON.parse(await limitedText(request.body, 16000));
    } catch {
      return apiJson({ error: "invalid_request" }, 400);
    }
    if (path === "/api/control/club/target") {
      if (
        !Number.isInteger(body.weeklyTarget) ||
        body.weeklyTarget < 1 ||
        body.weeklyTarget > 7
      )
        return apiJson({ error: "invalid_target" }, 400);
      const sealed = await sealTraining(
        { weeklyTarget: body.weeklyTarget },
        env.GYMMASTER_API_KEY,
        "control.club-target",
      );
      await controlData(env, "/club-target", { sealed });
    } else if (path === "/api/control/club/events/save") {
      let event;
      try {
        event = parseClubEvent(body);
      } catch {
        return apiJson({ error: "invalid_event" }, 400);
      }
      const sealed = await sealTraining(
        event,
        env.GYMMASTER_API_KEY,
        "control.event:" + event.id,
      );
      await controlData(env, "/club-event", { id: event.id, sealed });
    } else if (path === "/api/control/club/events/remove") {
      if (typeof body.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(body.id))
        return apiJson({ error: "invalid_request" }, 400);
      await controlData(env, "/club-event-remove", { id: body.id });
    } else return apiJson({ error: "not_found" }, 404);
    return apiJson({ saved: true });
  } catch {
    return apiJson({ error: "club_unavailable" }, 503);
  }
}
