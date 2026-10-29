import {
  MAX_REMEMBER_SECONDS,
  clearSessionCookie,
  readSession,
  sealSession,
  sessionCookie,
} from "./session";
export interface AuthEnv {
  CONTROL_STORE?: import("../control/types").ControlNamespace;
  GYMMASTER_API_KEY?: string;
  LOGIN_RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}
const LOGIN_URL = "https://hiitco.gymmasteronline.com/portal/api/v1/login";
export function apiJson(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
function failure(
  code: string,
  status: number,
  headers: Record<string, string> = {},
) {
  return apiJson({ error: code }, status, headers);
}
export async function limitedText(
  body: ReadableStream<Uint8Array> | null,
  maximum: number,
) {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximum) {
        await reader.cancel();
        throw Error("Body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
const sameOrigin = (request: Request) =>
  request.headers.get("Origin") === new URL(request.url).origin &&
  request.headers.get("Sec-Fetch-Site") !== "cross-site";
// Accept integer fields encoded as either JSON numbers or decimal strings.
// Reject coercions such as booleans, whitespace, fractions, and exponent strings.
function positiveInteger(value: unknown): number {
  if (typeof value === "string" && /^[1-9][0-9]{0,15}$/.test(value))
    value = Number(value);
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : NaN;
}
function formatFailure(detail: string) {
  return apiJson({ error: "unexpected_response", detail }, 502);
}
export async function gymMasterAuth(
  request: Request,
  env: AuthEnv,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (
    ![
      "/api/gymmaster/login",
      "/api/gymmaster/session",
      "/api/gymmaster/logout",
    ].includes(path)
  )
    return null;
  const method = path.endsWith("/session") ? "GET" : "POST";
  if (request.method !== method)
    return failure("method_not_allowed", 405, { Allow: method });
  if (method === "POST" && !sameOrigin(request))
    return failure("request_not_allowed", 403);
  if (path.endsWith("/session")) {
    const session = await readSession(request, env.GYMMASTER_API_KEY);
    return session
      ? apiJson({ connected: true, expiresAt: session.expiresAt })
      : apiJson({ connected: false }, 200, {
          "Set-Cookie": clearSessionCookie(),
        });
  }
  if (path.endsWith("/logout")) {
    const device = request.headers
      .get("Cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("__Host-hiitco-push-device="))
      ?.split("=")[1];
    const session = await readSession(request, env.GYMMASTER_API_KEY);
    if (
      device &&
      /^[A-Za-z0-9_-]{43}$/.test(device) &&
      session &&
      env.CONTROL_STORE &&
      env.GYMMASTER_API_KEY
    ) {
      try {
        const { trainingMemberKey } = await import("../training");
        const response = await env.CONTROL_STORE.get(
          env.CONTROL_STORE.idFromName("hiitco-control-v1"),
        ).fetch(
          new Request("https://control.internal/connect-push-logout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              actor: await trainingMemberKey(
                session.memberId,
                env.GYMMASTER_API_KEY + ":connect-v1",
              ),
              deviceId: device,
            }),
          }),
        );
        if (!response.ok) return failure("logout_unavailable", 503);
      } catch {
        return failure("logout_unavailable", 503);
      }
    }
    const response = apiJson({ connected: false }, 200, {
      "Set-Cookie": clearSessionCookie(),
    });
    response.headers.append(
      "Set-Cookie",
      "__Host-hiitco-push-device=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
    );
    return response;
  }
  if (!env.GYMMASTER_API_KEY || !env.LOGIN_RATE_LIMITER)
    return failure("connection_unavailable", 503);
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) return failure("connection_unavailable", 503);
  try {
    if (!(await env.LOGIN_RATE_LIMITER.limit({ key: `ip:${ip}` })).success)
      return failure("too_many_attempts", 429, { "Retry-After": "60" });
  } catch {
    return failure("connection_unavailable", 503);
  }
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    return failure("invalid_request", 400);
  let email: string,
    password: string,
    remember = false;
  try {
    const body: unknown = JSON.parse(await limitedText(request.body, 4096));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
    const fields = body as Record<string, unknown>;
    if (
      Object.keys(fields).some(
        (name) => !["email", "password", "remember"].includes(name),
      )
    )
      throw Error();
    if (typeof fields.email !== "string" || typeof fields.password !== "string")
      throw Error();
    if (fields.remember !== undefined && typeof fields.remember !== "boolean")
      throw Error();
    remember = fields.remember === true;
    email = fields.email.trim();
    password = fields.password;
    if (
      !email ||
      email.length > 254 ||
      !email.includes("@") ||
      !password ||
      password.length > 1024
    )
      throw Error();
  } catch {
    return failure("invalid_request", 400);
  }
  try {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(email.toLowerCase()),
    );
    const emailKey = Array.from(new Uint8Array(hash), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    if (
      !(await env.LOGIN_RATE_LIMITER.limit({ key: `account:${emailKey}` }))
        .success
    )
      return failure("too_many_attempts", 429, { "Retry-After": "60" });
  } catch {
    return failure("connection_unavailable", 503);
  }
  let stage: "request" | "response" | "session" = "request";
  try {
    // Fixed host/path and documented form fields. No member-ID impersonation or arbitrary proxy.
    const upstream = await fetch(LOGIN_URL, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        api_key: env.GYMMASTER_API_KEY,
        email,
        password,
      }),
    });
    if (upstream.status >= 300 && upstream.status < 400)
      return failure("provider_redirect", 502);
    if (upstream.status === 429)
      return failure("too_many_attempts", 429, { "Retry-After": "60" });
    if (upstream.status === 401 || upstream.status === 403)
      return failure("sign_in_not_accepted", 401);
    if (!upstream.ok)
      return apiJson(
        { error: "provider_http_error", providerStatus: upstream.status },
        502,
      );
    stage = "response";
    const body: unknown = JSON.parse(await limitedText(upstream.body, 32768));
    if (!body || typeof body !== "object" || Array.isArray(body))
      return formatFailure("ENVELOPE");
    const response = body as Record<string, unknown>;
    if (typeof response.error === "string" && response.error.trim())
      return failure("sign_in_not_accepted", 401);
    if (
      !response.result ||
      typeof response.result !== "object" ||
      Array.isArray(response.result)
    )
      return formatFailure("RESULT");
    const result = response.result as Record<string, unknown>;
    if (
      typeof result.token !== "string" ||
      !result.token.trim() ||
      result.token.length > 2000
    )
      return formatFailure("TOKEN");
    const expires = positiveInteger(result.expires);
    if (!Number.isFinite(expires)) return formatFailure("EXPIRY");
    const memberId = positiveInteger(result.memberid);
    if (!Number.isFinite(memberId)) return formatFailure("MEMBER");
    const ttl = Math.min(expires, remember ? MAX_REMEMBER_SECONDS : 3600);
    const expiresAt = Date.now() + ttl * 1000;
    stage = "session";
    const sealed = await sealSession(
      { token: result.token, memberId, expiresAt },
      env.GYMMASTER_API_KEY,
    );
    return apiJson({ connected: true, expiresAt }, 200, {
      "Set-Cookie": sessionCookie(sealed, remember ? ttl : undefined),
    });
  } catch (error) {
    if (stage === "session") return failure("session_unavailable", 503);
    if (
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
    )
      return failure("provider_timeout", 504);
    if (stage === "response") return formatFailure("BODY");
    return failure("provider_network_error", 502);
  }
}
