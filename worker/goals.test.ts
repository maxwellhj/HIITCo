import { describe, it, expect } from "vitest";
import worker, { type Env } from "./index";
import { sealSession, sessionCookie } from "./gymmaster/session";
import { dateKey } from "../src/domain/attendance";
const secret = "fake-test-api-key";
function environment() {
  const records = new Map<string, { revision: number; sealed: string }>();
  const env: Env = {
    ASSETS: { fetch: async () => new Response("app") },
    GYMMASTER_API_KEY: secret,
    LOGIN_RATE_LIMITER: { limit: async () => ({ success: true }) },
    MEMBER_TRAINING_LOGS: {
      idFromName: (name) => name,
      get: (id) => ({
        fetch: async (request) => {
          const key = String(id) + new URL(request.url).pathname,
            existing = records.get(key) ?? { revision: 0, sealed: null };
          if (request.method === "GET") return Response.json(existing);
          const body = (await request.json()) as {
            revision: number;
            sealed: string;
          };
          if (body.revision !== existing.revision)
            return new Response(null, { status: 409 });
          records.set(key, {
            revision: body.revision + 1,
            sealed: body.sealed,
          });
          return Response.json({ revision: body.revision + 1 });
        },
      }),
    },
  };
  return { env, records };
}
async function request(
  memberId: number | null = 42,
  body?: unknown,
  query = "",
  origin = "https://example.test",
) {
  const headers: Record<string, string> = {};
  if (memberId)
    headers.Cookie = sessionCookie(
      await sealSession(
        {
          token: "fake-provider-token",
          memberId,
          expiresAt: Date.now() + 60000,
        },
        secret,
      ),
      60,
    ).split(";")[0];
  if (body !== undefined) {
    headers.Origin = origin;
    headers["Content-Type"] = "application/json";
  }
  return new Request("https://example.test/api/gymmaster/goals" + query, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const log = () => ({
  goals: [
    {
      id: "goal-1",
      title: "My private goal",
      targetDate: "2027-12-25",
      createdDate: dateKey(new Date()),
      habits: [],
    },
  ],
});
describe("member goals API", () => {
  it("encrypts, restores, isolates members and rejects stale saves", async () => {
    const { env, records } = environment();
    expect(await (await worker.fetch(await request(), env)).json()).toEqual({
      log: { goals: [] },
      revision: 0,
    });
    expect(
      (await worker.fetch(await request(42, { log: log(), revision: 0 }), env))
        .status,
    ).toBe(200);
    expect([...records.values()][0].sealed).not.toContain("My private goal");
    expect(await (await worker.fetch(await request(), env)).json()).toEqual({
      log: log(),
      revision: 1,
    });
    expect(await (await worker.fetch(await request(43), env)).json()).toEqual({
      log: { goals: [] },
      revision: 0,
    });
    expect(
      (await worker.fetch(await request(42, { log: log(), revision: 0 }), env))
        .status,
    ).toBe(409);
    expect(
      (
        await worker.fetch(
          await request(42, { log: { goals: [] }, revision: 1 }),
          env,
        )
      ).status,
    ).toBe(200);
    expect(
      (await (await worker.fetch(await request(), env)).json()).log,
    ).toEqual({ goals: [] });
  });
  it("requires a session, same-origin writes and valid goals", async () => {
    const { env } = environment();
    expect((await worker.fetch(await request(null), env)).status).toBe(401);
    expect(
      (
        await worker.fetch(
          await request(
            42,
            { log: log(), revision: 0 },
            "",
            "https://other.test",
          ),
          env,
        )
      ).status,
    ).toBe(403);
    expect(
      (await worker.fetch(await request(42, undefined, "?memberid=43"), env))
        .status,
    ).toBe(403);
    expect(
      (
        await worker.fetch(
          await request(42, { log: { goals: [{}] }, revision: 0 }),
          env,
        )
      ).status,
    ).toBe(400);
  });
});
