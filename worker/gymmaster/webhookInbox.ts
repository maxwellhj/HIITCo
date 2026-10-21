import { apiJson, limitedText } from "./auth";
import { openEnvelope, type WebhookEnv } from "./webhook";
import {
  grantedCheckin,
  memberCheckinIndex,
  sealCheckin,
} from "./checkinRecords";
interface SqlCursor<T> {
  one(): T;
  toArray(): T[];
}
interface SqlStore {
  exec<T = Record<string, unknown>>(
    query: string,
    ...bindings: (string | number | null)[]
  ): SqlCursor<T>;
}
interface InboxState {
  storage: {
    sql: SqlStore;
    transactionSync<T>(callback: () => T): T;
    getAlarm(): Promise<number | null>;
    setAlarm(time: number): Promise<void>;
  };
}
/** Private, durable staging inbox. No public read endpoint or member-data access. */
export class GymMasterCheckinInbox {
  constructor(
    private state: InboxState,
    private env: WebhookEnv,
  ) {
    state.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS pending_webhooks (event_key TEXT PRIMARY KEY, sealed_event TEXT NOT NULL, expires_at INTEGER NOT NULL)",
    );
    state.storage.sql.exec(
      "CREATE INDEX IF NOT EXISTS pending_webhooks_expiry ON pending_webhooks(expires_at)",
    );
    state.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS member_checkins (member_key TEXT NOT NULL, record_id TEXT NOT NULL, day TEXT NOT NULL, sealed_record TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(member_key,record_id))",
    );
    state.storage.sql.exec(
      "CREATE INDEX IF NOT EXISTS member_checkins_dates ON member_checkins(member_key,day)",
    );
    state.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS checkin_imports (event_key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)",
    );
  }
  async fetch(request: Request) {
    if (
      request.method === "POST" &&
      new URL(request.url).pathname === "/checkins/query"
    )
      return this.query(request);
    if (request.method !== "POST" || new URL(request.url).pathname !== "/store")
      return apiJson({ error: "not_found" }, 404);
    let stage = "GM-WEBHOOK-INBOX-BODY";
    try {
      const value: unknown = JSON.parse(await limitedText(request.body, 65536));
      if (!value || typeof value !== "object") throw Error();
      const { key, sealed, checkin } = value as Record<string, unknown>;
      if (
        typeof key !== "string" ||
        !/^(live|test):[1-9][0-9]{0,15}$/.test(key) ||
        typeof sealed !== "string" ||
        sealed.length > 50000 ||
        !/^[A-Za-z0-9+/]+=*$/.test(sealed)
      )
        throw Error();
      let mapped: {
        memberKey: string;
        id: string;
        day: string;
        sealed: string;
      } | null = null;
      if (checkin !== null && checkin !== undefined) {
        if (typeof checkin !== "object" || key.startsWith("test:"))
          throw Error();
        const c = checkin as Record<string, unknown>;
        if (
          typeof c.memberKey !== "string" ||
          !/^[a-f0-9]{64}$/.test(c.memberKey) ||
          typeof c.id !== "string" ||
          !/^[1-9][0-9]{0,15}$/.test(c.id) ||
          typeof c.day !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(c.day) ||
          typeof c.sealed !== "string" ||
          c.sealed.length > 4000 ||
          !/^[A-Za-z0-9+/]+=*$/.test(c.sealed)
        )
          throw Error();
        mapped = {
          memberKey: c.memberKey,
          id: c.id,
          day: c.day,
          sealed: c.sealed,
        };
      }
      // Both writes commit together, and retries can safely fill a missing derived record.
      stage = "GM-WEBHOOK-INBOX-WRITE";
      const duplicate = this.state.storage.transactionSync(() => {
        const expires = Date.now() + 30 * 86400000;
        this.state.storage.sql.exec(
          "INSERT OR IGNORE INTO pending_webhooks(event_key,sealed_event,expires_at) VALUES (?,?,?)",
          key,
          sealed,
          expires,
        );
        const { changed } = this.state.storage.sql
          .exec<{ changed: number }>("SELECT changes() AS changed")
          .one();
        if (mapped)
          this.state.storage.sql.exec(
            "INSERT OR IGNORE INTO member_checkins(member_key,record_id,day,sealed_record,expires_at) VALUES (?,?,?,?,?)",
            mapped.memberKey,
            mapped.id,
            mapped.day,
            mapped.sealed,
            expires,
          );
        if (key.startsWith("live:"))
          this.state.storage.sql.exec(
            "INSERT OR IGNORE INTO checkin_imports(event_key,expires_at) VALUES (?,?)",
            `v2:${key}`,
            expires,
          );
        return changed === 0;
      });
      stage = "GM-WEBHOOK-INBOX-ALARM";
      if ((await this.state.storage.getAlarm()) === null)
        await this.state.storage.setAlarm(Date.now() + 3600000);
      return apiJson({ received: true, duplicate });
    } catch {
      return apiJson({ error: "storage_unavailable", code: stage }, 503);
    }
  }
  private async backfill() {
    const secret = this.env.GYMMASTER_WEBHOOK_TOKEN;
    if (!secret) return false;
    const pending = this.state.storage.sql
      .exec<{ event_key: string; sealed_event: string; expires_at: number }>(
        "SELECT p.event_key,p.sealed_event,p.expires_at FROM pending_webhooks p LEFT JOIN checkin_imports m ON m.event_key=('v2:'||p.event_key) WHERE m.event_key IS NULL AND p.event_key LIKE 'live:%' AND p.expires_at>? ORDER BY p.expires_at DESC LIMIT 50",
        Date.now(),
      )
      .toArray();
    for (const row of pending) {
      let record: {
        memberKey: string;
        id: string;
        day: string;
        sealed: string;
      } | null = null;
      try {
        const mapped = grantedCheckin(
          await openEnvelope(row.sealed_event, secret),
        );
        if (mapped) {
          const memberKey = await memberCheckinIndex(mapped.memberId, secret);
          record = {
            memberKey,
            id: mapped.record.id,
            day: mapped.record.date,
            sealed: await sealCheckin(mapped.record, secret, memberKey),
          };
        }
      } catch {
        console.warn("GM-CHECKINS-STAGED-READ");
      }
      this.state.storage.transactionSync(() => {
        if (record)
          this.state.storage.sql.exec(
            "INSERT OR IGNORE INTO member_checkins(member_key,record_id,day,sealed_record,expires_at) VALUES (?,?,?,?,?)",
            record.memberKey,
            record.id,
            record.day,
            record.sealed,
            row.expires_at,
          );
        this.state.storage.sql.exec(
          "INSERT OR IGNORE INTO checkin_imports(event_key,expires_at) VALUES (?,?)",
          `v2:${row.event_key}`,
          row.expires_at,
        );
      });
    }
    const { remaining } = this.state.storage.sql
      .exec<{ remaining: number }>(
        "SELECT EXISTS(SELECT 1 FROM pending_webhooks p LEFT JOIN checkin_imports m ON m.event_key=('v2:'||p.event_key) WHERE m.event_key IS NULL AND p.event_key LIKE 'live:%' AND p.expires_at>?) AS remaining",
        Date.now(),
      )
      .one();
    return remaining > 0;
  }
  private async query(request: Request) {
    try {
      const value = JSON.parse(await limitedText(request.body, 1024)) as Record<
        string,
        unknown
      >;
      if (
        typeof value.memberKey !== "string" ||
        !/^[a-f0-9]{64}$/.test(value.memberKey) ||
        typeof value.from !== "string" ||
        typeof value.through !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value.from) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value.through)
      )
        throw Error();
      const span = Date.parse(value.through) - Date.parse(value.from);
      if (!Number.isFinite(span) || span < 0 || span > 21 * 86400000)
        throw Error();
      const historyPending = await this.backfill();
      if (historyPending) await this.state.storage.setAlarm(Date.now() + 1000);
      const rows = this.state.storage.sql
        .exec<{ sealed_record: string }>(
          "SELECT sealed_record FROM member_checkins WHERE member_key=? AND day>=? AND day<=? AND expires_at>? ORDER BY day,record_id LIMIT 1001",
          value.memberKey,
          value.from,
          value.through,
          Date.now(),
        )
        .toArray();
      if (rows.length > 1000) throw Error();
      return apiJson({
        records: rows.map((row) => row.sealed_record),
        historyPending,
      });
    } catch {
      return apiJson({ error: "checkins_unavailable" }, 503);
    }
  }
  async alarm() {
    const historyPending = await this.backfill();
    this.state.storage.sql.exec(
      "DELETE FROM checkin_imports WHERE expires_at <= ?",
      Date.now(),
    );
    this.state.storage.sql.exec(
      "DELETE FROM pending_webhooks WHERE expires_at <= ?",
      Date.now(),
    );
    this.state.storage.sql.exec(
      "DELETE FROM member_checkins WHERE expires_at <= ?",
      Date.now(),
    );
    const { remaining } = this.state.storage.sql
      .exec<{ remaining: number }>(
        "SELECT (SELECT count(*) FROM pending_webhooks)+(SELECT count(*) FROM member_checkins) AS remaining",
      )
      .one();
    if (remaining > 0)
      await this.state.storage.setAlarm(
        Date.now() + (historyPending ? 1000 : 3600000),
      );
  }
}
