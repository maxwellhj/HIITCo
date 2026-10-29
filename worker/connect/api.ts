import {
  defaultDisplayName,
  validDisplayName,
} from "../../src/domain/connectProfile";
import { validateArtwork } from "../control/api";
import { apiJson, limitedText, type AuthEnv } from "../gymmaster/auth";
import { readSession, clearSessionCookie } from "../gymmaster/session";
import { getAppMember, type ControlDataEnv } from "../control/data";
import { sealTraining, openTraining, trainingMemberKey } from "../training";
export async function connectApi(
  request: Request,
  env: AuthEnv & ControlDataEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  const photoRequest = url.pathname === "/api/gymmaster/connect/photo";
  if (url.pathname !== "/api/gymmaster/connect" && !photoRequest) return null;
  if (photoRequest && request.method !== "GET")
    return apiJson({ error: "method_not_allowed" }, 405);
  if (!["GET", "POST"].includes(request.method))
    return apiJson({ error: "method_not_allowed" }, 405);
  if (
    request.headers.get("Sec-Fetch-Site") === "cross-site" ||
    (request.method === "POST" && request.headers.get("Origin") !== url.origin)
  )
    return apiJson({ error: "request_not_allowed" }, 403);
  const session = await readSession(request, env.GYMMASTER_API_KEY);
  if (!session)
    return apiJson({ error: "session_expired" }, 401, {
      "Set-Cookie": clearSessionCookie(),
    });
  if (!env.CONTROL_STORE || !env.GYMMASTER_API_KEY)
    return apiJson({ error: "connect_unavailable" }, 503);
  try {
    const secret = env.GYMMASTER_API_KEY;
    const actor = await trainingMemberKey(
      session.memberId,
      secret + ":connect-v1",
    );
    const member = await getAppMember(
      env,
      await trainingMemberKey(session.memberId, secret),
    );
    if (!member) return apiJson({ error: "profile_required" }, 409);
    const name = await sealTraining(
      {
        name: defaultDisplayName(member.firstName, member.lastName),
        format: 2,
      },
      secret,
      "connect.profile:" + actor,
    );
    let body: Record<string, unknown> = { action: "state" };
    if (request.method === "POST") {
      if (
        !request.headers.get("Content-Type")?.startsWith("application/json") ||
        url.search
      )
        return apiJson({ error: "invalid_request" }, 400);
      try {
        body = JSON.parse(await limitedText(request.body, 360000));
      } catch {
        return apiJson({ error: "invalid_request" }, 400);
      }
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).some(
          (k) =>
            ![
              "through",
              "subscription",
              "endpoint",
              "displayName",
              "photo",
              "group",
              "members",
              "groupName",
              "action",
              "peer",
              "public",
              "text",
              "messageId",
              "before",
            ].includes(k),
        )
      )
        return apiJson({ error: "invalid_request" }, 400);
      if (
        ![
          "mark_read",
          "push_subscribe",
          "push_unsubscribe",
          "profile_save",
          "create_group",
          "join_group",
          "decline_group",
          "leave_group",
          "close_group",
          "group_send",
          "privacy",
          "request",
          "accept",
          "decline",
          "cancel",
          "disconnect",
          "block",
          "unblock",
          "send",
        ].includes(String(body.action))
      )
        return apiJson({ error: "invalid_request" }, 400);
    } else if (photoRequest) {
      if (
        [...url.searchParams.keys()].some((k) => !["member", "v"].includes(k))
      )
        return apiJson({ error: "invalid_request" }, 400);
      body = { action: "photo", peer: url.searchParams.get("member") };
    } else if (
      url.searchParams.get("unread") === "1" &&
      [...url.searchParams.keys()].length === 1
    ) {
      body = { action: "unread" };
    } else if (
      url.searchParams.get("push") === "1" &&
      [...url.searchParams.keys()].length === 1
    ) {
      body = { action: "push_config" };
    } else if (
      url.searchParams.get("profile") === "me" &&
      [...url.searchParams.keys()].length === 1
    ) {
      body = { action: "profile_get" };
    } else {
      if (
        [...url.searchParams.keys()].some(
          (k) => !["peer", "before", "group"].includes(k),
        )
      )
        return apiJson({ error: "invalid_request" }, 400);
      if (url.searchParams.has("peer") && url.searchParams.has("group"))
        return apiJson({ error: "invalid_request" }, 400);
      if (url.searchParams.has("group"))
        body = {
          action: "group_messages",
          group: url.searchParams.get("group"),
          before: url.searchParams.has("before")
            ? Number(url.searchParams.get("before"))
            : undefined,
        };
      else if (url.searchParams.has("peer"))
        body = {
          action: "messages",
          peer: url.searchParams.get("peer"),
          before: url.searchParams.has("before")
            ? Number(url.searchParams.get("before"))
            : undefined,
        };
      else if (url.search) return apiJson({ error: "invalid_request" }, 400);
    }
    if (
      (body.action === "messages" || body.action === "group_messages") &&
      body.before !== undefined &&
      (!Number.isSafeInteger(body.before) || Number(body.before) <= 0)
    )
      return apiJson({ error: "invalid_request" }, 400);
    const internal: Record<string, unknown> = { ...body, actor, name };
    if (body.action === "profile_save") {
      if (body.displayName !== null && !validDisplayName(body.displayName))
        return apiJson({ error: "invalid_display_name" }, 400);
      internal.display =
        body.displayName === null
          ? null
          : await sealTraining(
              { name: String(body.displayName).trim() },
              secret,
              "connect.display:" + actor,
            );
      delete internal.displayName;
      if (body.photo !== undefined) {
        if (body.photo === null) {
          internal.photo = null;
        } else {
          const photo = body.photo as { mime?: unknown; image?: unknown };
          if (
            !photo ||
            typeof photo !== "object" ||
            !validateArtwork(photo.mime, photo.image)
          )
            return apiJson({ error: "invalid_photo" }, 400);
          internal.photo = await sealTraining(
            { mime: photo.mime, image: photo.image },
            secret,
            "connect.photo:" + actor,
          );
          internal.version = crypto.randomUUID();
        }
      }
    }
    if (body.action === "create_group") {
      if (
        typeof body.group !== "string" ||
        !/^[a-f0-9-]{36}$/.test(body.group) ||
        typeof body.groupName !== "string" ||
        !body.groupName.trim() ||
        body.groupName.trim().length > 60
      )
        return apiJson({ error: "invalid_request" }, 400);
      internal.groupName = await sealTraining(
        { name: body.groupName.trim() },
        secret,
        "connect.group:" + body.group,
      );
    }
    if (body.action === "group_send") {
      if (
        typeof body.group !== "string" ||
        !/^[a-f0-9-]{36}$/.test(body.group) ||
        typeof body.text !== "string" ||
        !body.text.trim() ||
        body.text.trim().length > 2000
      )
        return apiJson({ error: "invalid_request" }, 400);
      internal.sealed = await sealTraining(
        { text: body.text.trim() },
        secret,
        "connect.group-message:" + body.group,
      );
      internal.createdAt = new Date().toISOString();
      delete internal.text;
    }
    if (body.action === "send") {
      if (
        typeof body.text !== "string" ||
        !body.text.trim() ||
        body.text.trim().length > 2000 ||
        typeof body.peer !== "string" ||
        !/^[a-f0-9]{64}$/.test(body.peer)
      )
        return apiJson({ error: "invalid_request" }, 400);
      const pair = [actor, body.peer].sort().join(":");
      internal.sealed = await sealTraining(
        { text: body.text.trim() },
        secret,
        "connect.message:" + pair,
      );
      internal.createdAt = new Date().toISOString();
      delete internal.text;
    }
    const response = await env.CONTROL_STORE.get(
      env.CONTROL_STORE.idFromName("hiitco-control-v1"),
    ).fetch(
      new Request("https://control.internal/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(internal),
      }),
    );
    const data = (await response.json()) as Record<string, any>;
    if (!response.ok) return apiJson(data, response.status);
    const avatar = (id: string, version: unknown) =>
      typeof version === "string"
        ? `/api/gymmaster/connect/photo?member=${id}&v=${version}`
        : null;
    async function person(p: {
      id: string;
      name: string;
      display?: string | null;
      photoVersion?: string | null;
    }) {
      let name: string;
      if (p.display)
        name = (
          await openTraining(p.display, secret, "connect.display:" + p.id)
        ).name;
      else {
        const stored = await openTraining(
          p.name,
          secret,
          "connect.profile:" + p.id,
        );
        const parts = String(stored.name).trim().split(/\s+/);
        name =
          stored.format === 2
            ? stored.name
            : defaultDisplayName(
                parts[0],
                parts.length > 1 ? parts.at(-1)! : "",
              );
      }
      return { id: p.id, name, photo: avatar(p.id, p.photoVersion) };
    }
    if (body.action === "photo") {
      const photo = await openTraining(
        data.photo,
        secret,
        "connect.photo:" + body.peer,
      );
      if (!validateArtwork(photo.mime, photo.image)) throw Error();
      return new Response(
        Uint8Array.from(atob(photo.image), (c) => c.charCodeAt(0)),
        {
          headers: {
            "Content-Type": photo.mime,
            "Cache-Control": "no-store, private",
            "X-Content-Type-Options": "nosniff",
            "Cross-Origin-Resource-Policy": "same-origin",
          },
        },
      );
    }
    if (body.action === "push_subscribe")
      return apiJson({ saved: true }, 200, {
        "Set-Cookie": `__Host-hiitco-push-device=${data.deviceId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`,
      });
    if (body.action === "push_unsubscribe")
      return apiJson({ saved: true }, 200, {
        "Set-Cookie":
          "__Host-hiitco-push-device=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
      });
    if (body.action === "unread") {
      data.threads = await Promise.all(
        data.threads.map(async (t: any) => ({
          id: t.id,
          kind: t.kind,
          count: t.count,
          name:
            t.kind === "group"
              ? (await openTraining(t.name, secret, "connect.group:" + t.id))
                  .name
              : (await person(t)).name,
        })),
      );
    }
    if (body.action === "profile_get") {
      const me = data.me;
      return apiJson({
        id: actor,
        displayName: me.display
          ? (await openTraining(me.display, secret, "connect.display:" + actor))
              .name
          : defaultDisplayName(member.firstName, member.lastName),
        defaultName: defaultDisplayName(member.firstName, member.lastName),
        customName: !!me.display,
        photo: avatar(actor, me.photoVersion),
        public: me.public,
      });
    }
    if (body.action === "state") {
      for (const list of ["people", "edges", "blocked"])
        data[list] = await Promise.all(
          data[list].map(async (p: any) => ({
            ...(await person(p)),
            ...(p.status
              ? { status: p.status, incoming: p.sender !== actor }
              : {}),
          })),
        );
      data.groups = await Promise.all(
        data.groups.map(async (g: any) => ({
          ...g,
          name: (await openTraining(g.name, secret, "connect.group:" + g.id))
            .name,
          members: await Promise.all(g.members.map(person)),
        })),
      );
    }
    if (body.action === "group_messages")
      data.messages = await Promise.all(
        data.messages.map(async (m: any) => ({
          mine: m.sender === actor,
          ...(await person({
            id: m.sender,
            name: m.name,
            display: m.display,
            photoVersion: m.photoVersion,
          })),
          id: m.seq,
          text: (
            await openTraining(
              m.sealed,
              secret,
              "connect.group-message:" + body.group,
            )
          ).text,
          createdAt: m.created_at,
        })),
      );
    if (body.action === "messages") {
      const pair = [actor, body.peer].sort().join(":");
      data.messages = await Promise.all(
        data.messages.map(
          async (m: {
            seq: number;
            sender: string;
            sealed: string;
            created_at: string;
          }) => ({
            id: m.seq,
            mine: m.sender === actor,
            text: (
              await openTraining(m.sealed, secret, "connect.message:" + pair)
            ).text,
            createdAt: m.created_at,
          }),
        ),
      );
    }
    return apiJson(data);
  } catch {
    console.error("CONNECT-UNAVAILABLE");
    return apiJson({ error: "connect_unavailable" }, 503);
  }
}
