import { personalBests } from "../src/domain/control";
import { emptyChowLog, parseChowLog } from "../src/domain/chow";
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
  if (
    !["/api/gymmaster/training", "/api/gymmaster/chow"].includes(url.pathname)
  )
    return null;
  const isChow = url.pathname.endsWith("/chow");
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
          key: `${isChow ? "chow" : "training"}:${request.method}:${memberKey}`,
        })
      ).success
    )
      return apiJson({ error: "too_many_attempts" }, 429, {
        "Retry-After": "60",
      });
    const store = env.MEMBER_TRAINING_LOGS.get(
      env.MEMBER_TRAINING_LOGS.idFromName(memberKey),
    );
    const storageUrl = `https://training.internal/${isChow ? "chow" : "log"}`;
    const encryptionContext = isChow ? `${memberKey}:chow-v1` : memberKey;
    const parse = async (value: unknown) =>
      isChow
        ? parseChowLog(value, dateKey(new Date()))
        : parseTrainingLog(value, dateKey(new Date()));
    if (request.method === "GET") {
      const response = await store.fetch(new Request(storageUrl));
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
          ? isChow
            ? emptyChowLog()
            : emptyTrainingLog()
          : await parse(
              await openTraining(
                result.sealed,
                env.GYMMASTER_API_KEY!,
                encryptionContext,
              ),
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
      log = await parse(body.log);
      revision = body.revision;
    } catch {
      return apiJson({ error: "invalid_training_log" }, 400);
    }
    if (isChow) {
      const existingResponse = await store.fetch(new Request(storageUrl));
      if (!existingResponse.ok) throw Error();
      const existing = (await existingResponse.json()) as {
        revision: number;
        sealed: string | null;
      };
      if (existing.revision !== revision)
        return apiJson({ error: "training_conflict" }, 409);
      const previous = existing.sealed
        ? await parseChowLog(
            await openTraining(
              existing.sealed,
              env.GYMMASTER_API_KEY!,
              encryptionContext,
            ),
            dateKey(new Date()),
          )
        : emptyChowLog();
      const candidate = log as import("../src/domain/chow").ChowLogData;
      if (
        candidate.scores.some(
          (score) =>
            score.unit !== "sets" &&
            !previous.scores.some(
              (old) => JSON.stringify(old) === JSON.stringify(score),
            ),
        )
      )
        return apiJson({ error: "sets_only" }, 400);
    }
    const sealed = await sealTraining(
      log,
      env.GYMMASTER_API_KEY!,
      encryptionContext,
    );
    const response = await store.fetch(
      new Request(storageUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sealed, revision, memberKey }),
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
      ): { one(): T; toArray(): T[] };
    };
    transactionSync<T>(callback: () => T): T;
    setAlarm?(time: number): Promise<void>;
  };
}
/** Private per-member Durable Object. Only encrypted content reaches storage. */
export class MemberTrainingStore {
  constructor(
    private state: StoreState,
    private env: TrainingEnv = {},
  ) {
    for (const table of ["training_log", "chow_log"])
      state.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS ${table} (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, sealed TEXT NOT NULL)`,
      );
    state.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS control_sync (kind TEXT PRIMARY KEY,member_key TEXT NOT NULL,revision INTEGER NOT NULL,sealed TEXT NOT NULL)",
    );
  }
  private async flushSync() {
    if (!this.env.CONTROL_STORE) return;
    const sql = this.state.storage.sql;
    try {
      const rows = sql
        .exec<{
          kind: string;
          member_key: string;
          revision: number;
          sealed: string;
        }>("SELECT kind,member_key,revision,sealed FROM control_sync")
        .toArray();
      for (const row of rows) {
        const response = await this.env.CONTROL_STORE.get(
          this.env.CONTROL_STORE.idFromName("hiitco-control-v1"),
        ).fetch(
          new Request("https://control.internal/metrics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              memberKey: row.member_key,
              kind: row.kind,
              revision: row.revision,
              sealed: row.sealed,
            }),
          }),
        );
        if (!response.ok) throw Error();
        sql.exec(
          "DELETE FROM control_sync WHERE kind=? AND revision=?",
          row.kind,
          row.revision,
        );
      }
    } finally {
      if (
        sql
          .exec<{ count: number }>("SELECT count(*) AS count FROM control_sync")
          .one().count > 0
      )
        await this.state.storage.setAlarm?.(Date.now() + 60000);
    }
  }
  async alarm() {
    await this.flushSync();
  }
  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (!["/log", "/chow"].includes(path))
      return apiJson({ error: "not_found" }, 404);
    const table = path === "/chow" ? "chow_log" : "training_log";
    if (request.method === "GET") {
      const result = this.state.storage.sql
        .exec<{ revision: number; sealed: string | null }>(
          `SELECT COALESCE((SELECT revision FROM ${table} WHERE id=1),0) AS revision,(SELECT sealed FROM ${table} WHERE id=1) AS sealed`,
        )
        .one();
      if (this.env.CONTROL_STORE) {
        try {
          await this.flushSync();
        } catch {
          console.warn("CONTROL-SYNC-PENDING");
        }
      }
      return apiJson(result);
    }
    if (request.method !== "POST")
      return apiJson({ error: "method_not_allowed" }, 405);
    try {
      const { sealed, revision, memberKey } = JSON.parse(
        await limitedText(request.body, 600000),
      );
      if (
        typeof sealed !== "string" ||
        sealed.length > 550000 ||
        !Number.isSafeInteger(revision) ||
        revision < 0
      )
        throw Error();
      let snapshot: string | null = null;
      const kind = path === "/chow" ? "chow" : "training";
      if (this.env.CONTROL_STORE) {
        if (
          !this.env.GYMMASTER_API_KEY ||
          typeof memberKey !== "string" ||
          !/^[a-f0-9]{64}$/.test(memberKey)
        )
          throw Error();
        const log = await openTraining(
          sealed,
          this.env.GYMMASTER_API_KEY,
          path === "/chow" ? `${memberKey}:chow-v1` : memberKey,
        );
        const parsed =
          kind === "chow"
            ? await parseChowLog(log, dateKey(new Date()))
            : parseTrainingLog(log, dateKey(new Date()));
        snapshot = await sealTraining(
          personalBests(parsed, kind),
          this.env.GYMMASTER_API_KEY,
          `control.metrics:${memberKey}:${kind}`,
        );
      }
      const saved = this.state.storage.transactionSync(() => {
        const current = this.state.storage.sql
          .exec<{ revision: number }>(
            `SELECT COALESCE((SELECT revision FROM ${table} WHERE id=1),0) AS revision`,
          )
          .one().revision;
        if (current !== revision) return false;
        this.state.storage.sql.exec(
          `INSERT INTO ${table}(id,revision,sealed) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,sealed=excluded.sealed`,
          revision + 1,
          sealed,
        );
        if (snapshot)
          this.state.storage.sql.exec(
            "INSERT INTO control_sync(kind,member_key,revision,sealed) VALUES(?,?,?,?) ON CONFLICT(kind) DO UPDATE SET member_key=excluded.member_key,revision=excluded.revision,sealed=excluded.sealed",
            kind,
            memberKey,
            revision + 1,
            snapshot,
          );
        return true;
      });
      if (saved && snapshot) {
        try {
          await this.flushSync();
        } catch {
          console.warn("CONTROL-SYNC-PENDING");
        }
      }
      return saved
        ? apiJson({ revision: revision + 1 })
        : apiJson({ error: "conflict" }, 409);
    } catch {
      return apiJson({ error: "invalid_request" }, 400);
    }
  }
}
