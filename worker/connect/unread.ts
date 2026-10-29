import { profileFields } from "./profileStore";
import { apiJson } from "../gymmaster/auth";
import type { ConnectSql } from "./store";
export type ThreadKind = "person" | "group";
export function initUnread(sql: ConnectSql) {
  sql.exec(
    "CREATE TABLE IF NOT EXISTS connect_reads (member_id TEXT NOT NULL,kind TEXT NOT NULL,thread TEXT NOT NULL,through_seq INTEGER NOT NULL,PRIMARY KEY(member_id,kind,thread))",
  );
}
export function threadAllowed(
  sql: ConnectSql,
  actor: string,
  kind: ThreadKind,
  thread: string,
) {
  if (kind === "group")
    return !!sql
      .exec(
        "SELECT group_id FROM connect_group_members WHERE group_id=? AND member_id=? AND status='active'",
        thread,
        actor,
      )
      .toArray().length;
  const [a, b] = [actor, thread].sort();
  return (
    !!sql
      .exec(
        "SELECT a FROM connect_edges WHERE a=? AND b=? AND status='accepted'",
        a,
        b,
      )
      .toArray().length &&
    !sql
      .exec(
        "SELECT owner FROM connect_blocks WHERE (owner=? AND peer=?) OR (owner=? AND peer=?)",
        actor,
        thread,
        thread,
        actor,
      )
      .toArray().length
  );
}
export function unreadCount(
  sql: ConnectSql,
  actor: string,
  kind: ThreadKind,
  thread: string,
) {
  if (!threadAllowed(sql, actor, kind, thread)) return 0;
  const read =
    sql
      .exec(
        "SELECT through_seq FROM connect_reads WHERE member_id=? AND kind=? AND thread=?",
        actor,
        kind,
        thread,
      )
      .toArray()[0]?.through_seq ?? 0;
  if (kind === "group")
    return Number(
      sql
        .exec(
          "SELECT COUNT(*) AS total FROM connect_group_messages WHERE group_id=? AND sender!=? AND seq>?",
          thread,
          actor,
          read,
        )
        .toArray()[0]?.total ?? 0,
    );
  const [a, b] = [actor, thread].sort();
  return Number(
    sql
      .exec(
        "SELECT COUNT(*) AS total FROM connect_messages WHERE a=? AND b=? AND sender!=? AND seq>?",
        a,
        b,
        actor,
        read,
      )
      .toArray()[0]?.total ?? 0,
  );
}
export function unreadSummary(sql: ConnectSql, actor: string) {
  const peers = sql
    .exec<{ id: string; name: string }>(
      "SELECT p.id,p.name FROM connect_edges e JOIN connect_profiles p ON p.id=CASE WHEN e.a=? THEN e.b ELSE e.a END WHERE (e.a=? OR e.b=?) AND e.status='accepted'",
      actor,
      actor,
      actor,
    )
    .toArray();
  const groups = sql
    .exec<{ id: string; name: string }>(
      "SELECT g.id,g.name FROM connect_groups g JOIN connect_group_members m ON m.group_id=g.id WHERE m.member_id=? AND m.status='active'",
      actor,
    )
    .toArray();
  const threads = [
    ...peers.map((p) => ({
      ...p,
      kind: "person" as const,
      count: unreadCount(sql, actor, "person", p.id),
    })),
    ...groups.map((g) => ({
      ...g,
      kind: "group" as const,
      count: unreadCount(sql, actor, "group", g.id),
    })),
  ].filter((t) => t.count > 0);
  return {
    count: threads.reduce((n, t) => n + t.count, 0),
    threads: threads.map((t) => ({
      ...t,
      ...(t.kind === "person" ? profileFields(sql, t.id) : {}),
    })),
  };
}
export function markRead(
  sql: ConnectSql,
  actor: string,
  kind: ThreadKind,
  thread: string,
  through: unknown,
) {
  if (!Number.isSafeInteger(through) || Number(through) < 0)
    return apiJson({ error: "invalid_request" }, 400);
  if (!threadAllowed(sql, actor, kind, thread))
    return apiJson({ error: "not_available" }, 404);
  const [a, b] = [actor, thread].sort();
  const last = Number(
    kind === "group"
      ? (sql
          .exec(
            "SELECT MAX(seq) AS seq FROM connect_group_messages WHERE group_id=?",
            thread,
          )
          .toArray()[0]?.seq ?? 0)
      : (sql
          .exec(
            "SELECT MAX(seq) AS seq FROM connect_messages WHERE a=? AND b=?",
            a,
            b,
          )
          .toArray()[0]?.seq ?? 0),
  );
  if (Number(through) > last) return apiJson({ error: "invalid_request" }, 400);
  sql.exec(
    "INSERT INTO connect_reads(member_id,kind,thread,through_seq) VALUES(?,?,?,?) ON CONFLICT(member_id,kind,thread) DO UPDATE SET through_seq=MAX(through_seq,excluded.through_seq)",
    actor,
    kind,
    thread,
    through,
  );
  return apiJson({ saved: true });
}
