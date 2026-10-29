import { apiJson, limitedText, type AuthEnv } from "../gymmaster/auth";
import { readSession, clearSessionCookie } from "../gymmaster/session";
import { getAppMember, type ControlDataEnv } from "../control/data";
import { sealTraining, openTraining, trainingMemberKey } from "../training";
export async function connectApi(
  request: Request,
  env: AuthEnv & ControlDataEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/gymmaster/connect") return null;
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
      { name: `${member.firstName} ${member.lastName}`.trim() },
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
        body = JSON.parse(await limitedText(request.body, 12000));
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
    } else {
      if (
        [...url.searchParams.keys()].some(
          (k) => !["peer", "before"].includes(k),
        )
      )
        return apiJson({ error: "invalid_request" }, 400);
      if (url.searchParams.has("peer"))
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
      body.action === "messages" &&
      body.before !== undefined &&
      (!Number.isSafeInteger(body.before) || Number(body.before) <= 0)
    )
      return apiJson({ error: "invalid_request" }, 400);
    const internal: Record<string, unknown> = { ...body, actor, name };
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
    if (body.action === "state") {
      for (const list of ["people", "edges", "blocked"])
        data[list] = await Promise.all(
          data[list].map(
            async (p: {
              id: string;
              name: string;
              sender?: string;
              status?: string;
            }) => ({
              id: p.id,
              name: (
                await openTraining(p.name, secret, "connect.profile:" + p.id)
              ).name,
              ...(p.status
                ? { status: p.status, incoming: p.sender !== actor }
                : {}),
            }),
          ),
        );
    }
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
