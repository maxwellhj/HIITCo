export const SESSION_COOKIE = "__Host-hiitco-gymmaster";
const CONTEXT = new TextEncoder().encode("hiitco.gymmaster.session.v1");
export interface MemberSession {
  token: string;
  memberId: number;
  expiresAt: number;
}
function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 4000)
    throw Error("Invalid session");
  return Uint8Array.from(
    atob(
      value.replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - (value.length % 4)) % 4),
    ),
    (c) => c.charCodeAt(0),
  );
}
async function key(secret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`hiitco.gymmaster.cookie-key.v1:${secret}`),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function sealSession(session: MemberSession, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: CONTEXT },
    await key(secret),
    new TextEncoder().encode(JSON.stringify(session)),
  );
  const bytes = new Uint8Array(12 + encrypted.byteLength);
  bytes.set(iv);
  bytes.set(new Uint8Array(encrypted), 12);
  return encode(bytes);
}
export async function readSession(
  request: Request,
  secret: string | undefined,
  now = Date.now(),
): Promise<MemberSession | null> {
  if (!secret) return null;
  const cookies = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((part) => part.trim());
  const values = cookies.filter((part) =>
    part.startsWith(SESSION_COOKIE + "="),
  );
  if (values.length !== 1) return null;
  try {
    const bytes = decode(values[0].slice(SESSION_COOKIE.length + 1));
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: CONTEXT },
      await key(secret),
      bytes.slice(12),
    );
    const data: unknown = JSON.parse(new TextDecoder().decode(decrypted));
    if (!data || typeof data !== "object") return null;
    const s = data as MemberSession;
    if (
      typeof s.token !== "string" ||
      !s.token.length ||
      s.token.length > 2000 ||
      !Number.isSafeInteger(s.memberId) ||
      s.memberId < 1 ||
      !Number.isSafeInteger(s.expiresAt) ||
      s.expiresAt <= now ||
      s.expiresAt > now + 3600000
    )
      return null;
    return s;
  } catch {
    return null;
  }
}
export function sessionCookie(value: string, maxAge: number) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}`;
}
export const clearSessionCookie = () => sessionCookie("", 0);
