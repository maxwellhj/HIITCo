import { apiJson, limitedText } from "./auth";
export interface WebhookEnv {
  GYMMASTER_WEBHOOK_TOKEN?: string;
  GYMMASTER_CHECKIN_INBOX?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
}
interface WebhookEnvelope {
  event_id: string | number;
  event_type: string;
  event_timestamp: string;
  processed_at: string;
  payload: Record<string, unknown>;
  test_webhook?: boolean;
}
function validTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(
      value,
    )
  )
    return false;
  // GymMaster's help example uses +12 rather than +12:00.
  const normalized = /[+-]\d{2}$/.test(value) ? value + ":00" : value;
  const date = new Date(value.slice(0, 10) + "T12:00:00Z");
  return (
    Number.isFinite(Date.parse(normalized)) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value.slice(0, 10)
  );
}
function envelope(value: unknown): WebhookEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error();
  const v = value as Record<string, unknown>;
  const id =
    typeof v.event_id === "string" && /^[1-9][0-9]{0,15}$/.test(v.event_id)
      ? Number(v.event_id)
      : v.event_id;
  if (
    typeof id !== "number" ||
    !Number.isSafeInteger(id) ||
    id < 1 ||
    typeof v.event_type !== "string" ||
    !/^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(v.event_type) ||
    !validTimestamp(v.event_timestamp) ||
    !validTimestamp(v.processed_at) ||
    !v.payload ||
    typeof v.payload !== "object" ||
    Array.isArray(v.payload)
  )
    throw Error();
  return { ...v, event_id: id } as unknown as WebhookEnvelope;
}
async function equalToken(provided: string, expected: string) {
  if (provided.length < 32 || provided.length > 256) return false;
  const digest = (value: string) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [a, b] = await Promise.all([digest(provided), digest(expected)]);
  const left = new Uint8Array(a),
    right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
async function sealEnvelope(value: WebhookEnvelope, secret: string) {
  const keyMaterial = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`hiitco.webhook.inbox-key.v1:${secret}`),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode("hiitco.webhook.inbox.v1"),
    },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  const bytes = new Uint8Array(12 + ciphertext.byteLength);
  bytes.set(iv);
  bytes.set(new Uint8Array(ciphertext), 12);
  return btoa(String.fromCharCode(...bytes));
}
export async function gymMasterWebhook(
  request: Request,
  env: WebhookEnv,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== "/api/gymmaster/webhooks/checkin")
    return null;
  if (request.method !== "POST")
    return apiJson({ error: "method_not_allowed" }, 405, { Allow: "POST" });
  if (
    !env.GYMMASTER_WEBHOOK_TOKEN ||
    !/^[\x21-\x7e]{32,256}$/.test(env.GYMMASTER_WEBHOOK_TOKEN) ||
    !env.GYMMASTER_CHECKIN_INBOX
  )
    return apiJson({ error: "webhook_unavailable" }, 503);
  if (
    !(await equalToken(
      request.headers.get("X-Gymmaster-Token") ?? "",
      env.GYMMASTER_WEBHOOK_TOKEN,
    ))
  )
    return apiJson({ error: "unauthorized" }, 401);
  if (
    new URL(request.url).search ||
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
      "application/json"
  )
    return apiJson({ error: "invalid_webhook" }, 400);
  let event: WebhookEnvelope;
  try {
    event = envelope(JSON.parse(await limitedText(request.body, 32768)));
  } catch {
    return apiJson({ error: "invalid_webhook" }, 400);
  }
  const test =
    event.test_webhook === true || event.payload.test_webhook === true;
  try {
    const sealed = await sealEnvelope(event, env.GYMMASTER_WEBHOOK_TOKEN);
    const inbox = env.GYMMASTER_CHECKIN_INBOX.get(
      env.GYMMASTER_CHECKIN_INBOX.idFromName("hiitco-checkin-inbox-v1"),
    );
    const stored = await inbox.fetch(
      new Request("https://inbox.internal/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: `${test ? "test" : "live"}:${event.event_id}`,
          sealed,
        }),
      }),
    );
    if (!stored.ok) throw Error();
    const result = (await stored.json()) as {
      received?: unknown;
      duplicate?: unknown;
    };
    if (result.received !== true || typeof result.duplicate !== "boolean")
      throw Error();
    // Schema metadata only: no token, IDs, timestamps, names, or field values.
    console.info("GymMaster webhook received", {
      test,
      duplicate: result.duplicate,
      eventType: event.event_type,
      payloadFields: Object.keys(event.payload)
        .filter((name) => /^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(name))
        .slice(0, 40)
        .map((name) => ({
          name,
          type:
            event.payload[name] === null
              ? "null"
              : Array.isArray(event.payload[name])
                ? "array"
                : typeof event.payload[name],
        })),
    });
    return apiJson({ received: true, duplicate: result.duplicate, test });
  } catch {
    return apiJson({ error: "webhook_unavailable" }, 503);
  }
}
