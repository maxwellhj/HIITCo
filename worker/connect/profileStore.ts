import { apiJson } from "../gymmaster/auth";
import type { ConnectSql } from "./store";
export function initProfiles(sql: ConnectSql) {
  sql.exec(
    "CREATE TABLE IF NOT EXISTS connect_custom_profiles (id TEXT PRIMARY KEY,display TEXT,photo TEXT,version TEXT)",
  );
}
export function profileFields(sql: ConnectSql, id: string, own = false) {
  const row = sql
    .exec<{ display: string | null; version: string | null; public: number }>(
      "SELECT c.display,c.version,p.public FROM connect_profiles p LEFT JOIN connect_custom_profiles c ON c.id=p.id WHERE p.id=?",
      id,
    )
    .toArray()[0];
  return {
    display: row?.display ?? null,
    photoVersion: own || row?.public === 1 ? (row?.version ?? null) : null,
  };
}
export function profileStore(
  body: Record<string, any>,
  sql: ConnectSql,
): Response {
  const { actor, action } = body;
  if (action === "profile_get")
    return apiJson({
      me: {
        id: actor,
        ...profileFields(sql, actor, true),
        public:
          sql
            .exec("SELECT public FROM connect_profiles WHERE id=?", actor)
            .toArray()[0]?.public === 1,
      },
    });
  if (action === "profile_save") {
    if (
      body.display !== null &&
      (typeof body.display !== "string" || body.display.length > 4000)
    )
      return apiJson({ error: "invalid_request" }, 400);
    if (
      body.photo !== undefined &&
      body.photo !== null &&
      (typeof body.photo !== "string" ||
        body.photo.length > 500000 ||
        typeof body.version !== "string" ||
        body.version.length > 40)
    )
      return apiJson({ error: "invalid_request" }, 400);
    sql.exec(
      "INSERT INTO connect_custom_profiles(id,display) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET display=excluded.display",
      actor,
      body.display,
    );
    if (body.photo !== undefined)
      sql.exec(
        "UPDATE connect_custom_profiles SET photo=?,version=? WHERE id=?",
        body.photo,
        body.photo === null ? null : body.version,
        actor,
      );
    return apiJson({ saved: true });
  }
  const peer = body.peer;
  if (typeof peer !== "string" || !/^[a-f0-9]{64}$/.test(peer))
    return apiJson({ error: "invalid_request" }, 400);
  if (actor !== peer) {
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
    if (
      blocked ||
      sql
        .exec("SELECT public FROM connect_profiles WHERE id=?", peer)
        .toArray()[0]?.public !== 1
    )
      return apiJson({ error: "not_available" }, 404);
  }
  const row = sql
    .exec<{ photo: string }>(
      "SELECT photo FROM connect_custom_profiles WHERE id=?",
      peer,
    )
    .toArray()[0];
  return row?.photo
    ? apiJson({ photo: row.photo })
    : apiJson({ error: "not_available" }, 404);
}
