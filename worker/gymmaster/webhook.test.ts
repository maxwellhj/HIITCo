import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../index";
const secret = "test-only-webhook-token-0123456789abcdef";
const event = {
  event_id: 338514,
  event_type: "member_checkin",
  event_timestamp: "2026-05-22T19:28:10.472+12",
  processed_at: "2026-05-22T19:28:15.608+12",
  payload: {
    memberid: 9226,
    companyid: 4,
    private_field: "must-not-appear-in-response-or-logs",
  },
};
function request(body: unknown = event, token = secret, method = "POST") {
  return new Request("https://example.test/api/gymmaster/webhooks/checkin", {
    method,
    headers: { "Content-Type": "application/json", "X-Gymmaster-Token": token },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}
function config() {
  const store = vi.fn(async (_request: Request) =>
    Response.json({ received: true, duplicate: false }),
  );
  const env: Env = {
    ASSETS: { fetch: vi.fn(async () => new Response("assets")) },
    GYMMASTER_WEBHOOK_TOKEN: secret,
    GYMMASTER_CHECKIN_INBOX: {
      idFromName: (name) => name,
      get: () => ({ fetch: store }),
    },
  };
  return { env, store };
}
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe("GymMaster webhook receiver", () => {
  it("authenticates the header, durably stores an encrypted envelope and logs only schema metadata", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const { env, store } = config();
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      received: true,
      duplicate: false,
      test: false,
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const stored = await store.mock.calls[0][0].json();
    expect(stored.key).toBe("live:338514");
    expect(stored.sealed).toMatch(/^[A-Za-z0-9+/]+=*$/);
    const material = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`hiitco.webhook.inbox-key.v1:${secret}`),
    );
    const key = await crypto.subtle.importKey(
      "raw",
      material,
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const bytes = Uint8Array.from(atob(stored.sealed), (c) => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes.slice(0, 12),
        additionalData: new TextEncoder().encode("hiitco.webhook.inbox.v1"),
      },
      key,
      bytes.slice(12),
    );
    expect(JSON.parse(new TextDecoder().decode(plain))).toEqual(event);
    const logs = JSON.stringify(log.mock.calls);
    expect(logs).not.toContain(secret);
    expect(logs).not.toContain(event.payload.private_field);
    expect(logs).not.toContain("9226");
  });
  it("accepts the observed Member Checkin test format without inventing a timezone or processed time", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { env, store } = config();
    const actualShape = {
      event_id: 46238,
      event_type: "member_checkin",
      event_timestamp: "2026-10-22T07:09:24.906388",
      processed_at: null,
      payload: {
        id: 123,
        access: "granted",
        cardno: null,
        doorid: 1,
        origin: "staff",
        source: "manual check in",
        comment: null,
        doorname: "Reception",
        memberid: 42,
        bookingid: null,
        timestamp: "2026-10-22 06:47:30.172346",
        membername: "Example Member",
        booking_name: null,
        membershipid: 100,
        test_webhook: true,
        membershipname: "Example membership",
        booking_checkin: false,
        booking_parentid: null,
      },
    };
    const response = await worker.fetch(request(actualShape), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      received: true,
      duplicate: false,
      test: true,
    });
    expect((await store.mock.calls[0][0].json()).key).toBe("test:46238");
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
      "Example Member",
    );
  });
  it("returns only fixed diagnostic codes for configuration and inbox failures", async () => {
    const { env, store } = config();
    expect(
      (
        await (
          await worker.fetch(request(), {
            ...env,
            GYMMASTER_WEBHOOK_TOKEN: "short",
          })
        ).json()
      ).code,
    ).toBe("GM-WEBHOOK-TOKEN-FORMAT");
    expect(
      (
        await (
          await worker.fetch(request(), {
            ...env,
            GYMMASTER_CHECKIN_INBOX: undefined,
          })
        ).json()
      ).code,
    ).toBe("GM-WEBHOOK-INBOX-MISSING");
    store.mockResolvedValueOnce(
      Response.json({ code: "GM-WEBHOOK-INBOX-WRITE" }, { status: 503 }),
    );
    expect((await (await worker.fetch(request(), env)).json()).code).toBe(
      "GM-WEBHOOK-INBOX-WRITE",
    );
    store.mockResolvedValueOnce(
      Response.json({ code: secret }, { status: 503 }),
    );
    const response = await worker.fetch(request(), env);
    expect(await response.json()).toEqual({
      error: "webhook_unavailable",
      code: "GM-WEBHOOK-STORAGE",
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      secret,
    );
  });
  it("keeps test events separate and acknowledges a duplicate without inventing a visit", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { env, store } = config();
    store.mockResolvedValueOnce(
      Response.json({ received: true, duplicate: true }),
    );
    const response = await worker.fetch(
      request({ ...event, payload: { ...event.payload, test_webhook: true } }),
      env,
    );
    expect(await response.json()).toEqual({
      received: true,
      duplicate: true,
      test: true,
    });
    expect((await store.mock.calls[0][0].json()).key).toBe("test:338514");
  });
  it("fails closed without configuration and rejects missing or wrong tokens before storage", async () => {
    const { env, store } = config();
    for (const key of [undefined, "short"]) {
      expect(
        (
          await worker.fetch(request(), {
            ...env,
            GYMMASTER_WEBHOOK_TOKEN: key,
          })
        ).status,
      ).toBe(503);
    }
    expect(
      (
        await worker.fetch(request(), {
          ...env,
          GYMMASTER_CHECKIN_INBOX: undefined,
        })
      ).status,
    ).toBe(503);
    for (const token of ["", secret + "wrong", "x".repeat(300)])
      expect((await worker.fetch(request(event, token), env)).status).toBe(401);
    expect(store).not.toHaveBeenCalled();
  });
  it("rejects public reads, malformed envelopes and oversized deliveries", async () => {
    const { env, store } = config();
    expect(
      (await worker.fetch(request(undefined, secret, "GET"), env)).status,
    ).toBe(405);
    for (const value of [
      null,
      [],
      {},
      { ...event, event_id: -1 },
      { ...event, event_timestamp: "2026-02-30T12:00:00Z" },
      { ...event, payload: [] },
      { ...event, payload: { large: "x".repeat(33000) } },
    ])
      expect((await worker.fetch(request(value), env)).status).toBe(400);
    expect(store).not.toHaveBeenCalled();
  });
  it("returns a retryable failure when storage fails, never false success or private error text", async () => {
    const { env, store } = config();
    store.mockRejectedValueOnce(Error(secret));
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "webhook_unavailable",
      code: "GM-WEBHOOK-STORAGE",
    });
  });
});
