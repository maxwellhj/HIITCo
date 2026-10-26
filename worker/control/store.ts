import { apiJson, limitedText } from "../gymmaster/auth";
interface Cursor<T> {
  one(): T;
  toArray(): T[];
}
interface State {
  storage: {
    sql: {
      exec<T = Record<string, unknown>>(
        query: string,
        ...args: unknown[]
      ): Cursor<T>;
    };
    transactionSync<T>(fn: () => T): T;
  };
}
const key = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const stickerId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);
/** Only reached through a private Durable Object binding; never routed from the public Worker. */
export class ControlStore {
  constructor(private state: State) {
    for (const sql of [
      "CREATE TABLE IF NOT EXISTS members (member_key TEXT PRIMARY KEY,sealed TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS stickers (id TEXT PRIMARY KEY,sealed TEXT NOT NULL,art TEXT NOT NULL,mime TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS awards (member_key TEXT NOT NULL,sticker_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(member_key,sticker_id))",
      "CREATE TABLE IF NOT EXISTS snapshots (member_key TEXT NOT NULL,kind TEXT NOT NULL,revision INTEGER NOT NULL,sealed TEXT NOT NULL,PRIMARY KEY(member_key,kind))",
      "CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY,member_key TEXT NOT NULL,sealed TEXT NOT NULL,created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS activity_read (id TEXT PRIMARY KEY)",
      "CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY,sealed TEXT NOT NULL,published INTEGER NOT NULL DEFAULT 0)",
      "CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY,sealed TEXT NOT NULL)",
    ])
      state.storage.sql.exec(sql);
  }
  async fetch(request: Request) {
    const url = new URL(request.url),
      sql = this.state.storage.sql;
    try {
      if (request.method === "GET") {
        if (url.pathname === "/skills")
          return apiJson({
            rows: sql
              .exec(
                "SELECT id,sealed,published FROM skills ORDER BY rowid DESC LIMIT 200",
              )
              .toArray(),
          });
        if (url.pathname === "/setting") {
          if (url.searchParams.get("id") !== "reports-key") throw Error();
          return apiJson({
            rows: sql
              .exec("SELECT sealed FROM settings WHERE id='reports-key'")
              .toArray(),
          });
        }
        if (url.pathname === "/members") {
          const after = url.searchParams.get("after") ?? "";
          if (after && !key(after)) throw Error();
          const rows = sql
            .exec<{ member_key: string; sealed: string }>(
              "SELECT member_key,sealed FROM members WHERE member_key>? ORDER BY member_key LIMIT 501",
              after,
            )
            .toArray();
          return apiJson({
            rows: rows.slice(0, 500),
            next: rows.length > 500 ? rows[499].member_key : null,
          });
        }
        if (url.pathname === "/member") {
          const id = url.searchParams.get("id");
          if (!key(id)) throw Error();
          return apiJson({
            rows: sql
              .exec(
                "SELECT member_key,sealed FROM members WHERE member_key=?",
                id,
              )
              .toArray(),
          });
        }
        if (url.pathname === "/stickers")
          return apiJson({
            rows: sql
              .exec("SELECT id,sealed FROM stickers ORDER BY id LIMIT 100")
              .toArray(),
          });
        if (url.pathname === "/art") {
          const id = url.searchParams.get("id");
          if (!stickerId(id)) throw Error();
          return apiJson({
            rows: sql
              .exec("SELECT art,mime FROM stickers WHERE id=?", id)
              .toArray(),
          });
        }
        if (url.pathname === "/awards") {
          const id = url.searchParams.get("id");
          if (!key(id)) throw Error();
          return apiJson({
            awards: sql
              .exec<{ sticker_id: string; created_at: string }>(
                "SELECT sticker_id,created_at FROM awards WHERE member_key=? ORDER BY sticker_id",
                id,
              )
              .toArray(),
          });
        }
        if (url.pathname === "/activity")
          return apiJson({
            snapshots: sql
              .exec("SELECT member_key,kind,sealed FROM snapshots LIMIT 4000")
              .toArray(),
            audit: sql
              .exec(
                "SELECT id,member_key,sealed,created_at FROM audit ORDER BY created_at DESC LIMIT 100",
              )
              .toArray(),
            read: sql
              .exec<{ id: string }>(
                "SELECT id FROM activity_read ORDER BY rowid DESC LIMIT 20000",
              )
              .toArray()
              .map((r) => r.id),
          });
        return apiJson({ error: "not_found" }, 404);
      }
      if (request.method !== "POST")
        return apiJson({ error: "method_not_allowed" }, 405);
      const body = JSON.parse(await limitedText(request.body, 1100000));
      if (
        ["/skill", "/skill-publish", "/skill-remove"].includes(url.pathname)
      ) {
        if (!stickerId(body.id)) throw Error();
        if (url.pathname === "/skill") {
          if (typeof body.sealed !== "string" || body.sealed.length > 8000)
            throw Error();
          if (
            sql
              .exec<{ count: number }>("SELECT count(*) AS count FROM skills")
              .one().count >= 200
          )
            return apiJson({ error: "library_full" }, 409);
          sql.exec(
            "INSERT INTO skills(id,sealed,published) VALUES(?,?,0)",
            body.id,
            body.sealed,
          );
        } else if (url.pathname === "/skill-publish") {
          if (typeof body.published !== "boolean") throw Error();
          sql.exec(
            "UPDATE skills SET published=? WHERE id=?",
            body.published ? 1 : 0,
            body.id,
          );
        } else sql.exec("DELETE FROM skills WHERE id=?", body.id);
        return apiJson({ saved: true });
      }
      if (url.pathname === "/setting") {
        if (
          body.id !== "reports-key" ||
          typeof body.sealed !== "string" ||
          body.sealed.length > 3000
        )
          throw Error();
        sql.exec(
          "INSERT INTO settings(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed",
          body.id,
          body.sealed,
        );
        return apiJson({ saved: true });
      }
      if (url.pathname === "/register") {
        if (
          !key(body.memberKey) ||
          typeof body.sealed !== "string" ||
          body.sealed.length > 8000
        )
          throw Error();
        sql.exec(
          "INSERT INTO members(member_key,sealed) VALUES(?,?) ON CONFLICT(member_key) DO UPDATE SET sealed=excluded.sealed",
          body.memberKey,
          body.sealed,
        );
        return apiJson({ saved: true });
      }
      if (url.pathname === "/sticker") {
        if (
          !stickerId(body.id) ||
          typeof body.sealed !== "string" ||
          body.sealed.length > 4000 ||
          typeof body.art !== "string" ||
          body.art.length > 500000 ||
          !["image/png", "image/jpeg", "image/webp"].includes(body.mime)
        )
          throw Error();
        const existing = sql
          .exec("SELECT id FROM stickers WHERE id=?", body.id)
          .toArray();
        if (existing.length) return apiJson({ saved: true, id: body.id });
        if (
          sql
            .exec<{ count: number }>("SELECT count(*) AS count FROM stickers")
            .one().count >= 100
        )
          return apiJson({ error: "catalog_full" }, 409);
        sql.exec(
          "INSERT INTO stickers(id,sealed,art,mime) VALUES(?,?,?,?)",
          body.id,
          body.sealed,
          body.art,
          body.mime,
        );
        return apiJson({ saved: true, id: body.id });
      }
      if (url.pathname === "/award") {
        if (
          !key(body.memberKey) ||
          !stickerId(body.stickerId) ||
          typeof body.unlocked !== "boolean" ||
          !stickerId(body.auditId) ||
          typeof body.audit !== "string" ||
          typeof body.createdAt !== "string"
        )
          throw Error();
        if (
          !sql
            .exec(
              "SELECT member_key FROM members WHERE member_key=?",
              body.memberKey,
            )
            .toArray().length ||
          !sql
            .exec("SELECT id FROM stickers WHERE id=?", body.stickerId)
            .toArray().length
        )
          return apiJson({ error: "not_found" }, 404);
        this.state.storage.transactionSync(() => {
          if (
            sql.exec("SELECT id FROM audit WHERE id=?", body.auditId).toArray()
              .length
          )
            return;
          const exists =
            sql
              .exec(
                "SELECT sticker_id FROM awards WHERE member_key=? AND sticker_id=?",
                body.memberKey,
                body.stickerId,
              )
              .toArray().length > 0;
          if (exists === body.unlocked) return;
          if (body.unlocked)
            sql.exec(
              "INSERT OR IGNORE INTO awards(member_key,sticker_id,created_at) VALUES(?,?,?)",
              body.memberKey,
              body.stickerId,
              body.createdAt,
            );
          else
            sql.exec(
              "DELETE FROM awards WHERE member_key=? AND sticker_id=?",
              body.memberKey,
              body.stickerId,
            );
          sql.exec(
            "INSERT OR IGNORE INTO audit(id,member_key,sealed,created_at) VALUES(?,?,?,?)",
            body.auditId,
            body.memberKey,
            body.audit,
            body.createdAt,
          );
        });
        return apiJson({ saved: true });
      }
      if (url.pathname === "/metrics") {
        if (
          !key(body.memberKey) ||
          !["training", "chow"].includes(body.kind) ||
          !Number.isSafeInteger(body.revision) ||
          body.revision < 0 ||
          typeof body.sealed !== "string" ||
          body.sealed.length > 200000
        )
          throw Error();
        sql.exec(
          "INSERT INTO snapshots(member_key,kind,revision,sealed) VALUES(?,?,?,?) ON CONFLICT(member_key,kind) DO UPDATE SET revision=excluded.revision,sealed=excluded.sealed WHERE excluded.revision>=snapshots.revision",
          body.memberKey,
          body.kind,
          body.revision,
          body.sealed,
        );
        return apiJson({ saved: true });
      }
      if (url.pathname === "/read") {
        if (
          !Array.isArray(body.ids) ||
          body.ids.length > 200 ||
          body.ids.some(
            (id: unknown) => typeof id !== "string" || id.length > 300,
          )
        )
          throw Error();
        this.state.storage.transactionSync(() => {
          for (const id of body.ids)
            sql.exec("INSERT OR IGNORE INTO activity_read(id) VALUES(?)", id);
          sql.exec(
            "DELETE FROM activity_read WHERE rowid NOT IN (SELECT rowid FROM activity_read ORDER BY rowid DESC LIMIT 20000)",
          );
        });
        return apiJson({ saved: true });
      }
      return apiJson({ error: "not_found" }, 404);
    } catch {
      return apiJson({ error: "invalid_request" }, 400);
    }
  }
}
