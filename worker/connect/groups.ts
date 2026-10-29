import { queuePush } from "./push";
import { profileFields } from "./profileStore";
import { apiJson } from "../gymmaster/auth";
import type { ConnectSql } from "./store";
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const memberId = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export function initGroups(sql: ConnectSql) {
  for (const query of [
    "CREATE TABLE IF NOT EXISTS connect_groups (id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS connect_group_members (group_id TEXT NOT NULL,member_id TEXT NOT NULL,status TEXT NOT NULL,PRIMARY KEY(group_id,member_id))",
    "CREATE INDEX IF NOT EXISTS connect_group_member_lookup ON connect_group_members(member_id,group_id)",
    "CREATE TABLE IF NOT EXISTS connect_group_messages (seq INTEGER PRIMARY KEY AUTOINCREMENT,group_id TEXT NOT NULL,sender TEXT NOT NULL,sealed TEXT NOT NULL,created_at TEXT NOT NULL,message_id TEXT NOT NULL,UNIQUE(sender,message_id))",
    "CREATE INDEX IF NOT EXISTS connect_group_message_lookup ON connect_group_messages(group_id,seq)",
  ])
    sql.exec(query);
}
export function closeGroup(sql: ConnectSql, id: string) {
  sql.exec("DELETE FROM connect_group_messages WHERE group_id=?", id);
  sql.exec("DELETE FROM connect_group_members WHERE group_id=?", id);
  sql.exec("DELETE FROM connect_groups WHERE id=?", id);
}
export function leaveSharedGroups(
  sql: ConnectSql,
  actor: string,
  peer: string,
) {
  const shared = sql
    .exec<{ id: string; owner: string }>(
      "SELECT g.id,g.owner FROM connect_groups g JOIN connect_group_members a ON a.group_id=g.id AND a.member_id=? JOIN connect_group_members b ON b.group_id=g.id AND b.member_id=?",
      actor,
      peer,
    )
    .toArray();
  for (const g of shared) {
    if (g.owner === actor) closeGroup(sql, g.id);
    else
      sql.exec(
        "DELETE FROM connect_group_members WHERE group_id=? AND member_id=?",
        g.id,
        actor,
      );
  }
}
export function listGroups(sql: ConnectSql, actor: string) {
  return sql
    .exec<{ id: string; name: string; owner: string; status: string }>(
      "SELECT g.id,g.name,g.owner,m.status FROM connect_groups g JOIN connect_group_members m ON m.group_id=g.id WHERE m.member_id=? ORDER BY g.rowid DESC LIMIT 50",
      actor,
    )
    .toArray()
    .map((g) => ({
      ...g,
      members: sql
        .exec(
          "SELECT p.id,p.name FROM connect_group_members m JOIN connect_profiles p ON p.id=m.member_id WHERE m.group_id=? AND m.status='active' ORDER BY p.id",
          g.id,
        )
        .toArray(),
    }));
}
function countGroups(sql: ConnectSql, id: string) {
  return Number(
    sql
      .exec(
        "SELECT COUNT(*) AS total FROM connect_group_members WHERE member_id=?",
        id,
      )
      .toArray()[0]?.total ?? 0,
  );
}
export function groupStore(
  body: Record<string, any>,
  sql: ConnectSql,
): Response {
  const { actor, action, group } = body;
  if (!uuid(group)) return apiJson({ error: "invalid_request" }, 400);
  if (action === "create_group") {
    if (
      typeof body.groupName !== "string" ||
      body.groupName.length > 4000 ||
      !Array.isArray(body.members) ||
      body.members.length < 2 ||
      body.members.length > 19 ||
      new Set(body.members).size !== body.members.length ||
      body.members.some((id: unknown) => !memberId(id) || id === actor)
    )
      return apiJson({ error: "invalid_request" }, 400);
    const existing = sql
      .exec("SELECT owner FROM connect_groups WHERE id=?", group)
      .toArray()[0];
    if (existing)
      return existing.owner === actor
        ? apiJson({ saved: true, id: group })
        : apiJson({ error: "not_available" }, 404);
    const all = [actor, ...body.members] as string[];
    for (const id of all) {
      if (countGroups(sql, id) >= 50)
        return apiJson({ error: "group_limit" }, 409);
      if (id !== actor) {
        const [a, b] = [actor, id].sort();
        if (
          !sql
            .exec(
              "SELECT a FROM connect_edges WHERE a=? AND b=? AND status='accepted'",
              a,
              b,
            )
            .toArray().length
        )
          return apiJson({ error: "connection_required" }, 403);
      }
      for (const other of all)
        if (
          other !== id &&
          sql
            .exec(
              "SELECT owner FROM connect_blocks WHERE owner=? AND peer=?",
              id,
              other,
            )
            .toArray().length
        )
          return apiJson({ error: "group_not_available" }, 409);
    }
    sql.exec(
      "INSERT INTO connect_groups(id,owner,name) VALUES(?,?,?)",
      group,
      actor,
      body.groupName,
    );
    for (const id of all)
      sql.exec(
        "INSERT INTO connect_group_members(group_id,member_id,status) VALUES(?,?,?)",
        group,
        id,
        id === actor ? "active" : "invited",
      );
    return apiJson({ saved: true, id: group });
  }
  const g = sql
    .exec<{ owner: string; status: string }>(
      "SELECT g.owner,m.status FROM connect_groups g JOIN connect_group_members m ON m.group_id=g.id WHERE g.id=? AND m.member_id=?",
      group,
      actor,
    )
    .toArray()[0];
  if (!g) return apiJson({ error: "not_available" }, 404);
  if (action === "join_group") {
    if (g.status !== "invited")
      return apiJson({ error: "invalid_request" }, 409);
    // Recheck the invitation if connections or blocks changed after it was sent.
    const [a, b] = [actor, g.owner].sort();
    if (
      !sql
        .exec(
          "SELECT a FROM connect_edges WHERE a=? AND b=? AND status='accepted'",
          a,
          b,
        )
        .toArray().length
    )
      return apiJson({ error: "connection_required" }, 403);
    if (
      sql
        .exec(
          "SELECT b.owner FROM connect_blocks b JOIN connect_group_members m ON m.member_id=CASE WHEN b.owner=? THEN b.peer ELSE b.owner END WHERE m.group_id=? AND (b.owner=? OR b.peer=?)",
          actor,
          group,
          actor,
          actor,
        )
        .toArray().length
    )
      return apiJson({ error: "group_not_available" }, 409);
    sql.exec(
      "UPDATE connect_group_members SET status='active' WHERE group_id=? AND member_id=?",
      group,
      actor,
    );
    return apiJson({ saved: true });
  }
  if (action === "decline_group" || action === "leave_group") {
    if (
      g.owner === actor ||
      (action === "decline_group" && g.status !== "invited") ||
      (action === "leave_group" && g.status !== "active")
    )
      return apiJson({ error: "invalid_request" }, 409);
    sql.exec(
      "DELETE FROM connect_group_members WHERE group_id=? AND member_id=?",
      group,
      actor,
    );
    return apiJson({ saved: true });
  }
  if (action === "close_group") {
    if (g.owner !== actor) return apiJson({ error: "not_allowed" }, 403);
    closeGroup(sql, group);
    return apiJson({ saved: true });
  }
  if (g.status !== "active")
    return apiJson({ error: "group_invitation_pending" }, 403);
  if (action === "group_send") {
    if (
      typeof body.sealed !== "string" ||
      body.sealed.length > 16000 ||
      typeof body.createdAt !== "string" ||
      !uuid(body.messageId)
    )
      return apiJson({ error: "invalid_request" }, 400);
    const inserted = sql
      .exec<{ seq: number }>(
        "INSERT INTO connect_group_messages(group_id,sender,sealed,created_at,message_id) VALUES(?,?,?,?,?) ON CONFLICT(sender,message_id) DO NOTHING RETURNING seq",
        group,
        actor,
        body.sealed,
        body.createdAt,
        body.messageId,
      )
      .toArray()[0];
    if (inserted)
      for (const recipient of sql
        .exec<{ member_id: string }>(
          "SELECT member_id FROM connect_group_members WHERE group_id=? AND status='active' AND member_id!=?",
          group,
          actor,
        )
        .toArray())
        queuePush(sql, recipient.member_id, "group", group, inserted.seq);
    return apiJson({ saved: true });
  }
  const before = body.before ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(before) || before <= 0)
    return apiJson({ error: "invalid_request" }, 400);
  const rows = sql
    .exec(
      "SELECT m.seq,m.sender,m.sealed,m.created_at,p.name FROM connect_group_messages m JOIN connect_profiles p ON p.id=m.sender WHERE m.group_id=? AND m.seq<? ORDER BY m.seq DESC LIMIT 51",
      group,
      before,
    )
    .toArray();
  return apiJson({
    messages: rows
      .slice(0, 50)
      .reverse()
      .map((m) => ({ ...m, ...profileFields(sql, String(m.sender)) })),
    hasMore: rows.length > 50,
  });
}
