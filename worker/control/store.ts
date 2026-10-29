import { deliverPush, nextPushAlarm } from "../connect/push";
import { initConnect, connectStore } from "../connect/store";
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
    setAlarm?(time: number): Promise<void>;
  };
}
const key = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const stickerId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);
/** Only reached through a private Durable Object binding; never routed from the public Worker. */
export class ControlStore {
  constructor(
    private state: State,
    private env?: { GYMMASTER_API_KEY?: string },
  ) {
    initConnect(state.storage.sql);
    for (const sql of [
      "CREATE TABLE IF NOT EXISTS event_dismissals (member_key TEXT NOT NULL,event_id TEXT NOT NULL,PRIMARY KEY(member_key,event_id))",
      "CREATE TABLE IF NOT EXISTS attendance (member_key TEXT PRIMARY KEY,sealed TEXT NOT NULL,updated_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS event_responses (member_key TEXT NOT NULL,event_id TEXT NOT NULL,sealed TEXT NOT NULL,PRIMARY KEY(member_key,event_id))",
      "CREATE TABLE IF NOT EXISTS member_targets (member_key TEXT PRIMARY KEY,sealed TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS members (member_key TEXT PRIMARY KEY,sealed TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS stickers (id TEXT PRIMARY KEY,sealed TEXT NOT NULL,art TEXT NOT NULL,mime TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS awards (member_key TEXT NOT NULL,sticker_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(member_key,sticker_id))",
      "CREATE INDEX IF NOT EXISTS awards_by_sticker ON awards(sticker_id)",
      "CREATE TABLE IF NOT EXISTS snapshots (member_key TEXT NOT NULL,kind TEXT NOT NULL,revision INTEGER NOT NULL,sealed TEXT NOT NULL,PRIMARY KEY(member_key,kind))",
      "CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY,member_key TEXT NOT NULL,sealed TEXT NOT NULL,created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS activity_read (id TEXT PRIMARY KEY)",
      "CREATE TABLE IF NOT EXISTS skill_posters (id TEXT PRIMARY KEY,version TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY,sealed TEXT NOT NULL,published INTEGER NOT NULL DEFAULT 0)",
      "CREATE TABLE IF NOT EXISTS club_events (id TEXT PRIMARY KEY,sealed TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY,sealed TEXT NOT NULL)",
    ])
      state.storage.sql.exec(sql);
  }
  async alarm() {
    if (!this.env?.GYMMASTER_API_KEY) return;
    try {
      await deliverPush(this.state.storage.sql, this.env.GYMMASTER_API_KEY);
    } catch {
      console.error("CONNECT-PUSH-DELIVERY");
    }
    const next = nextPushAlarm(this.state.storage.sql);
    if (next !== null)
      await this.state.storage.setAlarm?.(Math.max(Date.now() + 1000, next));
  }
  async fetch(request: Request) {
    const url = new URL(request.url),
      sql = this.state.storage.sql;
    try {
      if (url.pathname === "/connect") {
        const response = await connectStore(
          request,
          sql,
          this.env?.GYMMASTER_API_KEY,
        );
        const alarm = nextPushAlarm(sql);
        if (alarm !== null)
          await this.state.storage.setAlarm?.(
            Math.max(Date.now() + 100, alarm),
          );
        return response;
      }
      if (
        url.pathname === "/connect-push-logout" &&
        request.method === "POST"
      ) {
        const body = (await request.json()) as {
          actor?: string;
          deviceId?: string;
        };
        if (
          !key(body.actor) ||
          typeof body.deviceId !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(body.deviceId)
        )
          throw Error();
        sql.exec(
          "DELETE FROM connect_push_subscriptions WHERE id=? AND member_id=?",
          body.deviceId,
          body.actor,
        );
        return apiJson({ saved: true });
      }
      if (request.method === "GET") {
        if (url.pathname === "/event-dismissals") {
          const memberKey = url.searchParams.get("memberKey");
          if (!key(memberKey)) throw Error();
          return apiJson({
            ids: sql
              .exec<{ event_id: string }>(
                "SELECT d.event_id FROM event_dismissals d JOIN club_events e ON e.id=d.event_id WHERE d.member_key=?",
                memberKey,
              )
              .toArray()
              .map((r) => r.event_id),
          });
        }

        if (url.pathname === "/attendance") {
          const id = url.searchParams.get("id");
          if (!key(id)) throw Error();
          return apiJson({
            sealed:
              sql
                .exec<{ sealed: string }>(
                  "SELECT sealed FROM attendance WHERE member_key=?",
                  id,
                )
                .toArray()[0]?.sealed ?? null,
          });
        }
        if (
          url.pathname === "/event-responses" ||
          url.pathname === "/member-events"
        ) {
          const id = url.searchParams.get("memberKey");
          if (!key(id)) throw Error();
          return apiJson({
            rows:
              url.pathname === "/event-responses"
                ? sql
                    .exec(
                      "SELECT r.event_id,r.sealed FROM event_responses r JOIN club_events e ON e.id=r.event_id WHERE r.member_key=?",
                      id,
                    )
                    .toArray()
                : sql
                    .exec(
                      "SELECT e.id AS event_id,e.sealed AS event_sealed,r.sealed AS response_sealed FROM club_events e LEFT JOIN event_responses r ON r.event_id=e.id AND r.member_key=? LIMIT 500",
                      id,
                    )
                    .toArray(),
          });
        }
        if (url.pathname === "/member-target") {
          const id = url.searchParams.get("id");
          if (!key(id)) throw Error();
          return apiJson({
            sealed:
              sql
                .exec<{ sealed: string }>(
                  "SELECT sealed FROM member_targets WHERE member_key=?",
                  id,
                )
                .toArray()[0]?.sealed ?? null,
            clubTarget:
              sql
                .exec<{ sealed: string }>(
                  "SELECT sealed FROM settings WHERE id='club-target'",
                )
                .toArray()[0]?.sealed ?? null,
          });
        }
        if (url.pathname === "/club")
          return apiJson({
            rows: sql
              .exec("SELECT id,sealed FROM club_events LIMIT 500")
              .toArray(),
            target:
              sql
                .exec<{ sealed: string }>(
                  "SELECT sealed FROM settings WHERE id='club-target'",
                )
                .toArray()[0]?.sealed ?? null,
          });
        if (url.pathname === "/skills")
          return apiJson({
            rows: sql
              .exec(
                "SELECT s.id,s.sealed,s.published,p.version AS poster_version FROM skills s LEFT JOIN skill_posters p ON p.id=s.id ORDER BY s.rowid DESC LIMIT 200",
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
        if (url.pathname === "/trophies") {
          const id = url.searchParams.get("id");
          if (!key(id)) throw Error();
          const result = this.state.storage.transactionSync(() => ({
            rows: sql
              .exec(
                "SELECT s.id,s.sealed,COUNT(a.member_key) AS unlock_count FROM stickers s LEFT JOIN awards a ON a.sticker_id=s.id GROUP BY s.id ORDER BY s.id LIMIT 100",
              )
              .toArray(),
            awards: sql
              .exec(
                "SELECT sticker_id FROM awards WHERE member_key=? ORDER BY sticker_id",
                id,
              )
              .toArray(),
          }));
          return apiJson(result);
        }
        if (url.pathname === "/stickers")
          return apiJson({
            rows: sql
              .exec(
                "SELECT s.id,s.sealed,COUNT(a.member_key) AS unlock_count FROM stickers s LEFT JOIN awards a ON a.sticker_id=s.id GROUP BY s.id ORDER BY s.id LIMIT 100",
              )
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
      if (url.pathname === "/attendance") {
        if (
          !key(body.memberKey) ||
          typeof body.sealed !== "string" ||
          body.sealed.length > 100000 ||
          typeof body.updatedAt !== "string"
        )
          throw Error();
        sql.exec(
          "INSERT INTO attendance(member_key,sealed,updated_at) VALUES(?,?,?) ON CONFLICT(member_key) DO UPDATE SET sealed=excluded.sealed,updated_at=excluded.updated_at WHERE excluded.updated_at >= attendance.updated_at",
          body.memberKey,
          body.sealed,
          body.updatedAt,
        );
        return apiJson({ saved: true });
      }
      if (url.pathname === "/event-dismiss") {
        if (!key(body.memberKey) || !stickerId(body.eventId)) throw Error();
        if (
          !sql
            .exec("SELECT id FROM club_events WHERE id=?", body.eventId)
            .toArray().length
        )
          return apiJson({ error: "not_found" }, 404);
        sql.exec(
          "INSERT OR IGNORE INTO event_dismissals(member_key,event_id) VALUES(?,?)",
          body.memberKey,
          body.eventId,
        );
        return apiJson({ saved: true });
      }
      if (url.pathname === "/sticker-category") {
        if (
          !stickerId(body.id) ||
          typeof body.sealed !== "string" ||
          body.sealed.length > 8000
        )
          throw Error();
        if (
          !sql.exec("SELECT id FROM stickers WHERE id=?", body.id).toArray()
            .length
        )
          return apiJson({ error: "not_found" }, 404);
        sql.exec(
          "UPDATE stickers SET sealed=? WHERE id=?",
          body.sealed,
          body.id,
        );
        return apiJson({ saved: true });
      }
      if (url.pathname === "/event-response") {
        if (
          !key(body.memberKey) ||
          !stickerId(body.eventId) ||
          typeof body.sealed !== "string" ||
          body.sealed.length > 2000
        )
          throw Error();
        if (
          !sql
            .exec("SELECT id FROM club_events WHERE id=?", body.eventId)
            .toArray().length
        )
          return apiJson({ error: "not_found" }, 404);
        sql.exec(
          "INSERT INTO event_responses(member_key,event_id,sealed) VALUES(?,?,?) ON CONFLICT(member_key,event_id) DO UPDATE SET sealed=excluded.sealed",
          body.memberKey,
          body.eventId,
          body.sealed,
        );
        return apiJson({ saved: true });
      }
      if (url.pathname === "/member-target") {
        if (
          !key(body.memberKey) ||
          !(
            body.sealed === null ||
            (typeof body.sealed === "string" && body.sealed.length < 2000)
          )
        )
          throw Error();
        if (
          !sql
            .exec(
              "SELECT member_key FROM members WHERE member_key=?",
              body.memberKey,
            )
            .toArray().length
        )
          return apiJson({ error: "not_found" }, 404);
        if (body.sealed === null)
          sql.exec(
            "DELETE FROM member_targets WHERE member_key=?",
            body.memberKey,
          );
        else
          sql.exec(
            "INSERT INTO member_targets(member_key,sealed) VALUES(?,?) ON CONFLICT(member_key) DO UPDATE SET sealed=excluded.sealed",
            body.memberKey,
            body.sealed,
          );
        return apiJson({ saved: true });
      }
      if (url.pathname === "/club-target") {
        if (typeof body.sealed !== "string" || body.sealed.length > 2000)
          throw Error();
        sql.exec(
          "INSERT INTO settings(id,sealed) VALUES('club-target',?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed",
          body.sealed,
        );
        return apiJson({ saved: true });
      }
      if (
        url.pathname === "/club-event" ||
        url.pathname === "/club-event-remove"
      ) {
        if (!stickerId(body.id)) throw Error();
        if (url.pathname === "/club-event-remove")
          this.state.storage.transactionSync(() => {
            sql.exec("DELETE FROM club_events WHERE id=?", body.id);
            sql.exec("DELETE FROM event_responses WHERE event_id=?", body.id);
            sql.exec("DELETE FROM event_dismissals WHERE event_id=?", body.id);
          });
        else {
          if (typeof body.sealed !== "string" || body.sealed.length > 32000)
            throw Error();
          if (
            !sql
              .exec("SELECT id FROM club_events WHERE id=?", body.id)
              .toArray().length &&
            sql
              .exec<{ count: number }>(
                "SELECT count(*) AS count FROM club_events",
              )
              .one().count >= 500
          )
            return apiJson({ error: "calendar_full" }, 409);
          sql.exec(
            "INSERT INTO club_events(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed",
            body.id,
            body.sealed,
          );
        }
        return apiJson({ saved: true });
      }
      if (url.pathname === "/skill-poster") {
        if (
          !stickerId(body.id) ||
          !(typeof body.version === "string" || body.version === null)
        )
          throw Error();
        if (
          !sql.exec("SELECT id FROM skills WHERE id=?", body.id).toArray()
            .length
        )
          return apiJson({ error: "not_found" }, 404);
        if (body.version === null)
          sql.exec("DELETE FROM skill_posters WHERE id=?", body.id);
        else {
          if (body.version.length > 80) throw Error();
          sql.exec(
            "INSERT INTO skill_posters(id,version) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version",
            body.id,
            body.version,
          );
        }
        return apiJson({ saved: true });
      }
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
        } else
          this.state.storage.transactionSync(() => {
            sql.exec("DELETE FROM skills WHERE id=?", body.id);
            sql.exec("DELETE FROM skill_posters WHERE id=?", body.id);
          });
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
