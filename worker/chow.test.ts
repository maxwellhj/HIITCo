import { describe, it, expect } from "vitest";
import worker, { type Env } from "./index";
import { sealSession, sessionCookie } from "./gymmaster/session";
import { chowChallenge, emptyChowLog } from "../src/domain/chow";
import { sealTraining, trainingMemberKey } from "./training";
import { dateKey, weekKey } from "../src/domain/attendance";
import { emptyTrainingLog } from "../src/domain/training";
const secret = "fake-chow-api-key";
function environment() {
  const records = new Map<string, { sealed: string; revision: number }>();
  const env: Env = {
    ASSETS: { fetch: async () => new Response("app") },
    GYMMASTER_API_KEY: secret,
    LOGIN_RATE_LIMITER: { limit: async () => ({ success: true }) },
    MEMBER_TRAINING_LOGS: {
      idFromName: (name) => name,
      get: (id) => ({
        fetch: async (req) => {
          const key = String(id) + new URL(req.url).pathname,
            current = records.get(key) ?? { sealed: null, revision: 0 };
          if (req.method === "GET") return Response.json(current);
          const body = (await req.json()) as {
            sealed: string;
            revision: number;
          };
          if (body.revision !== current.revision)
            return new Response(null, { status: 409 });
          records.set(key, {
            sealed: body.sealed,
            revision: body.revision + 1,
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
  path = "chow",
  origin = "https://example.test",
) {
  const headers: Record<string, string> = {
    Origin: origin,
    "Content-Type": "application/json",
  };
  if (memberId)
    headers.Cookie = sessionCookie(
      await sealSession(
        { token: "fake-token", memberId, expiresAt: Date.now() + 60000 },
        secret,
      ),
      60,
    ).split(";")[0];
  return new Request("https://example.test/api/gymmaster/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function sample() {
  const today = dateKey(new Date()),
    c = await chowChallenge({
      block: "Strength",
      weekBeginning: weekKey(today),
      programWeek: 1,
      station: 1,
      workout: "Sprawls and tuck jumps",
    });
  return {
    version: 1 as const,
    challenges: [c],
    scores: [
      {
        id: "score-1",
        challengeId: c.id,
        date: today,
        score: 120,
        unit: "sets" as const,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}
describe("private CHOW account storage", () => {
  it("encrypts and restores scores only for the signed-in member, independently of exercise logs", async () => {
    const { env, records } = environment(),
      log = await sample();
    expect(await (await worker.fetch(await request(), env)).json()).toEqual({
      log: emptyChowLog(),
      revision: 0,
    });
    expect(
      (await worker.fetch(await request(42, { log, revision: 0 }), env)).status,
    ).toBe(200);
    expect(await (await worker.fetch(await request(), env)).json()).toEqual({
      log,
      revision: 1,
    });
    expect(await (await worker.fetch(await request(43), env)).json()).toEqual({
      log: emptyChowLog(),
      revision: 0,
    });
    expect(
      await (
        await worker.fetch(await request(42, undefined, "training"), env)
      ).json(),
    ).toEqual({ log: emptyTrainingLog(), revision: 0 });
    const stored = [...records.values()][0].sealed;
    expect(stored).not.toContain("Sprawls");
    expect(stored).not.toContain("challengeId");
  });
  it("rejects stale saves, forged challenge identity and invalid scores without overwriting history", async () => {
    const { env } = environment(),
      log = await sample();
    await worker.fetch(await request(42, { log, revision: 0 }), env);
    expect(
      (await worker.fetch(await request(42, { log, revision: 0 }), env)).status,
    ).toBe(409);
    const bad = structuredClone(log);
    bad.challenges[0].workout = "Forged new workout";
    expect(
      (await worker.fetch(await request(42, { log: bad, revision: 1 }), env))
        .status,
    ).toBe(400);
    const invalid = structuredClone(log);
    invalid.scores[0].score = -1;
    expect(
      (
        await worker.fetch(
          await request(42, { log: invalid, revision: 1 }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(
      (await (await worker.fetch(await request(), env)).json()).log,
    ).toEqual(log);
  });
  it("allows only sets for new scores while retaining unchanged legacy records", async () => {
    const { env, records } = environment();
    const legacy = await sample();
    (legacy.scores[0] as { unit: string }).unit = "reps";
    const key = await trainingMemberKey(42, secret);
    records.set(key + "/chow", {
      revision: 1,
      sealed: await sealTraining(legacy, secret, key + ":chow-v1"),
    });
    const next = structuredClone(legacy);
    next.scores.push({
      ...next.scores[0],
      id: "new-sets",
      score: 8,
      unit: "sets",
    });
    expect(
      (await worker.fetch(await request(42, { log: next, revision: 1 }), env))
        .status,
    ).toBe(200);
    const invalid = structuredClone(next);
    (invalid.scores[1] as { unit: string }).unit = "calories";
    expect(
      (
        await worker.fetch(
          await request(42, { log: invalid, revision: 2 }),
          env,
        )
      ).status,
    ).toBe(400);
    const saved = await (await worker.fetch(await request(), env)).json();
    expect(saved.log.scores.map((s: { unit: string }) => s.unit)).toEqual([
      "reps",
      "sets",
    ]);
  });
  it("enforces session identity, origin checks, query restrictions and rate limits", async () => {
    const { env } = environment();
    expect((await worker.fetch(await request(null), env)).status).toBe(401);
    expect(
      (
        await worker.fetch(
          await request(
            42,
            { log: await sample(), revision: 0 },
            "chow",
            "https://evil.test",
          ),
          env,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await worker.fetch(
          await request(42, undefined, "chow?memberId=43"),
          env,
        )
      ).status,
    ).toBe(403);
    env.LOGIN_RATE_LIMITER = { limit: async () => ({ success: false }) };
    expect((await worker.fetch(await request(), env)).status).toBe(429);
  });
});
