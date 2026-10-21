import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../index";
import { SESSION_COOKIE, sealSession } from "./session";
import { dateKey, shiftDate, weekKey } from "../../src/domain/attendance";
const secret = "test-only-api-key",
  token = "test-only-member-token";
const today = dateKey(new Date()),
  start = shiftDate(weekKey(today), -14);
const row = (date = today) => ({
  date,
  visits: 2,
  watervisits: 1,
  bookings: 3,
});
function env(): Env {
  return {
    GYMMASTER_API_KEY: secret,
    LOGIN_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    ASSETS: { fetch: vi.fn(async () => new Response("assets")) },
  };
}
async function request(
  path = "/api/gymmaster/visits",
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
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("authenticated daily visits", () => {
  it("uses only the encrypted member session and returns filtered documented fields", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        result: [
          { ...row(), private: secret },
          row(start),
          row(shiftDate(start, -1)),
          row(shiftDate(today, 1)),
        ],
        error: "",
      }),
    );
    const response = await worker.fetch(await request(), env());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      days: [row(start), row()],
      from: start,
      through: today,
      streak: { count: 1, exact: false },
    });
    const [input, options] = network.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe(
      "https://hiitco.gymmasteronline.com/portal/api/v2/member/visits/daily",
    );
    expect(url.searchParams.get("api_key")).toBe(secret);
    expect(url.searchParams.get("token")).toBe(token);
    expect(url.searchParams.get("startdate")).toBe(
      shiftDate(weekKey(today), -357),
    );
    expect(url.searchParams.get("enddate")).toBe(today);
    expect([...url.searchParams.keys()].sort()).toEqual([
      "api_key",
      "enddate",
      "startdate",
      "token",
    ]);
    expect(options?.redirect).toBe("manual");
    expect(options?.method).toBe("GET");
  });
  it("submits the support-confirmed date parameters using NZ dates across a UTC Sunday boundary", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T11:30:00Z"));
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const query = new URL(String(input)).searchParams;
        if (!query.get("startdate") || !query.get("enddate"))
          return new Response(
            "startdate must be provided. enddate must be provided",
            { status: 400 },
          );
        return Response.json({ result: [row("2026-10-19")] });
      });
    const response = await worker.fetch(await request(), env());
    expect(response.status).toBe(200);
    const query = new URL(String(network.mock.calls[0][0])).searchParams;
    expect(query.get("startdate")).toBe("2025-10-27");
    expect(query.get("enddate")).toBe("2026-10-19");
    expect((await response.json()).days).toEqual([row("2026-10-19")]);
  });
  it("calculates streaks using older returned history without exposing extra daily records", async () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row(shiftDate(weekKey(today), -7 * i)),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ result: rows }),
    );
    const response = await worker.fetch(await request(), env());
    const data = await response.json();
    expect(data.streak).toEqual({ count: 12, exact: false });
    expect(data.days).toHaveLength(3);
    expect(data.days.every((day: { date: string }) => day.date >= start)).toBe(
      true,
    );
  });
  it("loads older pages for exact streaks of 53, 54, 55 and 105 weeks", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    for (const count of [53, 54, 55, 105]) {
      network.mockClear();
      const monday = weekKey(today);
      const breakWeek = shiftDate(monday, -7 * count);
      const history = [
        ...Array.from({ length: count }, (_, i) =>
          row(shiftDate(monday, -7 * i)),
        ),
        ...Array.from({ length: 7 }, (_, i) => ({
          ...row(shiftDate(breakWeek, i)),
          visits: 0,
          watervisits: 0,
        })),
      ];
      network.mockImplementation(async (input) => {
        const query = new URL(String(input)).searchParams;
        return Response.json({
          result: history.filter(
            (day) =>
              day.date >= query.get("startdate")! &&
              day.date <= query.get("enddate")!,
          ),
        });
      });
      const response = await worker.fetch(await request(), env());
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.streak).toEqual({ count, exact: true });
      expect(data.days).toHaveLength(3);
      expect(network).toHaveBeenCalledTimes(count > 104 ? 3 : 2);
      for (let i = 1; i < network.mock.calls.length; i++) {
        const previous = new URL(String(network.mock.calls[i - 1][0]))
          .searchParams;
        const current = new URL(String(network.mock.calls[i][0])).searchParams;
        expect(current.get("enddate")).toBe(
          shiftDate(previous.get("startdate")!, -1),
        );
      }
    }
  });
  it("extends a previous-week streak when the current week has not been attended", async () => {
    const monday = weekKey(today);
    const history = Array.from({ length: 55 }, (_, i) =>
      row(shiftDate(monday, -7 * (i + 1))),
    );
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const query = new URL(String(input)).searchParams;
        return Response.json({
          result: history.filter(
            (day) =>
              day.date >= query.get("startdate")! &&
              day.date <= query.get("enddate")!,
          ),
        });
      });
    const response = await worker.fetch(await request(), env());
    expect((await response.json()).streak).toEqual({ count: 55, exact: false });
    expect(network).toHaveBeenCalledTimes(2);
  });
  it("retains confirmed recent attendance if an older page fails, but respects session expiry", async () => {
    const history = Array.from({ length: 52 }, (_, i) =>
      row(shiftDate(weekKey(today), -7 * i)),
    );
    const network = vi.spyOn(globalThis, "fetch");
    network
      .mockResolvedValueOnce(Response.json({ result: history }))
      .mockResolvedValueOnce(new Response(secret, { status: 500 }));
    const response = await worker.fetch(await request(), env());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.days).toHaveLength(3);
    expect(data.streak).toEqual({ count: 52, exact: false });
    expect(JSON.stringify(data)).not.toContain(secret);
    network
      .mockResolvedValueOnce(Response.json({ result: history }))
      .mockResolvedValueOnce(new Response(secret, { status: 401 }));
    const expired = await worker.fetch(await request(), env());
    expect(expired.status).toBe(401);
    expect(expired.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });
  it("blocks missing sessions, writes, cross-site access and caller-supplied identity before fetching", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(Error("should not run"));
    expect(
      (
        await worker.fetch(
          new Request("https://example.test/api/gymmaster/visits"),
          env(),
        )
      ).status,
    ).toBe(401);
    expect(
      (await worker.fetch(await request(undefined, { method: "POST" }), env()))
        .status,
    ).toBe(405);
    expect(
      (
        await worker.fetch(
          await request("/api/gymmaster/visits?memberid=123"),
          env(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await worker.fetch(
          await request(undefined, {
            headers: { "Sec-Fetch-Site": "cross-site" },
          }),
          env(),
        )
      ).status,
    ).toBe(400);
    expect(network).not.toHaveBeenCalled();
  });
  it("fails closed when throttled and clears a rejected upstream session", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    const config = env();
    config.LOGIN_RATE_LIMITER!.limit = async () => ({ success: false });
    expect((await worker.fetch(await request(), config)).status).toBe(429);
    expect(network).not.toHaveBeenCalled();
    network.mockResolvedValueOnce(new Response(secret, { status: 401 }));
    const response = await worker.fetch(await request(), env());
    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(await response.json()).toEqual({ error: "session_expired" });
  });
  it("reports empty results without inventing zero visits", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ result: [] }),
    );
    const response = await worker.fetch(await request(), env());
    expect(await response.json()).toEqual({
      days: [],
      from: start,
      through: today,
      streak: { count: null, exact: false },
    });
  });
  it("rejects malformed responses, dates, duplicates and invalid counts without exposing payloads", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    for (const result of [
      null,
      {},
      [{ ...row(), date: "2026-02-30" }],
      [{ ...row(), visits: -1 }],
      [{ ...row(), visits: false }],
      [{ ...row(), watervisits: 3 }],
      [{ ...row(), bookings: 0.5 }],
      [row(), row()],
    ]) {
      network.mockResolvedValueOnce(Response.json({ result, private: secret }));
      const response = await worker.fetch(await request(), env());
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "visits_format" });
    }
    network.mockResolvedValueOnce(Response.json({ error: secret }));
    expect(await (await worker.fetch(await request(), env())).json()).toEqual({
      error: "visits_not_available",
    });
    network.mockResolvedValueOnce(
      new Response(secret, {
        status: 302,
        headers: { Location: "https://other.test" },
      }),
    );
    expect(await (await worker.fetch(await request(), env())).json()).toEqual({
      error: "provider_redirect",
    });
    network.mockRejectedValueOnce(Error(secret));
    expect(await (await worker.fetch(await request(), env())).json()).toEqual({
      error: "provider_network_error",
    });
  });
});
