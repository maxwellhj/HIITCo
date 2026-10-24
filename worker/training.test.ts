import { afterEach, describe, it, expect, vi } from "vitest";
import worker, { type Env } from "./index";
import { sealSession, sessionCookie } from "./gymmaster/session";
import { emptyTrainingLog } from "../src/domain/training";
import { dateKey } from "../src/domain/attendance";
import { openTraining, sealTraining, trainingMemberKey } from "./training";
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
          const key = String(id),
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
  return new Request("https://example.test/api/gymmaster/training" + query, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function log() {
  const data = emptyTrainingLog();
  data.sessions.push({
    id: "session-1",
    exerciseId: "back-squat",
    date: dateKey(new Date()),
    createdAt: "2026-10-01T06:00:00Z",
    sets: [
      { reps: 8, weight: 60 },
      { reps: 6, weight: 65 },
    ],
  });
  return data;
}
afterEach(() => vi.restoreAllMocks());
describe("private member training logs", () => {
  it("saves encrypted account logs, restores them, and isolates members without exposing identity", async () => {
    const { env, records } = environment();
    const initial = await worker.fetch(await request(), env);
    expect(await initial.json()).toEqual({
      log: emptyTrainingLog(),
      revision: 0,
    });
    expect(
      await (
        await worker.fetch(await request(42, { log: log(), revision: 0 }), env)
      ).json(),
    ).toEqual({ revision: 1 });
    const stored = [...records.values()][0].sealed;
    expect(stored).not.toContain("back-squat");
    expect(stored).not.toContain("weight");
    expect(await (await worker.fetch(await request(), env)).json()).toEqual({
      log: log(),
      revision: 1,
    });
    expect(await (await worker.fetch(await request(43), env)).json()).toEqual({
      log: emptyTrainingLog(),
      revision: 0,
    });
    const key = await trainingMemberKey(42, secret);
    expect(await openTraining(stored, secret, key)).toMatchObject({
      version: 1,
    });
    await expect(
      openTraining(stored, secret, await trainingMemberKey(43, secret)),
    ).rejects.toThrow();
  });
  it("rejects stale revisions rather than overwriting another save", async () => {
    const { env } = environment();
    expect(
      (await worker.fetch(await request(42, { log: log(), revision: 0 }), env))
        .status,
    ).toBe(200);
    const changed = log();
    changed.sessions[0].sets[0].weight = 1;
    expect(
      (
        await worker.fetch(
          await request(42, { log: changed, revision: 0 }),
          env,
        )
      ).status,
    ).toBe(409);
    expect(
      (await (await worker.fetch(await request(), env)).json()).log.sessions[0]
        .sets[0].weight,
    ).toBe(60);
  });
  it("rejects unauthenticated, cross-origin and member ID injection attempts", async () => {
    const { env, records } = environment();
    expect((await worker.fetch(await request(null), env)).status).toBe(401);
    expect(
      (await worker.fetch(await request(42, undefined, "?memberid=43"), env))
        .status,
    ).toBe(403);
    expect(
      (
        await worker.fetch(
          await request(
            42,
            { log: log(), revision: 0 },
            "",
            "https://evil.test",
          ),
          env,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await worker.fetch(
          await request(42, { log: log(), revision: 0, memberId: 43 }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(records.size).toBe(0);
  });
  it("validates sets, exercise references, dates, duplicates and storage availability", async () => {
    const { env } = environment();
    for (const modify of [
      (l: ReturnType<typeof log>) => {
        l.sessions[0].sets[0].reps = 0;
      },
      (l: ReturnType<typeof log>) => {
        l.sessions[0].exerciseId = "unknown";
      },
      (l: ReturnType<typeof log>) => {
        l.sessions[0].date = "2099-01-01";
      },
      (l: ReturnType<typeof log>) => {
        l.sessions.push(l.sessions[0]);
      },
    ]) {
      const data = log();
      modify(data);
      expect(
        (await worker.fetch(await request(42, { log: data, revision: 0 }), env))
          .status,
      ).toBe(400);
    }
    delete env.MEMBER_TRAINING_LOGS;
    expect((await worker.fetch(await request(), env)).status).toBe(503);
  });
  it("refuses rate-limited requests and swapped/tampered ciphertext", async () => {
    const { env, records } = environment();
    await worker.fetch(await request(42, { log: log(), revision: 0 }), env);
    const key = await trainingMemberKey(42, secret);
    records.set(key, {
      revision: 1,
      sealed: await sealTraining(
        log(),
        secret,
        await trainingMemberKey(43, secret),
      ),
    });
    expect((await worker.fetch(await request(), env)).status).toBe(503);
    env.LOGIN_RATE_LIMITER = { limit: async () => ({ success: false }) };
    expect((await worker.fetch(await request(), env)).status).toBe(429);
  });
});
