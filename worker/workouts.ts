import { apiJson, limitedText, type AuthEnv } from "./gymmaster/auth";
import { readSession, clearSessionCookie } from "./gymmaster/session";
import { dateKey } from "../src/domain/attendance";
import { validDate } from "../src/domain/training";
import { parsePublishedWorkout } from "../src/domain/publishedWorkouts";
const FEED =
  "https://hiit-co-workout-builder.maxwellhj.workers.dev/api/workouts/current";
export async function memberWorkouts(
  request: Request,
  env: AuthEnv,
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
  try {
    const response = await fetch(`${FEED}?date=${date}`, {
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404)
      return apiJson({ error: "workout_unpublished", date }, 404);
    if (response.status === 409)
      return apiJson({ error: "workout_overlap", date }, 409);
    if (
      !response.ok ||
      !response.headers.get("Content-Type")?.includes("application/json")
    )
      throw Error();
    const workout = parsePublishedWorkout(
      JSON.parse(await limitedText(response.body, 100000)),
      date,
    );
    return apiJson({ workout });
  } catch {
    return apiJson({ error: "workout_unavailable" }, 502);
  }
}
