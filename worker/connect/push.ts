import { buildPushPayload, type VapidKeys } from "@block65/webcrypto-web-push";
import { apiJson } from "../gymmaster/auth";
import { openTraining, sealTraining } from "../training";
import { unreadCount, type ThreadKind } from "./unread";
import type { ConnectSql } from "./store";
export interface BrowserSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}
const base64url = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
export function initPush(sql: ConnectSql) {
  sql.exec(
    "CREATE TABLE IF NOT EXISTS connect_push_settings (id TEXT PRIMARY KEY,sealed TEXT NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS connect_push_subscriptions (id TEXT PRIMARY KEY,member_id TEXT NOT NULL,sealed TEXT NOT NULL,updated_at INTEGER NOT NULL)",
  );
  sql.exec(
    "CREATE INDEX IF NOT EXISTS connect_push_member ON connect_push_subscriptions(member_id)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS connect_push_outbox (member_id TEXT NOT NULL,kind TEXT NOT NULL,thread TEXT NOT NULL,seq INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL,PRIMARY KEY(member_id,kind,thread))",
  );
}
export function validSubscription(
  value: unknown,
): value is BrowserSubscription {
  if (!value || typeof value !== "object") return false;
  const s = value as BrowserSubscription;
  if (
    typeof s.endpoint !== "string" ||
    s.endpoint.length > 4096 ||
    !s.keys ||
    typeof s.keys.p256dh !== "string" ||
    typeof s.keys.auth !== "string"
  )
    return false;
  try {
    const u = new URL(s.endpoint),
      host = u.hostname;
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      u.hash ||
      !(
        host === "fcm.googleapis.com" ||
        host === "web.push.apple.com" ||
        /^[a-z0-9-]+\.push\.services\.mozilla\.com$/.test(host) ||
        /^[a-z0-9-]+\.notify\.windows\.com$/.test(host)
      )
    )
      return false;
    if (
      !/^[A-Za-z0-9_-]{87}=?$/.test(s.keys.p256dh) ||
      !/^[A-Za-z0-9_-]{22}(==)?$/.test(s.keys.auth)
    )
      return false;
    return (
      atob(s.keys.p256dh.replace(/-/g, "+").replace(/_/g, "/"))[0].charCodeAt(
        0,
      ) === 4
    );
  } catch {
    return false;
  }
}
export async function subscriptionId(endpoint: string) {
  return base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)),
    ),
  );
}
async function vapidKeys(sql: ConnectSql, secret: string): Promise<VapidKeys> {
  let stored = sql
    .exec<{ sealed: string }>(
      "SELECT sealed FROM connect_push_settings WHERE id='vapid'",
    )
    .toArray()[0]?.sealed;
  if (!stored) {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const raw = new Uint8Array(
      await crypto.subtle.exportKey("raw", pair.publicKey),
    );
    const sealed = await sealTraining(
      {
        subject: "https://hiitco.maxwellhj.workers.dev",
        publicKey: base64url(raw),
        privateKey: jwk.d!,
      },
      secret,
      "connect.push.vapid.v1",
    );
    sql.exec(
      "INSERT OR IGNORE INTO connect_push_settings(id,sealed) VALUES('vapid',?)",
      sealed,
    );
    stored = sql
      .exec<{ sealed: string }>(
        "SELECT sealed FROM connect_push_settings WHERE id='vapid'",
      )
      .toArray()[0].sealed;
  }
  return openTraining(stored, secret, "connect.push.vapid.v1");
}
export async function pushStore(
  body: Record<string, any>,
  sql: ConnectSql,
  secret?: string,
) {
  if (!secret) return apiJson({ error: "push_unavailable" }, 503);
  if (body.action === "push_config")
    return apiJson({ publicKey: (await vapidKeys(sql, secret)).publicKey });
  if (body.action === "push_unsubscribe") {
    if (typeof body.endpoint !== "string" || body.endpoint.length > 4096)
      return apiJson({ error: "invalid_request" }, 400);
    sql.exec(
      "DELETE FROM connect_push_subscriptions WHERE id=? AND member_id=?",
      await subscriptionId(body.endpoint),
      body.actor,
    );
    return apiJson({ saved: true });
  }
  if (!validSubscription(body.subscription))
    return apiJson({ error: "invalid_subscription" }, 400);
  const s = body.subscription;
  // Verify that the supplied subscriber key is on the expected curve before storing it.
  try {
    await crypto.subtle.importKey(
      "raw",
      Uint8Array.from(
        atob(s.keys.p256dh.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      ),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
  } catch {
    return apiJson({ error: "invalid_subscription" }, 400);
  }
  await vapidKeys(sql, secret);
  const id = await subscriptionId(s.endpoint);
  const sealed = await sealTraining(
    { endpoint: s.endpoint, expirationTime: null, keys: s.keys },
    secret,
    "connect.push.subscription:" + id,
  );
  sql.exec(
    "INSERT INTO connect_push_subscriptions(id,member_id,sealed,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET member_id=excluded.member_id,sealed=excluded.sealed,updated_at=excluded.updated_at",
    id,
    body.actor,
    sealed,
    Date.now(),
  );
  sql.exec(
    "DELETE FROM connect_push_subscriptions WHERE member_id=? AND id NOT IN(SELECT id FROM connect_push_subscriptions WHERE member_id=? ORDER BY updated_at DESC LIMIT 5)",
    body.actor,
    body.actor,
  );
  return apiJson({ saved: true, deviceId: id });
}
export function queuePush(
  sql: ConnectSql,
  member: string,
  kind: ThreadKind,
  thread: string,
  seq: number,
) {
  sql.exec(
    "INSERT INTO connect_push_outbox(member_id,kind,thread,seq,attempts,next_at) VALUES(?,?,?,?,0,?) ON CONFLICT(member_id,kind,thread) DO UPDATE SET seq=MAX(seq,excluded.seq),attempts=0,next_at=excluded.next_at",
    member,
    kind,
    thread,
    seq,
    Date.now() + 1000,
  );
}
export function nextPushAlarm(sql: ConnectSql) {
  return (
    sql
      .exec<{ next: number | null }>(
        "SELECT MIN(next_at) AS next FROM connect_push_outbox",
      )
      .toArray()[0]?.next ?? null
  );
}
export async function deliverPush(sql: ConnectSql, secret: string) {
  const jobs = sql
    .exec<{
      member_id: string;
      kind: ThreadKind;
      thread: string;
      seq: number;
      attempts: number;
    }>(
      "SELECT * FROM connect_push_outbox WHERE next_at<=? ORDER BY next_at LIMIT 5",
      Date.now(),
    )
    .toArray();
  for (const job of jobs) {
    let retry = false;
    if (unreadCount(sql, job.member_id, job.kind, job.thread) > 0) {
      const subscriptions = sql
        .exec<{ id: string; sealed: string }>(
          "SELECT id,sealed FROM connect_push_subscriptions WHERE member_id=? LIMIT 5",
          job.member_id,
        )
        .toArray();
      for (const row of subscriptions) {
        try {
          const subscription = await openTraining(
            row.sealed,
            secret,
            "connect.push.subscription:" + row.id,
          );
          if (!validSubscription(subscription)) {
            sql.exec(
              "DELETE FROM connect_push_subscriptions WHERE id=? AND member_id=?",
              row.id,
              job.member_id,
            );
            continue;
          }
          const payload = await buildPushPayload(
            {
              data: JSON.stringify({
                title: "HIIT Co. Hub",
                body: "You have a new message in Connect.",
                url: "/#connect",
                tag: "hiitco-connect",
              }),
              options: { ttl: 3600 },
            },
            {
              ...subscription,
              expirationTime: subscription.expirationTime ?? null,
            },
            await vapidKeys(sql, secret),
          );
          // Account ownership and membership may have changed during encryption.
          if (
            !sql
              .exec(
                "SELECT id FROM connect_push_subscriptions WHERE id=? AND member_id=?",
                row.id,
                job.member_id,
              )
              .toArray().length ||
            unreadCount(sql, job.member_id, job.kind, job.thread) === 0
          )
            continue;
          const response = await fetch(subscription.endpoint, {
            ...payload,
            redirect: "manual",
            signal: AbortSignal.timeout(10000),
          });
          if (response.status === 404 || response.status === 410)
            sql.exec(
              "DELETE FROM connect_push_subscriptions WHERE id=? AND member_id=?",
              row.id,
              job.member_id,
            );
          else if (!response.ok) retry = true;
        } catch {
          retry = true;
        }
      }
    }
    if (retry && job.attempts < 4)
      sql.exec(
        "UPDATE connect_push_outbox SET attempts=attempts+1,next_at=? WHERE member_id=? AND kind=? AND thread=? AND seq=?",
        Date.now() + Math.min(3600000, 15000 * 2 ** job.attempts),
        job.member_id,
        job.kind,
        job.thread,
        job.seq,
      );
    else
      sql.exec(
        "DELETE FROM connect_push_outbox WHERE member_id=? AND kind=? AND thread=? AND seq=?",
        job.member_id,
        job.kind,
        job.thread,
        job.seq,
      );
  }
}
