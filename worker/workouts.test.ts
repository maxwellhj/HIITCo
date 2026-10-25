import { afterEach, describe, it, expect, vi } from "vitest";
import worker, { type Env } from "./index";
import { sealSession, sessionCookie } from "./gymmaster/session";
const secret = "test-only-api-key";
const env: Env = {
  ASSETS: { fetch: async () => new Response("app") },
  GYMMASTER_API_KEY: secret,
};
export const workoutFixture = {
  date: "2026-10-26",
  timeZone: "Pacific/Auckland",
  block: "Strength",
  category: "Strength",
  programWeek: 3,
  weekBeginning: "2026-10-26",
  day: "Monday",
  publishedAt: "2026-10-25T04:00:00Z",
  stations: Array.from({ length: 9 }, (_, i) => ({
    station: i + 1,
    workout:
      i === 0
        ? "Back squat 5 reps\nBench Press 8 reps"
        : "Workout text\nSecond line",
    chow: i === 0,
  })),
};
async function request(
  query = "?date=2026-10-26",
  method = "GET",
  authenticated = true,
) {
  return new Request("https://example.test/api/gymmaster/workouts" + query, {
    method,
    headers: authenticated
      ? {
          Cookie: sessionCookie(
            await sealSession(
              {
                token: "private-member-token",
                memberId: 42,
                expiresAt: Date.now() + 60000,
              },
              secret,
            ),
            60,
          ).split(";")[0],
        }
      : {},
  });
}
afterEach(() => vi.restoreAllMocks());
describe("published workout feed", () => {
  it("fetches only the fixed read-only builder URL without sending member credentials", async () => {
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(workoutFixture));
    const response = await worker.fetch(await request(), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ workout: workoutFixture });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const [url, options] = upstream.mock.calls[0];
    expect(url).toBe(
      "https://hiit-co-workout-builder.maxwellhj.workers.dev/api/workouts/current?date=2026-10-26",
    );
    expect(options?.headers).toEqual({ Accept: "application/json" });
    expect(options?.redirect).toBe("manual");
  });
  it("uses the direct builder binding without forwarding session cookies or using public fetch", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    const direct = vi.fn(async (request: Request) => {
      expect(request.url).toBe(
        "https://hiit-co-workout-builder.maxwellhj.workers.dev/api/workouts/current?date=2026-10-26",
      );
      expect(request.method).toBe("GET");
      expect(request.headers.get("cookie")).toBeNull();
      expect(request.headers.get("authorization")).toBeNull();
      expect([...request.headers.keys()]).toEqual(["accept"]);
      return Response.json(workoutFixture);
    });
    const response = await worker.fetch(await request(), {
      ...env,
      WORKOUT_BUILDER: { fetch: direct },
    });
    expect(response.status).toBe(200);
    expect(direct).toHaveBeenCalledTimes(1);
    expect(upstream).not.toHaveBeenCalled();
    expect(
      (
        await worker.fetch(await request("?date=2026-10-26", "GET", false), {
          ...env,
          WORKOUT_BUILDER: { fetch: direct },
        })
      ).status,
    ).toBe(401);
    expect(direct).toHaveBeenCalledTimes(1);
  });
  it("does not call routing 404s unpublished, or expose arbitrary upstream bodies", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    for (const result of [
      new Response("private edge error", { status: 404 }),
      Response.json({ error: "Not found" }, { status: 404 }),
      Response.json(
        { error: "No published workout for this date", date: "2026-10-19" },
        { status: 404 },
      ),
    ]) {
      upstream.mockResolvedValueOnce(result);
      const response = await worker.fetch(await request(), env);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: "workout_unavailable",
        code: "WORKOUT-HTTP-404",
        date: "2026-10-26",
      });
    }
  });
  it("rejects unauthenticated, injected and invalid requests before contacting the builder", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    for (const [query, method, auth, status] of [
      ["?date=2026-10-26", "GET", false, 401],
      ["?date=2026-02-30", "GET", true, 400],
      ["?date=2026-10-26&memberid=43", "GET", true, 400],
      ["?date=2026-10-26&date=2026-10-27", "GET", true, 400],
      ["", "POST", true, 405],
    ] as const)
      expect(
        (await worker.fetch(await request(query, method, auth), env)).status,
      ).toBe(status);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("distinguishes drafts and overlap; never substitutes sample plans or exposes upstream errors", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    for (const [status, error] of [
      [404, "workout_unpublished"],
      [409, "workout_overlap"],
      [500, "workout_unavailable"],
      [302, "workout_unavailable"],
    ] as const) {
      upstream.mockResolvedValueOnce(
        status === 404
          ? Response.json(
              {
                error: "No published workout for this date",
                date: "2026-10-26",
                timeZone: "Pacific/Auckland",
              },
              { status },
            )
          : status === 409
            ? Response.json(
                {
                  error:
                    "Multiple published weeks cover this date. Choose a week.",
                  date: "2026-10-26",
                },
                { status },
              )
            : new Response("private upstream body", { status }),
      );
      const response = await worker.fetch(await request(), env);
      expect((await response.json()).error).toBe(error);
    }
    for (const fixture of [
      { ...workoutFixture, date: "2026-10-27" },
      { ...workoutFixture, stations: [] },
      { ...workoutFixture, weekBeginning: "2026-10-19" },
    ]) {
      upstream.mockResolvedValueOnce(Response.json(fixture));
      expect((await worker.fetch(await request(), env)).status).toBe(502);
    }
  });
});
