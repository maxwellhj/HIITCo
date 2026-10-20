import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../index";
import {
  readSession,
  sealSession,
  sessionCookie,
  SESSION_COOKIE,
} from "./session";
const secret = "test-only-api-secret-not-real";
const credentials = {
  email: "member@example.test",
  password: "test-only-password",
};
function environment(): Env {
  return {
    ASSETS: { fetch: async () => new Response("app") },
    GYMMASTER_API_KEY: secret,
    LOGIN_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
  };
}
function post(
  body: unknown = credentials,
  headers: Record<string, string> = {},
  path = "/api/gymmaster/login",
) {
  return new Request("https://example.test" + path, {
    method: "POST",
    headers: {
      Origin: "https://example.test",
      "Content-Type": "application/json",
      "CF-Connecting-IP": "192.0.2.1",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
function good(
  result: Record<string, unknown> = {
    token: "test-only-provider-token",
    expires: 3600,
    memberid: 42,
  },
) {
  return Response.json({ result, error: "" });
}
afterEach(() => vi.restoreAllMocks());
describe("GymMaster connection-test login", () => {
  it("uses the documented fixed login endpoint and form fields, returning no password, key or token", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(good());
    const env = environment(),
      response = await worker.fetch(post(), env);
    expect(response.status).toBe(200);
    const text = await response.text();
    for (const value of [
      secret,
      credentials.password,
      "test-only-provider-token",
    ])
      expect(text).not.toContain(value);
    const body = JSON.parse(text);
    expect(body.connected).toBe(true);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, options] = upstream.mock.calls[0];
    expect(url).toBe("https://hiitco.gymmasteronline.com/portal/api/v1/login");
    expect(options?.redirect).toBe("manual");
    expect(options?.method).toBe("POST");
    const form = options?.body as URLSearchParams;
    expect(Object.fromEntries(form)).toEqual({
      api_key: secret,
      ...credentials,
    });
    expect((options?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    for (const flag of [
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Path=/",
      "Max-Age=3600",
    ])
      expect(cookie).toContain(flag);
    expect(cookie).not.toContain("test-only-provider-token");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const restore = await worker.fetch(
      new Request("https://example.test/api/gymmaster/session", {
        headers: { Cookie: cookie.split(";")[0] },
      }),
      env,
    );
    expect(await restore.json()).toEqual(body);
    const session = await readSession(
      new Request("https://example.test", {
        headers: { Cookie: cookie.split(";")[0] },
      }),
      secret,
    );
    expect(session?.memberId).toBe(42);
    expect(session?.token).toBe("test-only-provider-token");
  });
  it("accepts bounded decimal strings for documented integer fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      good({ token: "token", expires: "3600", memberid: "42" }),
    );
    const response = await worker.fetch(post(), environment());
    expect(response.status).toBe(200);
    expect((await response.json()).connected).toBe(true);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
  });
  it("limits a long provider lifetime to one hour", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      good({ token: "token", expires: 86400, memberid: 42 }),
    );
    const response = await worker.fetch(post(), environment());
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=3600");
  });
  it("rejects cross-origin or origin-less login and logout before contacting GymMaster", async () => {
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(Error("Must not call provider"));
    for (const path of ["/api/gymmaster/login", "/api/gymmaster/logout"])
      for (const headers of [
        { Origin: "https://attacker.test" },
        { Origin: "" },
        { Origin: "https://example.test", "Sec-Fetch-Site": "cross-site" },
      ] as Record<string, string>[]) {
        expect(
          (await worker.fetch(post({}, headers, path), environment())).status,
        ).toBe(403);
      }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("blocks missing configuration, rate limiter failures and rate-limited attempts", async () => {
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(Error("Must not call provider"));
    const missing = environment();
    delete missing.GYMMASTER_API_KEY;
    expect((await worker.fetch(post(), missing)).status).toBe(503);
    const noLimiter = environment();
    delete noLimiter.LOGIN_RATE_LIMITER;
    expect((await worker.fetch(post(), noLimiter)).status).toBe(503);
    const failed = environment();
    failed.LOGIN_RATE_LIMITER = {
      limit: vi.fn(async () => {
        throw Error("Limiter unavailable");
      }),
    };
    expect((await worker.fetch(post(), failed)).status).toBe(503);
    for (const results of [[false], [true, false]]) {
      let n = 0;
      const env = environment();
      env.LOGIN_RATE_LIMITER = {
        limit: vi.fn(async () => ({ success: results[n++] ?? false })),
      };
      const r = await worker.fetch(post(), env);
      expect(r.status).toBe(429);
      expect(r.headers.get("Retry-After")).toBe("60");
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects arbitrary API keys, member-ID login, empty credentials and oversized bodies", async () => {
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(Error("Must not call provider"));
    for (const body of [
      { ...credentials, memberid: 42 },
      { ...credentials, api_key: "client-key" },
      { email: "", password: "p" },
      { email: "a@b", password: "" },
      { email: "a@b", password: "x".repeat(5000) },
      null,
      [],
    ])
      expect((await worker.fetch(post(body), environment())).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("does not expose provider errors or credentials, including errors carried in HTTP 200", async () => {
    const provider = vi.spyOn(globalThis, "fetch");
    for (const status of [401, 403, 429, 500]) {
      provider.mockResolvedValueOnce(
        new Response(secret + " " + credentials.password, { status }),
      );
      const response = await worker.fetch(post(), environment());
      expect(response.status).toBe(
        status === 500 ? 502 : status === 403 ? 401 : status,
      );
      const body = await response.text();
      expect(body).not.toContain(secret);
      expect(body).not.toContain(credentials.password);
    }
    provider.mockResolvedValueOnce(
      Response.json({ error: secret, result: null }),
    );
    const rejected = await worker.fetch(post(), environment());
    expect(rejected.status).toBe(401);
    expect(await rejected.text()).not.toContain(secret);
  });
  it("rejects undocumented or malformed result shapes instead of claiming a connection", async () => {
    const provider = vi.spyOn(globalThis, "fetch");
    for (const result of [
      { token: "token", expires: "3.6e3", memberid: 42 },
      { token: "token", expires: 0, memberid: 42 },
      { token: "token", expires: 3600, memberid: " 42" },
      { token: "", expires: 3600, memberid: 42 },
      { token: "x".repeat(2001), expires: 3600, memberid: 42 },
      {},
    ]) {
      provider.mockResolvedValueOnce(good(result));
      const response = await worker.fetch(post(), environment());
      expect(response.status).toBe(502);
      expect(response.headers.get("Set-Cookie")).toBeNull();
    }
    provider.mockResolvedValueOnce(new Response("<html>not JSON</html>"));
    expect((await worker.fetch(post(), environment())).status).toBe(502);
    provider.mockRejectedValueOnce(Error("network details " + secret));
    const error = await worker.fetch(post(), environment());
    expect(error.status).toBe(502);
    expect(await error.text()).not.toContain(secret);
  });
  it("reports only an allowlisted format category, never the provider payload", async () => {
    const provider = vi.spyOn(globalThis, "fetch");
    for (const [body, detail] of [
      [[], "ENVELOPE"],
      [{ unexpected: secret }, "RESULT"],
      [{ result: { token: null, private: secret } }, "TOKEN"],
      [{ result: { token: secret, expires: false } }, "EXPIRY"],
      [{ result: { token: secret, expires: 3600, memberid: true } }, "MEMBER"],
    ] as const) {
      provider.mockResolvedValueOnce(Response.json(body));
      const response = await worker.fetch(post(), environment());
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: "unexpected_response",
        detail,
      });
      expect(response.headers.get("Set-Cookie")).toBeNull();
    }
  });
  it("distinguishes safe diagnostic categories without following redirects or exposing provider data", async () => {
    const provider = vi.spyOn(globalThis, "fetch");
    for (const [upstream, expected] of [
      [
        new Response(secret, {
          status: 302,
          headers: { Location: "https://other.test/" + secret },
        }),
        { error: "provider_redirect" },
      ],
      [
        new Response(secret, { status: 404 }),
        { error: "provider_http_error", providerStatus: 404 },
      ],
      [
        new Response(secret, { status: 503 }),
        { error: "provider_http_error", providerStatus: 503 },
      ],
      [
        new Response("<html>" + secret),
        { error: "unexpected_response", detail: "BODY" },
      ],
      [
        new Response("x".repeat(32769)),
        { error: "unexpected_response", detail: "BODY" },
      ],
    ] as const) {
      provider.mockResolvedValueOnce(upstream);
      const response = await worker.fetch(post(), environment());
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual(expected);
      expect(response.headers.get("Set-Cookie")).toBeNull();
      expect(provider.mock.calls.at(-1)?.[1]?.redirect).toBe("manual");
    }
    provider.mockRejectedValueOnce(new DOMException(secret, "TimeoutError"));
    const timeout = await worker.fetch(post(), environment());
    expect(timeout.status).toBe(504);
    expect(await timeout.json()).toEqual({ error: "provider_timeout" });
    provider.mockRejectedValueOnce(new TypeError(secret));
    expect(await (await worker.fetch(post(), environment())).json()).toEqual({
      error: "provider_network_error",
    });
  });
  it("disconnects with a cleared cookie and refuses methods not supported by each route", async () => {
    const response = await worker.fetch(
      post({}, {}, "/api/gymmaster/logout"),
      environment(),
    );
    expect(await response.json()).toEqual({ connected: false });
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(
      (
        await worker.fetch(
          new Request("https://example.test/api/gymmaster/login"),
          environment(),
        )
      ).status,
    ).toBe(405);
    expect(
      (
        await worker.fetch(
          post({}, {}, "/api/gymmaster/session"),
          environment(),
        )
      ).status,
    ).toBe(405);
  });
});
describe("encrypted member session", () => {
  it("refuses tampered, expired, duplicate and key-rotated cookies", async () => {
    const expiresAt = Date.now() + 60000;
    const sealed = await sealSession(
      { token: "private-token", memberId: 42, expiresAt },
      secret,
    );
    const request = (value: string) =>
      new Request("https://example.test", {
        headers: { Cookie: `${SESSION_COOKIE}=${value}` },
      });
    expect(await readSession(request(sealed), secret)).toMatchObject({
      memberId: 42,
    });
    const tampered = (sealed[0] === "A" ? "B" : "A") + sealed.slice(1);
    expect(await readSession(request(tampered), secret)).toBeNull();
    expect(
      await readSession(request(sealed), secret, expiresAt + 1),
    ).toBeNull();
    expect(await readSession(request(sealed), "replacement-secret")).toBeNull();
    expect(
      await readSession(
        new Request("https://example.test", {
          headers: {
            Cookie: `${SESSION_COOKIE}=${sealed}; ${SESSION_COOKIE}=${sealed}`,
          },
        }),
        secret,
      ),
    ).toBeNull();
    expect(await readSession(request("bad!"), secret)).toBeNull();
  });
  it("returns only disconnected state for an invalid session, and never reveals why", async () => {
    for (const cookie of ["", `${SESSION_COOKIE}=bad`]) {
      const response = await worker.fetch(
        new Request("https://example.test/api/gymmaster/session", {
          headers: { Cookie: cookie },
        }),
        environment(),
      );
      expect(await response.json()).toEqual({ connected: false });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    }
  });
  it("keeps expiry and member validation enforced even for encrypted payloads", async () => {
    const bad = await sealSession(
      { token: "token", memberId: 0, expiresAt: Date.now() + 60000 },
      secret,
    );
    expect(
      await readSession(
        new Request("https://example.test", {
          headers: { Cookie: sessionCookie(bad, 60).split(";")[0] },
        }),
        secret,
      ),
    ).toBeNull();
  });
});
