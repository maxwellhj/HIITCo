import { apiJson, limitedText, type AuthEnv } from "./gymmaster/auth";
import { readSession, clearSessionCookie } from "./gymmaster/session";
import { dateKey } from "../src/domain/attendance";
import { validDate } from "../src/domain/training";
import { parsePublishedWorkout } from "../src/domain/publishedWorkouts";
const FEED =
  "https://hiit-co-workout-builder.maxwellhj.workers.dev/api/workouts/current";
export interface WorkoutEnv extends AuthEnv {
  WORKOUT_BUILDER?: { fetch(request: Request): Promise<Response> };
}
export async function memberWorkouts(
  request: Request,
  env: WorkoutEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/gymmaster/workouts") return null;
  if (request.method !== "GET")
    return apiJson({ error: "method_not_allowed" }, 405, { Allow: "GET" });
  const date = url.searchParams.get("date") ?? dateKey(new Date());
  if (
    [...url.searchParams.keys()].some((k) => k !== "date") ||
    url.searchParams.getAll("date").length > 1 ||
    !validDate(date) ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    return apiJson({ error: "invalid_request" }, 400);
  if (!(await readSession(request, env.GYMMASTER_API_KEY)))
    return apiJson({ error: "session_expired" }, 401, {
      "Set-Cookie": clearSessionCookie(),
    });
  let stage = "WORKOUT-CONNECTION";
  try {
    const feedRequest = new Request(`${FEED}?date=${date}`, {
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    // Same-account Worker calls use a service binding instead of the public edge.
    const response = env.WORKOUT_BUILDER
      ? await env.WORKOUT_BUILDER.fetch(feedRequest)
      : await fetch(feedRequest.url, {
          headers: { Accept: "application/json" },
          redirect: "manual",
          signal: feedRequest.signal,
        });
    stage = `WORKOUT-HTTP-${response.status}`;
    if (!response.headers.get("Content-Type")?.includes("application/json"))
      throw Error();
    const value: unknown = JSON.parse(await limitedText(response.body, 100000));
    const error =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : null;
    if (
      response.status === 404 &&
      error?.date === date &&
      error.error === "No published workout for this date"
    ) {
      console.info("WORKOUT-NOT-PUBLISHED", { date });
      return apiJson({ error: "workout_unpublished", date }, 404);
    }
    if (
      response.status === 409 &&
      error?.date === date &&
      typeof error.error === "string" &&
      error.error.startsWith("Multiple published ")
    ) {
      console.info("WORKOUT-OVERLAP", { date });
      return apiJson({ error: "workout_overlap", date }, 409);
    }
    if (!response.ok) throw Error();
    stage = "WORKOUT-FORMAT";
    const workout = parsePublishedWorkout(value, date);
    console.info("WORKOUT-READY", { date });
    return apiJson({ workout });
  } catch {
    console.error(stage, { date });
    return apiJson({ error: "workout_unavailable", code: stage, date }, 502);
  }
}
