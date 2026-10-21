import { apiJson, limitedText } from "./auth";
import {
  grantedCheckin,
  memberCheckinIndex,
  sealCheckin,
} from "./checkinRecords";
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
  processed_at: string | null;
  payload: Record<string, unknown>;
  test_webhook?: boolean;
}
function validTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}[T ](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/.test(
      value,
    )
  )
    return false;
  // Preserve timezone-less values exactly. Appending Z here validates syntax
  // only; it must not be used to infer the actual timezone of a check-in.
  let normalized = value.replace(" ", "T");
  if (/[+-]\d{2}$/.test(normalized)) normalized += ":00";
  else if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)) normalized += "Z";
  const date = new Date(value.slice(0, 10) + "T12:00:00Z");
  return (
    Number.isFinite(Date.parse(normalized)) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value.slice(0, 10)
  );
}
function unavailable(code: string) {
  // Fixed diagnostic labels only. Never log exception messages, tokens or bodies.
  console.error(code);
  return apiJson({ error: "webhook_unavailable", code }, 503);
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
    (v.processed_at !== null && !validTimestamp(v.processed_at)) ||
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
/** Re-read retained authenticated envelopes when a mapper learns a new format. */
export async function openEnvelope(
  sealed: string,
  secret: string,
): Promise<unknown> {
  if (sealed.length > 50000 || !/^[A-Za-z0-9+/]+=*$/.test(sealed))
    throw Error();
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`hiitco.webhook.inbox-key.v1:${secret}`),
  );
  const key = await crypto.subtle.importKey("raw", material, "AES-GCM", false, [
    "decrypt",
  ]);
  const bytes = Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytes.slice(0, 12),
      additionalData: new TextEncoder().encode("hiitco.webhook.inbox.v1"),
    },
    key,
    bytes.slice(12),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
export async function gymMasterWebhook(
  request: Request,
  env: WebhookEnv,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== "/api/gymmaster/webhooks/checkin")
    return null;
  if (request.method !== "POST")
    return apiJson({ error: "method_not_allowed" }, 405, { Allow: "POST" });
  if (!env.GYMMASTER_WEBHOOK_TOKEN)
    return unavailable("GM-WEBHOOK-TOKEN-MISSING");
  if (!/^[\x21-\x7e]{32,256}$/.test(env.GYMMASTER_WEBHOOK_TOKEN))
    return unavailable("GM-WEBHOOK-TOKEN-FORMAT");
  if (!env.GYMMASTER_CHECKIN_INBOX)
    return unavailable("GM-WEBHOOK-INBOX-MISSING");
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
    console.warn("GM-WEBHOOK-FORMAT");
    return apiJson(
      { error: "invalid_webhook", code: "GM-WEBHOOK-FORMAT" },
      400,
    );
  }
  const test =
    event.test_webhook === true || event.payload.test_webhook === true;
  let stage = "GM-WEBHOOK-ENCRYPTION";
  try {
    const sealed = await sealEnvelope(event, env.GYMMASTER_WEBHOOK_TOKEN);
    const mapped = grantedCheckin(event);
    const memberKey = mapped
      ? await memberCheckinIndex(mapped.memberId, env.GYMMASTER_WEBHOOK_TOKEN)
      : null;
    const checkin =
      mapped && memberKey
        ? {
            memberKey,
            id: mapped.record.id,
            day: mapped.record.date,
            sealed: await sealCheckin(
              mapped.record,
              env.GYMMASTER_WEBHOOK_TOKEN,
              memberKey,
            ),
          }
        : null;
    stage = "GM-WEBHOOK-STORAGE";
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
          checkin,
        }),
      }),
    );
    if (!stored.ok) {
      try {
        const failure = (await stored.json()) as { code?: unknown };
        if (
          [
            "GM-WEBHOOK-INBOX-BODY",
            "GM-WEBHOOK-INBOX-WRITE",
            "GM-WEBHOOK-INBOX-ALARM",
          ].includes(String(failure.code))
        )
          return unavailable(String(failure.code));
      } catch {
        /* Use the generic storage diagnostic. */
      }
      return unavailable(stage);
    }
    stage = "GM-WEBHOOK-ACK";
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
      checkin: test
        ? "test-excluded"
        : mapped
          ? "mapped"
          : event.event_type !== "member_checkin"
            ? "event-excluded"
            : event.payload.access !== "granted"
              ? "access-excluded"
              : "record-format-excluded",
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
    return unavailable(stage);
  }
}
