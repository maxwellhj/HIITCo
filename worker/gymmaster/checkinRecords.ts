import type { MemberCheckin } from "../../src/domain/checkinTimes";
function id(value: unknown): number | null {
  if (typeof value === "string" && /^[1-9][0-9]{0,15}$/.test(value))
    value = Number(value);
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}
/** Map only the observed successful Member Checkin shape; never event/delivery time. */
export function grantedCheckin(
  value: unknown,
): { memberId: number; record: MemberCheckin } | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>,
    p = event.payload as Record<string, unknown> | undefined;
  if (
    event.event_type !== "member_checkin" ||
    !p ||
    typeof p !== "object" ||
    Array.isArray(p)
  )
    return null;
  if (
    event.test_webhook === true ||
    p.test_webhook === true ||
    (event.test_webhook !== undefined &&
      typeof event.test_webhook !== "boolean") ||
    (p.test_webhook !== undefined && typeof p.test_webhook !== "boolean") ||
    p.access !== "granted"
  )
    return null;
  const memberId = id(p.memberid),
    recordId = id(p.id);
  if (
    !memberId ||
    !recordId ||
    typeof p.timestamp !== "string" ||
    !/^\d{4}-\d{2}-\d{2}[T ](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?$/.test(
      p.timestamp,
    )
  )
    return null;
  const localTimestamp = p.timestamp.replace(" ", "T"),
    date = localTimestamp.slice(0, 10),
    validated = new Date(localTimestamp + "Z");
  if (
    !Number.isFinite(validated.getTime()) ||
    validated.toISOString().slice(0, 10) !== date
  )
    return null;
  return {
    memberId,
    record: {
      id: String(recordId),
      date,
      localTimestamp,
      door: typeof p.doorname === "string" ? p.doorname.slice(0, 120) : null,
    },
  };
}
export async function memberCheckinIndex(memberId: number, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`hiitco.checkin.member-index.v1:${memberId}`),
  );
  return Array.from(new Uint8Array(signed), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
async function recordKey(secret: string, usage: KeyUsage[]) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`hiitco.checkin.record-key.v1:${secret}`),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, usage);
}
const context = (memberKey: string) =>
  new TextEncoder().encode(`hiitco.checkin.record.v1:${memberKey}`);
export async function sealCheckin(
  record: MemberCheckin,
  secret: string,
  memberKey: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: context(memberKey) },
    await recordKey(secret, ["encrypt"]),
    new TextEncoder().encode(JSON.stringify(record)),
  );
  const bytes = new Uint8Array(12 + encrypted.byteLength);
  bytes.set(iv);
  bytes.set(new Uint8Array(encrypted), 12);
  return btoa(String.fromCharCode(...bytes));
}
export async function openCheckin(
  sealed: string,
  secret: string,
  memberKey: string,
): Promise<unknown> {
  if (sealed.length > 4000 || !/^[A-Za-z0-9+/]+=*$/.test(sealed)) throw Error();
  const bytes = Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytes.slice(0, 12),
      additionalData: context(memberKey),
    },
    await recordKey(secret, ["decrypt"]),
    bytes.slice(12),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}
