import { controlAttendance } from "./attendance";
import { memberEventResponses } from "./eventResponses";
import { weeklyGoal } from "./weeklyGoal";
import { apiJson, limitedText } from "../gymmaster/auth";
import { readSession, clearSessionCookie } from "../gymmaster/session";
import { openTraining, sealTraining, trainingMemberKey } from "../training";
import {
  emptyTrainingLog,
  parseTrainingLog,
  validDate,
} from "../../src/domain/training";
import { emptyChowLog, parseChowLog } from "../../src/domain/chow";
import { dateKey } from "../../src/domain/attendance";
import type {
  ActivityItem,
  ClubSticker,
  BestEvent,
} from "../../src/domain/control";
import { controlAllowed, type ControlEnv } from "./access";
import { controlData, listAppMembers, getAppMember, getRecord } from "./data";
const isKey = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const isId = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(v);
async function stickers(env: ControlEnv): Promise<ClubSticker[]> {
  const data = await controlData(env, "/stickers");
  return Promise.all(
    data.rows.map(async (r: { id: string; sealed: string }) => ({
      ...(await openTraining(
        r.sealed,
        env.GYMMASTER_API_KEY!,
        "control.sticker:" + r.id,
      )),
      image: "/api/gymmaster/trophy-art/" + r.id,
    })),
  );
}
async function artwork(env: ControlEnv, id: string) {
  const result = await controlData(env, "/art?id=" + id);
  if (!result.rows.length) return apiJson({ error: "not_found" }, 404);
  const row = result.rows[0],
    asset = await openTraining(
      row.art,
      env.GYMMASTER_API_KEY!,
      "control.art:" + id,
    );
  const bytes = Uint8Array.from(atob(asset.base64), (c: string) =>
    c.charCodeAt(0),
  );
  return new Response(bytes, {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export function validateArtwork(
  mime: unknown,
  base64: unknown,
): base64 is string {
  if (
    typeof base64 !== "string" ||
    base64.length > 350000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
  )
    return false;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  if (bytes.length < 12 || bytes.length > 262144) return false;
  return mime === "image/png"
    ? [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
    : mime === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : mime === "image/webp"
        ? String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
          String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
        : false;
}
export async function controlApi(
  request: Request,
  env: ControlEnv,
): Promise<Response | null> {
  const url = new URL(request.url),
    path = url.pathname;
  if (!path.startsWith("/api/control/")) return null;
  const allowed = controlAllowed(request, env);
  if (path === "/api/control/status" && request.method === "GET") {
    let reportsReady = !!env.GYMMASTER_REPORTS_KEY;
    if (allowed && env.CONTROL_STORE) {
      try {
        reportsReady ||=
          (await controlData(env, "/setting?id=reports-key")).rows.length > 0;
      } catch {
        /* report setup is checked again on use */
      }
    }
    return apiJson({
      available: allowed,
      skillsAvailable: !!(
        env.CONTROL_STORE &&
        env.GYMMASTER_API_KEY &&
        env.SKILL_VIDEOS
      ),
      configured: !!env.CONTROL_ROOM_ALLOWED_IPS?.trim(),
      storageReady: allowed ? !!env.CONTROL_STORE : undefined,
      reportsReady: allowed ? reportsReady : undefined,
    });
  }

  if (!allowed) return apiJson({ error: "control_access_restricted" }, 403);
  if (
    request.headers.get("Sec-Fetch-Site") === "cross-site" ||
    (request.method !== "GET" && request.headers.get("Origin") !== url.origin)
  )
    return apiJson({ error: "request_not_allowed" }, 403);
  if (!env.GYMMASTER_API_KEY || !env.CONTROL_STORE)
    return apiJson({ error: "control_unavailable" }, 503);
  try {
    if (
      env.CONTROL_RATE_LIMITER &&
      !(
        await env.CONTROL_RATE_LIMITER.limit({
          key: `control:${request.method}:${request.headers.get("CF-Connecting-IP")}`,
        })
      ).success
    )
      return apiJson({ error: "too_many_attempts" }, 429);
    if (request.method === "GET") {
      if (path === "/api/control/members") {
        const after = url.searchParams.get("after") ?? "";
        if (after && !isKey(after))
          return apiJson({ error: "invalid_request" }, 400);
        return apiJson(await listAppMembers(env, after));
      }
      if (path === "/api/control/member") {
        const id = url.searchParams.get("id");
        if (!isKey(id)) return apiJson({ error: "invalid_request" }, 400);
        const member = await getAppMember(env, id);
        if (!member) return apiJson({ error: "not_found" }, 404);
        const [training, chow, awards, eventResponses] = await Promise.all([
          getRecord(env, id, "training"),
          getRecord(env, id, "chow"),
          controlData(env, "/awards?id=" + id),
          memberEventResponses(env, id),
        ]);
        return apiJson({
          member,
          attendance: await controlAttendance(env, id, member.memberId),
          eventResponses,
          ...(await weeklyGoal(env, id)),
          training: training
            ? parseTrainingLog(training, dateKey(new Date()))
            : emptyTrainingLog(),
          chow: chow
            ? await parseChowLog(chow, dateKey(new Date()))
            : emptyChowLog(),
          earnedStickerIds: awards.awards.map(
            (a: { sticker_id: string }) => a.sticker_id,
          ),
        });
      }
      if (path === "/api/control/stickers")
        return apiJson({ stickers: await stickers(env) });
      if (path.startsWith("/api/control/art/")) {
        const id = path.slice("/api/control/art/".length);
        return isId(id)
          ? await artwork(env, id)
          : apiJson({ error: "invalid_request" }, 400);
      }
      if (path === "/api/control/activity") {
        const data = await controlData(env, "/activity"),
          items: ActivityItem[] = [];
        for (const row of data.snapshots) {
          const events: BestEvent[] = await openTraining(
            row.sealed,
            env.GYMMASTER_API_KEY!,
            `control.metrics:${row.member_key}:${row.kind}`,
          );
          for (const event of events)
            items.push({
              ...event,
              id: `${row.member_key}:${row.kind}:${event.id}`,
              memberKey: row.member_key,
            });
        }
        for (const row of data.audit)
          items.push({
            ...(await openTraining(
              row.sealed,
              env.GYMMASTER_API_KEY!,
              "control.audit:" + row.id,
            )),
            id: row.id,
            memberKey: row.member_key,
          });
        const read = new Set(data.read);
        return apiJson({
          items: items
            .sort(
              (a, b) =>
                b.createdAt.localeCompare(a.createdAt) ||
                a.id.localeCompare(b.id),
            )
            .slice(0, 100)
            .map((item) => ({ ...item, read: read.has(item.id) })),
        });
      }
      if (path === "/api/control/reports")
        return await listReports(
          env,
          url.searchParams.get("predefined_only") !== "false",
        );
      return apiJson({ error: "not_found" }, 404);
    }
    if (request.method !== "POST")
      return apiJson({ error: "method_not_allowed" }, 405);
    if (
      request.headers.get("Content-Type")?.split(";")[0] !== "application/json"
    )
      return apiJson({ error: "invalid_request" }, 400);
    const body = JSON.parse(await limitedText(request.body, 400000));
    if (path === "/api/control/member-goal") {
      if (
        !isKey(body.memberKey) ||
        !(
          body.weeklyTarget === null ||
          (Number.isInteger(body.weeklyTarget) &&
            body.weeklyTarget >= 1 &&
            body.weeklyTarget <= 7)
        )
      )
        return apiJson({ error: "invalid_target" }, 400);
      if (!(await getAppMember(env, body.memberKey)))
        return apiJson({ error: "not_found" }, 404);
      const sealed =
        body.weeklyTarget === null
          ? null
          : await sealTraining(
              { weeklyTarget: body.weeklyTarget },
              env.GYMMASTER_API_KEY,
              "control.member-target:" + body.memberKey,
            );
      await controlData(env, "/member-target", {
        memberKey: body.memberKey,
        sealed,
      });
      return apiJson({
        saved: true,
        ...(await weeklyGoal(env, body.memberKey)),
      });
    }
    if (path === "/api/control/reports/connect") {
      if (typeof body.key !== "string" || !/^[!-~]{16,1000}$/.test(body.key))
        return apiJson({ error: "invalid_reports_key" }, 400);
      const reports = await reportFetch(env, undefined, true, body.key);
      if (!Array.isArray(reports?.result) || reports.result.length > 2000)
        throw Error();
      const sealed = await sealTraining(
        { key: body.key },
        env.GYMMASTER_API_KEY,
        "control.setting:reports-key",
      );
      await controlData(env, "/setting", { id: "reports-key", sealed });
      return apiJson({ connected: true });
    }
    if (path === "/api/control/stickers/category") {
      if (!isId(body.id) || !["milestones", "events"].includes(body.category))
        return apiJson({ error: "invalid_sticker" }, 400);
      const data = await controlData(env, "/stickers");
      const row = data.rows.find((r: { id: string }) => r.id === body.id);
      if (!row) return apiJson({ error: "not_found" }, 404);
      const meta = await openTraining(
        row.sealed,
        env.GYMMASTER_API_KEY,
        "control.sticker:" + body.id,
      );
      const sealed = await sealTraining(
        { ...meta, category: body.category },
        env.GYMMASTER_API_KEY,
        "control.sticker:" + body.id,
      );
      await controlData(env, "/sticker-category", { id: body.id, sealed });
      return apiJson({ saved: true });
    }
    if (path === "/api/control/stickers") {
      if (
        !isId(body.id) ||
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.length > 60 ||
        typeof body.description !== "string" ||
        body.description.length > 200 ||
        (body.category !== undefined &&
          !["milestones", "events"].includes(body.category)) ||
        !validateArtwork(body.mime, body.image)
      )
        return apiJson({ error: "invalid_sticker" }, 400);
      const meta = {
        id: body.id,
        name: body.name.trim(),
        description: body.description.trim(),
        category: body.category ?? "milestones",
        createdAt: new Date().toISOString(),
      };
      const [sealed, art] = await Promise.all([
        sealTraining(meta, env.GYMMASTER_API_KEY, "control.sticker:" + body.id),
        sealTraining(
          { base64: body.image },
          env.GYMMASTER_API_KEY,
          "control.art:" + body.id,
        ),
      ]);
      await controlData(env, "/sticker", {
        id: body.id,
        sealed,
        art,
        mime: body.mime,
      });
      return apiJson({ saved: true });
    }
    if (path === "/api/control/awards") {
      if (
        !isKey(body.memberKey) ||
        !isId(body.stickerId) ||
        typeof body.unlocked !== "boolean" ||
        !isId(body.requestId)
      )
        return apiJson({ error: "invalid_request" }, 400);
      const member = await getAppMember(env, body.memberKey),
        catalog = await stickers(env);
      const sticker = catalog.find((s) => s.id === body.stickerId);
      if (!member || !sticker) return apiJson({ error: "not_found" }, 404);
      const createdAt = new Date().toISOString(),
        event = {
          kind: body.unlocked ? "sticker_unlocked" : "sticker_locked",
          title: sticker.name,
          date: dateKey(createdAt),
          createdAt,
        };
      const audit = await sealTraining(
        event,
        env.GYMMASTER_API_KEY,
        "control.audit:" + body.requestId,
      );
      await controlData(env, "/award", {
        ...body,
        auditId: body.requestId,
        audit,
        createdAt,
      });
      return apiJson({ saved: true });
    }
    if (path === "/api/control/activity/read") {
      if (
        !Array.isArray(body.ids) ||
        body.ids.length > 200 ||
        body.ids.some(
          (id: unknown) => typeof id !== "string" || id.length > 300,
        )
      )
        return apiJson({ error: "invalid_request" }, 400);
      await controlData(env, "/read", { ids: body.ids });
      return apiJson({ saved: true });
    }
    if (path === "/api/control/reports/run") return await runReport(env, body);
    return apiJson({ error: "not_found" }, 404);
  } catch {
    return apiJson({ error: "control_unavailable" }, 503);
  }
}
export async function memberTrophies(
  request: Request,
  env: ControlEnv,
): Promise<Response | null> {
  const url = new URL(request.url),
    path = url.pathname;
  if (
    path !== "/api/gymmaster/trophies" &&
    !path.startsWith("/api/gymmaster/trophy-art/")
  )
    return null;
  if (request.method !== "GET")
    return apiJson({ error: "method_not_allowed" }, 405);
  if (url.search || request.headers.get("Sec-Fetch-Site") === "cross-site")
    return apiJson({ error: "request_not_allowed" }, 400);
  const session = await readSession(request, env.GYMMASTER_API_KEY);
  if (!session)
    return apiJson({ error: "session_expired" }, 401, {
      "Set-Cookie": clearSessionCookie(),
    });
  if (!env.CONTROL_STORE)
    return apiJson({ error: "trophies_unavailable" }, 503);
  try {
    const memberKey = await trainingMemberKey(
      session.memberId,
      env.GYMMASTER_API_KEY!,
    );
    const data = await controlData(env, "/awards?id=" + memberKey),
      earnedStickerIds = data.awards.map(
        (a: { sticker_id: string }) => a.sticker_id,
      );
    if (path === "/api/gymmaster/trophies")
      return apiJson({ stickers: await stickers(env), earnedStickerIds });
    const id = path.slice("/api/gymmaster/trophy-art/".length);
    if (!isId(id) || !earnedStickerIds.includes(id))
      return apiJson({ error: "not_found" }, 404);
    return await artwork(env, id);
  } catch {
    return apiJson({ error: "trophies_unavailable" }, 503);
  }
}
const REPORT_URL =
  "https://hiitco.gymmasteronline.com/api/v2/report/standard_report";
async function reportFetch(
  env: ControlEnv,
  body?: unknown,
  predefined = true,
  overrideKey?: string,
) {
  let reportKey = overrideKey;
  if (!reportKey) {
    const stored = await controlData(env, "/setting?id=reports-key");
    if (stored.rows.length)
      reportKey = (
        await openTraining(
          stored.rows[0].sealed,
          env.GYMMASTER_API_KEY!,
          "control.setting:reports-key",
        )
      ).key;
  }
  reportKey ??= env.GYMMASTER_REPORTS_KEY;
  if (!reportKey) return null;
  const response = await fetch(
    REPORT_URL + (body === undefined ? `?predefined_only=${predefined}` : ""),
    {
      method: body === undefined ? "GET" : "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
      headers: {
        "X-GM-API-KEY": reportKey!,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  if (!response.ok) throw Error();
  const result = JSON.parse(await limitedText(response.body, 2000000));
  if (result.error) throw Error();
  return result;
}
async function listReports(env: ControlEnv, predefined: boolean) {
  const data = await reportFetch(env, undefined, predefined);
  if (data === null) return apiJson({ error: "reports_key_missing" }, 503);
  if (!Array.isArray(data.result) || data.result.length > 2000) throw Error();
  return apiJson({
    reports: data.result.map(
      (r: { id: unknown; name: unknown; category: unknown }) => {
        if (
          !Number.isSafeInteger(r.id) ||
          Number(r.id) < 1 ||
          typeof r.name !== "string" ||
          r.name.length > 200
        )
          throw Error();
        return {
          id: r.id,
          name: r.name,
          category:
            typeof r.category === "string" ? r.category.slice(0, 100) : "",
        };
      },
    ),
  });
}
async function runReport(env: ControlEnv, body: Record<string, unknown>) {
  if (
    !Number.isSafeInteger(body.reportId) ||
    Number(body.reportId) < 1 ||
    typeof body.startDate !== "string" ||
    typeof body.endDate !== "string" ||
    !validDate(body.startDate) ||
    !validDate(body.endDate) ||
    body.startDate > body.endDate
  )
    return apiJson({ error: "invalid_request" }, 400);
  const data = await reportFetch(env, {
    report_id: body.reportId,
    start_date: body.startDate,
    end_date: body.endDate,
    company_id: null,
    displaymode: "CURRENT",
    required_columns: ["Member ID", "Member Name"],
  });
  if (data === null) return apiJson({ error: "reports_key_missing" }, 503);
  if (
    data.result?.error ||
    !Array.isArray(data.result?.result) ||
    data.result.result.length > 10000
  )
    throw Error();
  const rows = data.result.result.map((row: Record<string, unknown>) => {
    const id = row["Member ID"],
      name = row["Member Name"];
    const memberId =
      typeof id === "string" && /^[1-9]\d{0,15}$/.test(id) ? Number(id) : id;
    if (
      !Number.isSafeInteger(memberId) ||
      Number(memberId) < 1 ||
      typeof name !== "string"
    )
      throw Error();
    return { memberId, name: name.slice(0, 400) };
  });
  return apiJson({ members: rows, cached: data.result.cached_result === true });
}
