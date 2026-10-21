import { apiJson, limitedText } from "./auth";
interface SqlCursor<T> {
  one(): T;
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
    getAlarm(): Promise<number | null>;
    setAlarm(time: number): Promise<void>;
  };
}
/** Private, durable staging inbox. No public read endpoint or member-data access. */
export class GymMasterCheckinInbox {
  constructor(private state: InboxState) {
    state.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS pending_webhooks (event_key TEXT PRIMARY KEY, sealed_event TEXT NOT NULL, expires_at INTEGER NOT NULL)",
    );
    state.storage.sql.exec(
      "CREATE INDEX IF NOT EXISTS pending_webhooks_expiry ON pending_webhooks(expires_at)",
    );
  }
  async fetch(request: Request) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/store")
      return apiJson({ error: "not_found" }, 404);
    try {
      const value: unknown = JSON.parse(await limitedText(request.body, 65536));
      if (!value || typeof value !== "object") throw Error();
      const { key, sealed } = value as Record<string, unknown>;
      if (
        typeof key !== "string" ||
        !/^(live|test):[1-9][0-9]{0,15}$/.test(key) ||
        typeof sealed !== "string" ||
        sealed.length > 50000 ||
        !/^[A-Za-z0-9+/]+=*$/.test(sealed)
      )
        throw Error();
      // Unique IDs make delivery retries idempotent; test records use a separate namespace.
      this.state.storage.sql.exec(
        "INSERT OR IGNORE INTO pending_webhooks(event_key,sealed_event,expires_at) VALUES (?,?,?)",
        key,
        sealed,
        Date.now() + 30 * 86400000,
      );
      const { changed } = this.state.storage.sql
        .exec<{ changed: number }>("SELECT changes() AS changed")
        .one();
      if ((await this.state.storage.getAlarm()) === null)
        await this.state.storage.setAlarm(Date.now() + 3600000);
      return apiJson({ received: true, duplicate: changed === 0 });
    } catch {
      return apiJson({ error: "storage_unavailable" }, 503);
    }
  }
  async alarm() {
    this.state.storage.sql.exec(
      "DELETE FROM pending_webhooks WHERE expires_at <= ?",
      Date.now(),
    );
    const { remaining } = this.state.storage.sql
      .exec<{ remaining: number }>(
        "SELECT count(*) AS remaining FROM pending_webhooks",
      )
      .one();
    if (remaining > 0) await this.state.storage.setAlarm(Date.now() + 3600000);
  }
}
