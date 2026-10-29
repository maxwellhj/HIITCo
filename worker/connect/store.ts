import { initProfiles, profileFields, profileStore } from "./profileStore";
import {
  initGroups,
  listGroups,
  groupStore,
  leaveSharedGroups,
} from "./groups";
import { apiJson, limitedText } from "../gymmaster/auth";
export interface ConnectSql {
  exec<T = Record<string, unknown>>(
    query: string,
    ...args: unknown[]
  ): { toArray(): T[] };
}
export function initConnect(sql: ConnectSql) {
  initGroups(sql);
  initProfiles(sql);
  for (const query of [
    "CREATE TABLE IF NOT EXISTS connect_profiles (id TEXT PRIMARY KEY,name TEXT NOT NULL,public INTEGER NOT NULL DEFAULT 0)",
    "CREATE TABLE IF NOT EXISTS connect_edges (a TEXT NOT NULL,b TEXT NOT NULL,sender TEXT NOT NULL,status TEXT NOT NULL,PRIMARY KEY(a,b))",
    "CREATE TABLE IF NOT EXISTS connect_blocks (owner TEXT NOT NULL,peer TEXT NOT NULL,PRIMARY KEY(owner,peer))",
    "CREATE TABLE IF NOT EXISTS connect_messages (seq INTEGER PRIMARY KEY AUTOINCREMENT,a TEXT NOT NULL,b TEXT NOT NULL,sender TEXT NOT NULL,sealed TEXT NOT NULL,created_at TEXT NOT NULL,message_id TEXT NOT NULL,UNIQUE(sender,message_id))",
    "CREATE INDEX IF NOT EXISTS connect_message_pair ON connect_messages(a,b,seq)",
    "CREATE TABLE IF NOT EXISTS connect_limits (id TEXT PRIMARY KEY,bucket INTEGER NOT NULL,count INTEGER NOT NULL)",
  ])
    sql.exec(query);
}
const validId = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export async function connectStore(request: Request, sql: ConnectSql) {
  if (request.method !== "POST")
    return apiJson({ error: "method_not_allowed" }, 405);
  const body = JSON.parse(await limitedText(request.body, 650000));
  const { actor, action, peer } = body;
  if (
    !validId(actor) ||
    ![
      "create_group",
      "join_group",
      "decline_group",
      "leave_group",
      "close_group",
      "group_messages",
      "group_send",
      "profile_get",
      "profile_save",
      "photo",
      "state",
      "privacy",
      "request",
      "accept",
      "decline",
      "cancel",
      "disconnect",
      "block",
      "unblock",
      "messages",
      "send",
    ].includes(action)
  )
    return apiJson({ error: "invalid_request" }, 400);
  const bucket = Math.floor(Date.now() / 60000),
    scope =
      action === "state" ||
      action === "messages" ||
      action === "group_messages" ||
      action === "profile_get" ||
      action === "photo"
        ? "read"
        : action === "request" || action === "create_group"
          ? "request"
          : "write",
    limit = scope === "read" ? 90 : scope === "request" ? 5 : 30;
  const rateId = actor + ":" + scope;
  sql.exec(
    "INSERT INTO connect_limits(id,bucket,count) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN bucket=excluded.bucket THEN count+1 ELSE 1 END,bucket=excluded.bucket",
    rateId,
    bucket,
  );
  if (
    Number(
      sql
        .exec("SELECT count FROM connect_limits WHERE id=?", rateId)
        .toArray()[0]?.count,
    ) > limit
  )
    return apiJson({ error: "too_many_attempts" }, 429);
  if (typeof body.name !== "string" || body.name.length > 4000)
    return apiJson({ error: "invalid_request" }, 400);
  sql.exec(
    "INSERT INTO connect_profiles(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name",
    actor,
    body.name,
  );
  if (["profile_get", "profile_save", "photo"].includes(action))
    return profileStore(body, sql);
  if (
    [
      "create_group",
      "join_group",
      "decline_group",
      "leave_group",
      "close_group",
      "group_messages",
      "group_send",
    ].includes(action)
  )
    return groupStore(body, sql);
  if (action === "privacy") {
    if (typeof body.public !== "boolean")
      return apiJson({ error: "invalid_request" }, 400);
    sql.exec(
      "UPDATE connect_profiles SET public=? WHERE id=?",
      body.public ? 1 : 0,
      actor,
    );
    return apiJson({ saved: true });
  }
  if (action === "state") {
    const me = sql
      .exec("SELECT public FROM connect_profiles WHERE id=?", actor)
      .toArray()[0];
    const people = sql
      .exec(
        "SELECT p.id,p.name FROM connect_profiles p WHERE p.public=1 AND p.id!=? AND NOT EXISTS(SELECT 1 FROM connect_blocks WHERE (owner=? AND peer=p.id) OR (peer=? AND owner=p.id)) ORDER BY p.id LIMIT 1000",
        actor,
        actor,
        actor,
      )
      .toArray();
    const edges = sql
      .exec(
        "SELECT p.id,p.name,e.sender,e.status FROM connect_edges e JOIN connect_profiles p ON p.id=CASE WHEN e.a=? THEN e.b ELSE e.a END WHERE e.a=? OR e.b=? ORDER BY p.id LIMIT 1000",
        actor,
        actor,
        actor,
      )
      .toArray();
    const blocked = sql
      .exec(
        "SELECT p.id,p.name FROM connect_blocks b JOIN connect_profiles p ON p.id=b.peer WHERE b.owner=? ORDER BY p.id LIMIT 1000",
        actor,
      )
      .toArray();
    const groups = listGroups(sql, actor);
    const decorate = (p: Record<string, any>) => ({
      ...p,
      ...profileFields(sql, String(p.id)),
    });
    return apiJson({
      me: { id: actor, public: me.public === 1 },
      people: people.map(decorate),
      edges: edges.map(decorate),
      blocked: blocked.map(decorate),
      groups: groups.map((g) => ({ ...g, members: g.members.map(decorate) })),
    });
  }
  if (!validId(peer) || peer === actor)
    return apiJson({ error: "invalid_request" }, 400);
  const [a, b] = [actor, peer].sort();
  const blocked =
    sql
      .exec(
        "SELECT owner FROM connect_blocks WHERE (owner=? AND peer=?) OR (owner=? AND peer=?)",
        actor,
        peer,
        peer,
        actor,
      )
      .toArray().length > 0;
  const edge = sql
    .exec<{ sender: string; status: string }>(
      "SELECT sender,status FROM connect_edges WHERE a=? AND b=?",
      a,
      b,
    )
    .toArray()[0];
  const remove = () => {
    sql.exec("DELETE FROM connect_edges WHERE a=? AND b=?", a, b);
    sql.exec("DELETE FROM connect_messages WHERE a=? AND b=?", a, b);
  };
  if (action === "block") {
    if (
      !sql.exec("SELECT id FROM connect_profiles WHERE id=?", peer).toArray()
        .length
    )
      return apiJson({ error: "not_available" }, 404);
    // Only allow blocking people the actor could already see or interact with.
    if (
      !edge &&
      !sql
        .exec(
          "SELECT a.group_id FROM connect_group_members a JOIN connect_group_members b ON a.group_id=b.group_id WHERE a.member_id=? AND b.member_id=? AND a.status='active' AND b.status='active'",
          actor,
          peer,
        )
        .toArray().length &&
      !sql
        .exec("SELECT id FROM connect_profiles WHERE id=? AND public=1", peer)
        .toArray().length
    )
      return apiJson({ error: "not_available" }, 404);
    sql.exec(
      "INSERT OR IGNORE INTO connect_blocks(owner,peer) VALUES(?,?)",
      actor,
      peer,
    );
    remove();
    leaveSharedGroups(sql, actor, peer);
    return apiJson({ saved: true });
  }
  if (action === "unblock") {
    sql.exec(
      "DELETE FROM connect_blocks WHERE owner=? AND peer=?",
      actor,
      peer,
    );
    return apiJson({ saved: true });
  }
  if (blocked) return apiJson({ error: "not_available" }, 404);
  if (action === "request") {
    if (
      !sql
        .exec("SELECT id FROM connect_profiles WHERE id=? AND public=1", peer)
        .toArray().length
    )
      return apiJson({ error: "not_available" }, 404);
    if (!edge)
      sql.exec(
        "INSERT INTO connect_edges(a,b,sender,status) VALUES(?,?,?,'pending')",
        a,
        b,
        actor,
      );
    return apiJson({ saved: true });
  }
  if (!edge) return apiJson({ error: "connection_required" }, 403);
  if (action === "accept") {
    if (edge.status !== "pending" || edge.sender === actor)
      return apiJson({ error: "invalid_request" }, 409);
    sql.exec(
      "UPDATE connect_edges SET status='accepted' WHERE a=? AND b=?",
      a,
      b,
    );
    return apiJson({ saved: true });
  }
  if (action === "decline" || action === "cancel" || action === "disconnect") {
    if (
      (action === "decline" &&
        (edge.status !== "pending" || edge.sender === actor)) ||
      (action === "cancel" &&
        (edge.status !== "pending" || edge.sender !== actor)) ||
      (action === "disconnect" && edge.status !== "accepted")
    )
      return apiJson({ error: "invalid_request" }, 409);
    remove();
    return apiJson({ saved: true });
  }
  if (edge.status !== "accepted")
    return apiJson({ error: "connection_required" }, 403);
  if (action === "send") {
    if (
      typeof body.sealed !== "string" ||
      body.sealed.length > 16000 ||
      typeof body.createdAt !== "string"
    )
      return apiJson({ error: "invalid_request" }, 400);
    // A client-generated ID makes retries idempotent without allowing overwrites.
    if (
      typeof body.messageId !== "string" ||
      !/^[a-f0-9-]{36}$/.test(body.messageId)
    )
      return apiJson({ error: "invalid_request" }, 400);
    sql.exec(
      "INSERT INTO connect_messages(a,b,sender,sealed,created_at,message_id) VALUES(?,?,?,?,?,?) ON CONFLICT(sender,message_id) DO NOTHING",
      a,
      b,
      actor,
      body.sealed,
      body.createdAt,
      body.messageId,
    );
    sql.exec("DELETE FROM connect_limits WHERE bucket<?", bucket - 1440);
    return apiJson({ saved: true });
  }
  const before = body.before ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(before) || before <= 0)
    return apiJson({ error: "invalid_request" }, 400);
  const rows = sql
    .exec(
      "SELECT seq,sender,sealed,created_at FROM connect_messages WHERE a=? AND b=? AND seq<? ORDER BY seq DESC LIMIT 51",
      a,
      b,
      before,
    )
    .toArray();
  return apiJson({
    messages: rows.slice(0, 50).reverse(),
    hasMore: rows.length > 50,
  });
}
