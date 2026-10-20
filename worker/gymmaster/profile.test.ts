import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../index";
import { sealSession, SESSION_COOKIE } from "./session";
const secret = "test-api-key",
  token = "test-member-token";
const member = {
  id: 42,
  firstname: "Alex",
  surname: "Example",
  totalvisits: 123,
  email: "private@example.test",
  dob: "1990-01-01",
  addressstreet: "private-address",
  linked_members: [{ id: 43 }],
  memberphoto: "https://private.test/photo",
};
const config = (): Env => ({
  GYMMASTER_API_KEY: secret,
  LOGIN_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
  ASSETS: { fetch: vi.fn(async () => new Response("assets")) },
});
async function request(
  path = "/api/gymmaster/profile",
  options: RequestInit = {},
) {
  const cookie = await sealSession(
    { token, memberId: 42, expiresAt: Date.now() + 60000 },
    secret,
  );
  return new Request("https://example.test" + path, {
    ...options,
    headers: { Cookie: `${SESSION_COOKIE}=${cookie}`, ...options.headers },
  });
}
afterEach(() => vi.restoreAllMocks());
describe("authenticated member profile", () => {
  it("uses the fixed documented endpoint, verifies member identity and returns only name and total visits", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ result: member, error: "" }));
    const response = await worker.fetch(await request(), config());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      profile: { firstName: "Alex", lastName: "Example", totalVisits: 123 },
    });
    const [input, options] = network.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe(
      "https://hiitco.gymmasteronline.com/portal/api/v1/member/profile",
    );
    expect(url.searchParams.get("token")).toBe(token);
    expect(url.searchParams.get("api_key")).toBe(secret);
    expect(options?.redirect).toBe("manual");
  });
  it("accepts integer strings and distinguishes unknown total visits from zero", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    for (const totalvisits of ["123", 0, null, undefined]) {
      network.mockResolvedValueOnce(
        Response.json({ result: { ...member, id: "42", totalvisits } }),
      );
      const response = await worker.fetch(await request(), config());
      expect(response.status).toBe(200);
      expect((await response.json()).profile.totalVisits).toBe(
        totalvisits == null ? null : Number(totalvisits),
      );
    }
  });
  it("requires an authenticated session, blocks writes and supplied identities without fetching", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    expect(
      (
        await worker.fetch(
          new Request("https://example.test/api/gymmaster/profile"),
          config(),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await worker.fetch(
          await request(undefined, { method: "POST" }),
          config(),
        )
      ).status,
    ).toBe(405);
    expect(
      (
        await worker.fetch(
          await request("/api/gymmaster/profile?memberid=43"),
          config(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await worker.fetch(
          await request(undefined, {
            headers: { "Sec-Fetch-Site": "cross-site" },
          }),
          config(),
        )
      ).status,
    ).toBe(400);
    expect(network).not.toHaveBeenCalled();
  });
  it("refuses mismatched members and malformed profiles without exposing the response", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    for (const result of [
      null,
      [],
      { ...member, id: 43 },
      { ...member, firstname: null },
      { ...member, surname: 42 },
      { ...member, totalvisits: -1 },
      { ...member, totalvisits: false },
      { ...member, totalvisits: 1.5 },
    ]) {
      network.mockResolvedValueOnce(Response.json({ result, private: secret }));
      const response = await worker.fetch(await request(), config());
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "profile_format" });
    }
  });
  it("fails closed on throttling, does not follow redirects and sanitizes provider failures", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    const env = config();
    env.LOGIN_RATE_LIMITER!.limit = async () => ({ success: false });
    expect((await worker.fetch(await request(), env)).status).toBe(429);
    expect(network).not.toHaveBeenCalled();
    network.mockResolvedValueOnce(
      new Response(secret, {
        status: 302,
        headers: { Location: "https://other.test/" },
      }),
    );
    expect(
      await (await worker.fetch(await request(), config())).json(),
    ).toEqual({ error: "provider_redirect" });
    network.mockResolvedValueOnce(Response.json({ error: secret }));
    expect(
      await (await worker.fetch(await request(), config())).json(),
    ).toEqual({ error: "profile_not_available" });
    network.mockRejectedValueOnce(Error(secret));
    expect(
      await (await worker.fetch(await request(), config())).json(),
    ).toEqual({ error: "provider_network_error" });
    network.mockResolvedValueOnce(new Response(secret, { status: 401 }));
    const expired = await worker.fetch(await request(), config());
    expect(expired.status).toBe(401);
    expect(expired.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });
});
