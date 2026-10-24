import { apiJson, limitedText, type AuthEnv } from "./gymmaster/auth";
import { readSession, clearSessionCookie } from "./gymmaster/session";
import { emptyTrainingLog, parseTrainingLog } from "../src/domain/training";
import { dateKey } from "../src/domain/attendance";
interface Namespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
export interface TrainingEnv extends AuthEnv {
  MEMBER_TRAINING_LOGS?: Namespace;
}
const encoder = new TextEncoder();
export async function trainingMemberKey(memberId: number, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const hash = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`hiitco.training.member.v1:${memberId}`),
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
async function cryptKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(`hiitco.training.encryption.v1:${secret}`),
    ),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function sealTraining(
  value: unknown,
  secret: string,
  memberKey: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(memberKey) },
    await cryptKey(secret),
    encoder.encode(JSON.stringify(value)),
  );
  const bytes = new Uint8Array(12 + cipher.byteLength);
  bytes.set(iv);
  bytes.set(new Uint8Array(cipher), 12);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export async function openTraining(
  value: string,
  secret: string,
  memberKey: string,
) {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytes.slice(0, 12),
      additionalData: encoder.encode(memberKey),
    },
    await cryptKey(secret),
    bytes.slice(12),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
export async function memberTraining(
  request: Request,
  env: TrainingEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/gymmaster/training") return null;
  if (!["GET", "POST"].includes(request.method))
    return apiJson({ error: "method_not_allowed" }, 405, {
      Allow: "GET, POST",
    });
  if (
    url.search ||
    request.headers.get("Sec-Fetch-Site") === "cross-site" ||
    (request.method === "POST" && request.headers.get("Origin") !== url.origin)
  )
    return apiJson({ error: "request_not_allowed" }, 403);
  const session = await readSession(request, env.GYMMASTER_API_KEY);
  if (!session)
    return apiJson({ error: "session_expired" }, 401, {
      "Set-Cookie": clearSessionCookie(),
    });
  if (!env.MEMBER_TRAINING_LOGS || !env.LOGIN_RATE_LIMITER)
    return apiJson({ error: "training_unavailable" }, 503);
  try {
    const memberKey = await trainingMemberKey(
      session.memberId,
      env.GYMMASTER_API_KEY!,
    );
    if (
      !(
        await env.LOGIN_RATE_LIMITER.limit({
          key: `training:${request.method}:${memberKey}`,
        })
      ).success
    )
      return apiJson({ error: "too_many_attempts" }, 429, {
        "Retry-After": "60",
      });
    const store = env.MEMBER_TRAINING_LOGS.get(
      env.MEMBER_TRAINING_LOGS.idFromName(memberKey),
    );
    if (request.method === "GET") {
      const response = await store.fetch(
        new Request("https://training.internal/log"),
      );
      if (!response.ok) throw Error();
      const result = (await response.json()) as {
        revision: number;
        sealed: string | null;
      };
      if (
        !Number.isSafeInteger(result.revision) ||
        result.revision < 0 ||
        (result.sealed !== null && typeof result.sealed !== "string")
      )
        throw Error();
      const log =
        result.sealed === null
          ? emptyTrainingLog()
          : parseTrainingLog(
              await openTraining(
                result.sealed,
                env.GYMMASTER_API_KEY!,
                memberKey,
              ),
              dateKey(new Date()),
            );
      return apiJson({ log, revision: result.revision });
    }
    let log, revision;
    try {
      if (
        request.headers.get("Content-Type")?.split(";")[0] !==
        "application/json"
      )
        throw Error();
      const body = JSON.parse(await limitedText(request.body, 400000));
      if (
        !body ||
        typeof body !== "object" ||
        Object.keys(body).some((k) => !["log", "revision"].includes(k)) ||
        !Number.isSafeInteger(body.revision) ||
        body.revision < 0
      )
        throw Error();
      log = parseTrainingLog(body.log, dateKey(new Date()));
      revision = body.revision;
    } catch {
      return apiJson({ error: "invalid_training_log" }, 400);
    }
    const sealed = await sealTraining(log, env.GYMMASTER_API_KEY!, memberKey);
    const response = await store.fetch(
      new Request("https://training.internal/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sealed, revision }),
      }),
    );
    if (response.status === 409)
      return apiJson({ error: "training_conflict" }, 409);
    if (!response.ok) throw Error();
    const result = (await response.json()) as { revision: number };
    if (result.revision !== revision + 1) throw Error();
    return apiJson({ revision: result.revision });
  } catch {
    return apiJson({ error: "training_unavailable" }, 503);
  }
}
interface StoreState {
  storage: {
    sql: {
      exec<T = Record<string, unknown>>(
        query: string,
        ...args: unknown[]
      ): { one(): T };
    };
    transactionSync<T>(callback: () => T): T;
  };
}
/** Private per-member Durable Object. Only encrypted content reaches storage. */
export class MemberTrainingStore {
  constructor(private state: StoreState) {
    state.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS training_log (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, sealed TEXT NOT NULL)",
    );
  }
  async fetch(request: Request) {
    if (new URL(request.url).pathname !== "/log")
      return apiJson({ error: "not_found" }, 404);
    if (request.method === "GET") {
      const result = this.state.storage.sql
        .exec<{ revision: number; sealed: string | null }>(
          "SELECT COALESCE((SELECT revision FROM training_log WHERE id=1),0) AS revision,(SELECT sealed FROM training_log WHERE id=1) AS sealed",
        )
        .one();
      return apiJson(result);
    }
    if (request.method !== "POST")
      return apiJson({ error: "method_not_allowed" }, 405);
    try {
      const { sealed, revision } = JSON.parse(
        await limitedText(request.body, 600000),
      );
      if (
        typeof sealed !== "string" ||
        sealed.length > 550000 ||
        !Number.isSafeInteger(revision) ||
        revision < 0
      )
        throw Error();
      const saved = this.state.storage.transactionSync(() => {
        const current = this.state.storage.sql
          .exec<{ revision: number }>(
            "SELECT COALESCE((SELECT revision FROM training_log WHERE id=1),0) AS revision",
          )
          .one().revision;
        if (current !== revision) return false;
        this.state.storage.sql.exec(
          "INSERT INTO training_log(id,revision,sealed) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,sealed=excluded.sealed",
          revision + 1,
          sealed,
        );
        return true;
      });
      return saved
        ? apiJson({ revision: revision + 1 })
        : apiJson({ error: "conflict" }, 409);
    } catch {
      return apiJson({ error: "invalid_request" }, 400);
    }
  }
}
