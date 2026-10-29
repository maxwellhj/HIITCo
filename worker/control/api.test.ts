import { afterEach, describe, it, expect, vi } from "vitest";
import worker, { type Env } from "../index";
import { registerAppMember } from "./data";
import { sealSession, sessionCookie } from "../gymmaster/session";
import { trainingMemberKey } from "../training";
const secret = "fake-control-member-api-key",
  ip = "203.0.113.7";
const image =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
function environment() {
  const members = new Map<string, string>(),
    catalog = new Map<string, any>(),
    awards = new Map<string, Set<string>>(),
    settings = new Map<string, string>();
  let touches = 0;
  const env: Env = {
    GYMMASTER_API_KEY: secret,
    ASSETS: { fetch: async () => new Response("app") },
    CONTROL_ROOM_ALLOWED_IPS: ip,
    CONTROL_STORE: {
      idFromName: () => "",
      get: () => ({
        fetch: async (request) => {
          touches++;
          const u = new URL(request.url),
            p = u.pathname,
            b =
              request.method === "POST"
                ? ((await request.json()) as any)
                : null;
          if (p === "/register") {
            members.set(b.memberKey, b.sealed);
            return Response.json({ saved: true });
          }
          if (p === "/members")
            return Response.json({
              rows: [...members].map(([member_key, sealed]) => ({
                member_key,
                sealed,
              })),
              next: null,
            });
          if (p === "/member") {
            const id = u.searchParams.get("id")!;
            return Response.json({
              rows: members.has(id)
                ? [{ member_key: id, sealed: members.get(id) }]
                : [],
            });
          }
          if (p === "/trophies")
            return Response.json({
              rows: [...catalog].map(([id, s]) => ({
                id,
                sealed: s.sealed,
                unlock_count: [...awards.values()].filter((set) => set.has(id))
                  .length,
              })),
              awards: [...(awards.get(u.searchParams.get("id")!) ?? [])].map(
                (sticker_id) => ({ sticker_id }),
              ),
            });
          if (p === "/stickers")
            return Response.json({
              rows: [...catalog].map(([id, s]) => ({ id, sealed: s.sealed })),
            });
          if (p === "/sticker") {
            catalog.set(b.id, b);
            return Response.json({ saved: true });
          }
          if (p === "/art") {
            const s = catalog.get(u.searchParams.get("id")!);
            return Response.json({
              rows: s ? [{ art: s.art, mime: s.mime }] : [],
            });
          }
          if (p === "/awards")
            return Response.json({
              awards: [...(awards.get(u.searchParams.get("id")!) ?? [])].map(
                (sticker_id) => ({ sticker_id }),
              ),
            });
          if (p === "/award") {
            const set = awards.get(b.memberKey) ?? new Set<string>();
            b.unlocked ? set.add(b.stickerId) : set.delete(b.stickerId);
            awards.set(b.memberKey, set);
            return Response.json({ saved: true });
          }
          if (p === "/setting") {
            if (b) {
              settings.set(b.id, b.sealed);
              return Response.json({ saved: true });
            }
            const value = settings.get(u.searchParams.get("id")!);
            return Response.json({ rows: value ? [{ sealed: value }] : [] });
          }
          if (p === "/activity")
            return Response.json({ snapshots: [], audit: [], read: [] });
          if (p === "/read") return Response.json({ saved: true });
          return Response.json({ error: "unknown" }, { status: 404 });
        },
      }),
    },
  };
  return { env, members, catalog, awards, settings, touches: () => touches };
}
async function req(
  path: string,
  body?: unknown,
  options: { ip?: string; memberId?: number; origin?: string } = {},
) {
  const headers: Record<string, string> = {
    "CF-Connecting-IP": options.ip ?? ip,
  };
  if (body !== undefined) {
    headers.Origin = options.origin ?? "https://example.test";
    headers["Content-Type"] = "application/json";
  }
  if (options.memberId)
    headers.Cookie = sessionCookie(
      await sealSession(
        {
          token: "fake-provider-token",
          memberId: options.memberId,
          expiresAt: Date.now() + 60000,
        },
        secret,
      ),
      60,
    ).split(";")[0];
  return new Request("https://example.test" + path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
afterEach(() => vi.restoreAllMocks());
describe("Control Room member/sticker/report APIs", () => {
  it("defaults to no private access and rejects outside-network member cookies before reading storage", async () => {
    const { env, touches } = environment();
    delete env.CONTROL_ROOM_ALLOWED_IPS;
    expect(
      (
        await worker.fetch(
          await req("/api/control/members", undefined, { memberId: 42 }),
          env,
        )
      ).status,
    ).toBe(403);
    expect(touches()).toBe(0);
    const status = await (
      await worker.fetch(await req("/api/control/status"), env)
    ).json();
    expect(status.available).toBe(false);
    env.CONTROL_ROOM_ALLOWED_IPS = ip;
    expect(
      (
        await worker.fetch(
          await req("/api/control/members", undefined, {
            ip: "198.51.100.1",
            memberId: 42,
          }),
          env,
        )
      ).status,
    ).toBe(403);
    expect(touches()).toBe(0);
  });
  it("registers only verified app profile metadata encrypted and lists it on the allowed connection", async () => {
    const { env, members } = environment();
    await registerAppMember(env, 42, {
      firstName: "Alex",
      lastName: "Example",
      totalVisits: 8,
    });
    expect([...members.values()][0]).not.toContain("Alex");
    const data = await (
      await worker.fetch(await req("/api/control/members"), env)
    ).json();
    expect(data.members[0]).toMatchObject({
      memberId: 42,
      firstName: "Alex",
      totalVisits: 8,
    });
    expect(JSON.stringify(data)).not.toContain(secret);
  });
  it("uploads real artwork and grants/revokes a sticker only to the selected member", async () => {
    const { env, catalog } = environment();
    await registerAppMember(env, 42, {
      firstName: "Alex",
      lastName: "Example",
      totalVisits: 8,
    });
    const memberKey = await trainingMemberKey(42, secret);
    expect(
      (
        await worker.fetch(
          await req("/api/control/stickers", {
            id: "sticker-1",
            name: "100 Club",
            description: "100 visits",
            mime: "image/png",
            image,
          }),
          env,
        )
      ).status,
    ).toBe(200);
    expect(catalog.get("sticker-1").art).not.toContain(image);
    expect(
      (
        await worker.fetch(
          await req("/api/gymmaster/trophy-art/sticker-1", undefined, {
            memberId: 42,
          }),
          env,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await worker.fetch(
          await req("/api/control/awards", {
            memberKey,
            stickerId: "sticker-1",
            unlocked: true,
            requestId: "award-1",
          }),
          env,
        )
      ).status,
    ).toBe(200);
    const mine = await (
        await worker.fetch(
          await req("/api/gymmaster/trophies", undefined, { memberId: 42 }),
          env,
        )
      ).json(),
      other = await (
        await worker.fetch(
          await req("/api/gymmaster/trophies", undefined, { memberId: 43 }),
          env,
        )
      ).json();
    expect(mine.earnedStickerIds).toEqual(["sticker-1"]);
    expect(other.earnedStickerIds).toEqual([]);
    const art = await worker.fetch(
      await req("/api/gymmaster/trophy-art/sticker-1", undefined, {
        memberId: 42,
      }),
      env,
    );
    expect(art.headers.get("Content-Type")).toBe("image/png");
    expect(art.headers.get("Cache-Control")).toBe("no-store");
    expect(
      btoa(String.fromCharCode(...new Uint8Array(await art.arrayBuffer()))),
    ).toBe(image);
    await worker.fetch(
      await req("/api/control/awards", {
        memberKey,
        stickerId: "sticker-1",
        unlocked: false,
        requestId: "award-2",
      }),
      env,
    );
    expect(
      (
        await (
          await worker.fetch(
            await req("/api/gymmaster/trophies", undefined, { memberId: 42 }),
            env,
          )
        ).json()
      ).earnedStickerIds,
    ).toEqual([]);
  });
  it("blocks cross-origin writes, disguised images, anonymous member art and member ID injection", async () => {
    const { env } = environment();
    expect(
      (
        await worker.fetch(
          await req(
            "/api/control/stickers",
            {
              id: "sticker-1",
              name: "Badge",
              description: "",
              mime: "image/png",
              image,
            },
            { origin: "https://evil.test" },
          ),
          env,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await worker.fetch(
          await req("/api/control/stickers", {
            id: "sticker-1",
            name: "Badge",
            description: "",
            mime: "image/png",
            image: btoa('<svg onload="alert(1)"></svg>'),
          }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(
      (await worker.fetch(await req("/api/gymmaster/trophies"), env)).status,
    ).toBe(401);
    expect(
      (
        await worker.fetch(
          await req("/api/gymmaster/trophies?memberId=43", undefined, {
            memberId: 42,
          }),
          env,
        )
      ).status,
    ).toBe(400);
  });
  it("connects reports with a separate encrypted key and lists actual provider IDs without leaking secrets", async () => {
    const { env, settings } = environment();
    const key = "fake-report-key-for-tests-only";
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        Response.json({
          result: [{ id: 77, name: "Current Members", category: "Member" }],
          error: null,
        }),
      );
    const connected = await worker.fetch(
      await req("/api/control/reports/connect", { key }),
      env,
    );
    expect(await connected.json()).toEqual({ connected: true });
    expect(settings.get("reports-key")).not.toContain(key);
    const result = await worker.fetch(await req("/api/control/reports"), env);
    expect(await result.json()).toEqual({
      reports: [{ id: 77, name: "Current Members", category: "Member" }],
    });
    const [url, options] = upstream.mock.calls.at(-1)!;
    expect(String(url)).toBe(
      "https://hiitco.gymmasteronline.com/api/v2/report/standard_report?predefined_only=true",
    );
    expect(options?.headers).toEqual({
      "X-GM-API-KEY": key,
      Accept: "application/json",
    });
  });
  it("returns a sanitized error for malformed or unavailable reports", async () => {
    const { env } = environment();
    env.GYMMASTER_REPORTS_KEY = "fake-report-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("private upstream details", { status: 200 }),
    );
    const response = await worker.fetch(await req("/api/control/reports"), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "control_unavailable" });
  });
  it("runs only the fixed report endpoint and returns a minimal member preview, not private extra fields", async () => {
    const { env } = environment();
    env.GYMMASTER_REPORTS_KEY = "fake-report-key";
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        result: {
          result: [
            {
              "Member ID": 42,
              "Member Name": "Alex Example",
              "Private payment": "must-not-leak",
            },
          ],
          error: null,
          cached_result: true,
        },
        error: null,
      }),
    );
    const response = await worker.fetch(
      await req("/api/control/reports/run", {
        reportId: 77,
        startDate: "2026-10-01",
        endDate: "2026-10-26",
      }),
      env,
    );
    expect(await response.json()).toEqual({
      members: [{ memberId: 42, name: "Alex Example" }],
      cached: true,
    });
    expect(JSON.parse(String(upstream.mock.calls[0][1]?.body))).toEqual({
      report_id: 77,
      start_date: "2026-10-01",
      end_date: "2026-10-26",
      company_id: null,
      displaymode: "CURRENT",
      required_columns: ["Member ID", "Member Name"],
    });
  });
});
