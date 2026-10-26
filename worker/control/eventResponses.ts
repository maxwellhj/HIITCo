import { apiJson, limitedText } from "../gymmaster/auth";
import { readSession } from "../gymmaster/session";
import { sealTraining, openTraining, trainingMemberKey } from "../training";
import { controlData, type ControlDataEnv } from "./data";
import type { ControlEnv } from "./access";
import { parseClubEvent } from "../../src/domain/club";
import type { EventResponse } from "../../src/domain/events";
const states = ["going", "maybe", "cant_attend"];
export async function ownEventResponses(
  env: ControlDataEnv,
  memberKey: string,
): Promise<EventResponse[]> {
  const data = await controlData(
    env,
    "/event-responses?memberKey=" + memberKey,
  );
  return Promise.all(
    data.rows.map(async (r: { event_id: string; sealed: string }) => ({
      eventId: r.event_id,
      ...(await openTraining(
        r.sealed,
        env.GYMMASTER_API_KEY!,
        "control.event-response:" + memberKey + ":" + r.event_id,
      )),
    })),
  );
}
export async function memberEventResponses(
  env: ControlDataEnv,
  memberKey: string,
) {
  const data = await controlData(env, "/member-events?memberKey=" + memberKey);
  return Promise.all(
    data.rows.map(
      async (r: {
        event_id: string;
        event_sealed: string;
        response_sealed: string | null;
      }) => {
        const event = parseClubEvent(
          await openTraining(
            r.event_sealed,
            env.GYMMASTER_API_KEY!,
            "control.event:" + r.event_id,
          ),
        );
        const response = r.response_sealed
          ? await openTraining(
              r.response_sealed,
              env.GYMMASTER_API_KEY!,
              "control.event-response:" + memberKey + ":" + r.event_id,
            )
          : null;
        return {
          eventId: event.id,
          title: event.title,
          date: event.date,
          time: event.time,
          status: response?.status ?? null,
          updatedAt: response?.updatedAt ?? null,
        };
      },
    ),
  ).then((rows) =>
    rows.sort(
      (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
    ),
  );
}
export async function eventResponseApi(
  request: Request,
  env: ControlEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/gymmaster/event-response") return null;
  if (request.method !== "POST")
    return apiJson({ error: "method_not_allowed" }, 405);
  const session = await readSession(request, env.GYMMASTER_API_KEY);
  if (!session) return apiJson({ error: "session_expired" }, 401);
  if (
    url.search ||
    request.headers.get("Origin") !== url.origin ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    return apiJson({ error: "request_not_allowed" }, 403);
  if (!env.CONTROL_STORE || !env.GYMMASTER_API_KEY)
    return apiJson({ error: "events_unavailable" }, 503);
  try {
    if (
      env.CONTROL_RATE_LIMITER &&
      !(
        await env.CONTROL_RATE_LIMITER.limit({
          key: "rsvp:" + session.memberId,
        })
      ).success
    )
      return apiJson({ error: "too_many_attempts" }, 429);
    if (request.headers.get("Content-Type") !== "application/json")
      return apiJson({ error: "invalid_request" }, 400);
    let body;
    try {
      body = JSON.parse(await limitedText(request.body, 2000));
    } catch {
      return apiJson({ error: "invalid_request" }, 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      Object.keys(body).some((k) => !["eventId", "status"].includes(k)) ||
      typeof body.eventId !== "string" ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(body.eventId) ||
      !states.includes(body.status)
    )
      return apiJson({ error: "invalid_request" }, 400);
    const memberKey = await trainingMemberKey(
      session.memberId,
      env.GYMMASTER_API_KEY,
    );
    const events = await controlData(env, "/club");
    if (!events.rows.some((e: { id: string }) => e.id === body.eventId))
      return apiJson({ error: "event_not_found" }, 404);
    const response = {
      status: body.status,
      updatedAt: new Date().toISOString(),
    };
    const sealed = await sealTraining(
      response,
      env.GYMMASTER_API_KEY,
      "control.event-response:" + memberKey + ":" + body.eventId,
    );
    await controlData(env, "/event-response", {
      memberKey,
      eventId: body.eventId,
      sealed,
    });
    return apiJson({ response: { eventId: body.eventId, ...response } });
  } catch {
    return apiJson({ error: "events_unavailable" }, 503);
  }
}
