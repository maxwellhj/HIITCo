import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../index";
import { sealSession, SESSION_COOKIE } from "./session";
import { memberCheckinIndex, sealCheckin } from "./checkinRecords";
import { dateKey } from "../../src/domain/attendance";
const apiKey = "fake-member-api-key",
  token = "fake-webhook-token-0123456789abcdefghijkl";
const today = dateKey(new Date());
const record = {
  id: "123",
  date: today,
  localTimestamp: today + "T06:47:30.172346",
  door: "Reception",
};
async function request(
  path = "/api/gymmaster/checkins",
  options: RequestInit = {},
) {
  const cookie = await sealSession(
    { token: "fake-member-token", memberId: 42, expiresAt: Date.now() + 60000 },
    apiKey,
  );
  return new Request("https://example.test" + path, {
    ...options,
    headers: { Cookie: `${SESSION_COOKIE}=${cookie}`, ...options.headers },
  });
}
function config() {
  const store = vi.fn(async (_r: Request) => Response.json({ records: [] }));
  const env: Env = {
    ASSETS: { fetch: vi.fn(async () => new Response("assets")) },
    GYMMASTER_API_KEY: apiKey,
    GYMMASTER_WEBHOOK_TOKEN: token,
    LOGIN_RATE_LIMITER: { limit: async () => ({ success: true }) },
    GYMMASTER_CHECKIN_INBOX: {
      idFromName: (name) => name,
      get: () => ({ fetch: store }),
    },
  };
  return { env, store };
}
beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe("member check-in time API", () => {
  it("queries only the cookie's member, decrypts scoped records and returns minimal uncached data", async () => {
    const { env, store } = config(),
      index = await memberCheckinIndex(42, token);
    store.mockResolvedValueOnce(
      Response.json({ records: [await sealCheckin(record, token, index)] }),
    );
    const response = await worker.fetch(await request(), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      checkins: [record],
      timeZone: "Pacific/Auckland",
    });
    const query = await store.mock.calls[0][0].json();
    expect(query.memberKey).toBe(index);
    expect(JSON.stringify(query)).not.toContain("fake-member-token");
  });
  it("refuses member-ID injection, cross-site reads, writes and missing sessions before storage", async () => {
    const { env, store } = config();
    expect(
      (
        await worker.fetch(
          new Request("https://example.test/api/gymmaster/checkins"),
          env,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await worker.fetch(
          await request("/api/gymmaster/checkins?memberid=43"),
          env,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await worker.fetch(
          await request(undefined, {
            headers: { "Sec-Fetch-Site": "cross-site" },
          }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(
      (await worker.fetch(await request(undefined, { method: "POST" }), env))
        .status,
    ).toBe(405);
    expect(store).not.toHaveBeenCalled();
  });
  it("refuses records encrypted for another member rather than exposing them", async () => {
    const { env, store } = config();
    store.mockResolvedValueOnce(
      Response.json({
        records: [
          await sealCheckin(record, token, await memberCheckinIndex(43, token)),
        ],
      }),
    );
    const response = await worker.fetch(await request(), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "checkins_unavailable",
      code: "GM-CHECKINS-DECRYPT",
    });
  });
  it("does not turn an unavailable inbox into an empty successful history", async () => {
    const { env, store } = config();
    store.mockRejectedValueOnce(Error("private-error"));
    expect((await worker.fetch(await request(), env)).status).toBe(503);
    const response = await worker.fetch(await request(), {
      ...env,
      GYMMASTER_CHECKIN_INBOX: undefined,
    });
    expect(await response.json()).toEqual({
      error: "checkins_unavailable",
      code: "GM-CHECKINS-CONFIG",
    });
  });
});
