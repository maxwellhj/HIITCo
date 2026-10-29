const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const { build } = require("esbuild");
const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
(async () => {
  const root = resolve(__dirname, "..");
  const { outputFiles } = await build({
    stdin: {
      contents: `import app,{ControlStore} from ${JSON.stringify(join(root, "worker/index.ts"))};export * from ${JSON.stringify(join(root, "worker/index.ts"))};const captures=[];globalThis.fetch=async(url,options)=>{const u=new URL(url);if(u.hostname==="fcm.googleapis.com"){const bytes=new Uint8Array(options.body);captures.push({url:u.href,headers:Object.fromEntries(new Headers(options.headers)),body:btoa(String.fromCharCode(...bytes))});return new Response(null,{status:u.pathname.includes("gone")?410:201});}if(u.pathname==="/portal/api/v1/member/profile"){const id=Number(u.searchParams.get("token").split("-").at(-1));return Response.json({result:{id,firstname:id===42?"Alex":"Jamie",surname:"Example",totalvisits:8},error:""});}throw Error("Unexpected fixture upstream");};export class PushTestStore extends ControlStore {async fetch(request){if(new URL(request.url).pathname==="/test-captures")return Response.json(captures);return super.fetch(request);}}export default {fetch(request,env){if(new URL(request.url).pathname==="/test-captures")return env.CONTROL_STORE.get(env.CONTROL_STORE.idFromName("hiitco-control-v1")).fetch(new Request("https://control.internal/test-captures"));return app.fetch(request,{...env,LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}});}};`,
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    target: "es2022",
  });
  const persistence = await mkdtemp(join(tmpdir(), "hiit-skills-"));
  const keyValue = "fake-skills-key-only-for-local-tests";
  const options = convertV4MiniflareOptions({
    workers: [
      {
        name: "skills-test",
        modules: true,
        script: outputFiles[0].text,
        compatibilityDate: "2026-10-20",
        bindings: {
          GYMMASTER_API_KEY: keyValue,
          CONTROL_ROOM_ALLOWED_IPS: "203.0.113.7",
        },
        durableObjects: {
          CONTROL_STORE: { className: "PushTestStore", useSQLite: true },
          MEMBER_TRAINING_LOGS: {
            className: "MemberTrainingStore",
            useSQLite: true,
          },
          SKILL_VIDEOS: { className: "SkillVideoStore", useSQLite: true },
        },
      },
    ],
    resourcePersistencePath: persistence,
    cf: false,
    telemetry: { enabled: false },
  });
  let mf = new Miniflare(options);
  async function cookie(expired = false, id = 42) {
    const key = await crypto.subtle.importKey(
      "raw",
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode("hiitco.gymmaster.cookie-key.v1:" + keyValue),
      ),
      "AES-GCM",
      false,
      ["encrypt"],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode("hiitco.gymmaster.session.v1"),
      },
      key,
      new TextEncoder().encode(
        JSON.stringify({
          token: "fake-member-" + id,
          memberId: id,
          expiresAt: Date.now() + (expired ? -1000 : 3600000),
        }),
      ),
    );
    return (
      "__Host-hiitco-gymmaster=" +
      Buffer.concat([Buffer.from(iv), Buffer.from(encrypted)]).toString(
        "base64url",
      )
    );
  }
  async function call(
    path,
    {
      method = "GET",
      body,
      member = false,
      id = 42,
      expired = false,
      ip = "203.0.113.7",
      origin = "https://example.test",
      headers = {},
    } = {},
  ) {
    return mf.dispatchFetch("https://example.test" + path, {
      method,
      headers: {
        Origin: origin,
        "CF-Connecting-IP": ip,
        ...(member ? { Cookie: await cookie(expired, id) } : {}),
        ...headers,
      },
      body,
    });
  }
  async function json(path, body) {
    const r = await call(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(r.status, 200, path + " " + (await r.clone().text()));
    return r.json();
  }
  async function getJson(path, options) {
    const response = await call(path, options);
    assert.equal(
      response.status,
      200,
      path + " " + (await response.clone().text()),
    );
    return response.json();
  }
  async function post(id, body, status = 200) {
    const r = await call("/api/gymmaster/connect", {
      member: true,
      id,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(r.status, status, await r.clone().text());
    return r;
  }
  const state = (id) => getJson("/api/gymmaster/connect", { member: true, id });
  const unread = (id) =>
    getJson("/api/gymmaster/connect?unread=1", { member: true, id });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function capturesAtLeast(count) {
    for (let i = 0; i < 60; i++) {
      const list = await getJson("/test-captures");
      if (list.length >= count) return list;
      await wait(100);
    }
    throw Error("Push alarm did not deliver in the test window");
  }
  try {
    for (const id of [42, 43, 44])
      await getJson("/api/gymmaster/profile", { member: true, id });
    const a = await state(42),
      b = await state(43);
    await post(43, { action: "privacy", public: true });
    await post(42, { action: "request", peer: b.me.id });
    await post(43, { action: "accept", peer: a.me.id });
    const config = await getJson("/api/gymmaster/connect?push=1", {
      member: true,
      id: 43,
    });
    assert.equal(Buffer.from(config.publicKey, "base64url").length, 65);
    assert.equal(config.privateKey, undefined);
    const pair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveBits"],
      ),
      raw = new Uint8Array(
        await crypto.subtle.exportKey("raw", pair.publicKey),
      ),
      auth = crypto.getRandomValues(new Uint8Array(16));
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/fixture-device",
      expirationTime: null,
      keys: {
        p256dh: Buffer.from(raw).toString("base64url"),
        auth: Buffer.from(auth).toString("base64url"),
      },
    };
    await post(
      43,
      {
        action: "push_subscribe",
        subscription: {
          ...subscription,
          endpoint: "https://example.com/private",
        },
      },
      400,
    );
    await post(
      43,
      {
        action: "push_subscribe",
        subscription: {
          ...subscription,
          endpoint: "https://fcm.googleapis.com@evil.test/path",
        },
      },
      400,
    );
    const saved = await post(43, { action: "push_subscribe", subscription });
    const device = saved.headers
      .get("set-cookie")
      .match(/__Host-hiitco-push-device=([^;]+)/)[1];
    const id = crypto.randomUUID();
    await post(42, {
      action: "send",
      peer: b.me.id,
      text: "PRIVATE TEXT MUST NOT REACH THE LOCK SCREEN",
      messageId: id,
    });
    const delivered = (await capturesAtLeast(1))[0];
    assert.equal(delivered.headers["content-encoding"], "aes128gcm");
    assert.equal(Buffer.from(delivered.body, "base64").length, 4096);
    const jwt = delivered.headers.authorization.match(/t=([^, ]+)/)[1],
      jwtParts = jwt.split(".");
    const signingKey = await crypto.subtle.importKey(
      "raw",
      Buffer.from(config.publicKey, "base64url"),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    assert(
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        signingKey,
        Buffer.from(jwtParts[2], "base64url"),
        Buffer.from(jwtParts[0] + "." + jwtParts[1]),
      ),
    );
    const encrypted = Buffer.from(delivered.body, "base64"),
      salt = encrypted.subarray(0, 16),
      serverRaw = encrypted.subarray(21, 21 + encrypted[20]);
    const serverKey = await crypto.subtle.importKey(
        "raw",
        serverRaw,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        [],
      ),
      shared = await crypto.subtle.deriveBits(
        { name: "ECDH", public: serverKey },
        pair.privateKey,
        256,
      );
    async function hkdf(ikm, salt, info, bits) {
      const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
        "deriveBits",
      ]);
      return crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt, info },
        key,
        bits,
      );
    }
    const ikm = await hkdf(
        shared,
        auth,
        Buffer.concat([Buffer.from("WebPush: info\0"), raw, serverRaw]),
        256,
      ),
      cek = await hkdf(
        ikm,
        salt,
        Buffer.from("Content-Encoding: aes128gcm\0"),
        128,
      ),
      nonce = await hkdf(
        ikm,
        salt,
        Buffer.from("Content-Encoding: nonce\0"),
        96,
      ),
      key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
        "decrypt",
      ]);
    const plaintext = Buffer.from(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce },
        key,
        encrypted.subarray(21 + encrypted[20]),
      ),
    );
    let end = plaintext.length - 1;
    while (plaintext[end] === 0) end--;
    assert.equal(plaintext[end], 2);
    const notification = JSON.parse(plaintext.subarray(0, end).toString());
    assert.equal(notification.body, "You have a new message in Connect.");
    assert(!JSON.stringify(notification).includes("PRIVATE TEXT"));
    assert.equal(notification.url, "/#connect");
    assert.equal((await unread(43)).count, 1);
    assert.equal((await unread(42)).count, 0);
    await post(42, {
      action: "send",
      peer: b.me.id,
      text: "PRIVATE TEXT MUST NOT REACH THE LOCK SCREEN",
      messageId: id,
    });
    const history = await getJson("/api/gymmaster/connect?peer=" + a.me.id, {
      member: true,
      id: 43,
    });
    await post(43, {
      action: "mark_read",
      peer: a.me.id,
      through: history.messages.at(-1).id,
    });
    assert.equal((await unread(43)).count, 0);
    await mf.dispose();
    mf = new Miniflare(options);
    assert.equal(
      (await getJson("/api/gymmaster/connect?push=1", { member: true, id: 43 }))
        .publicKey,
      config.publicKey,
      "VAPID keys persist across restarts",
    );
    // Transferring the same browser endpoint to another account stops delivery to its previous owner.
    await post(44, { action: "push_subscribe", subscription });
    await post(42, {
      action: "send",
      peer: b.me.id,
      text: "Second message",
      messageId: crypto.randomUUID(),
    });
    await wait(1800);
    assert.equal((await getJson("/test-captures")).length, 0);
    await post(43, { action: "push_subscribe", subscription });
    const logout = await call("/api/gymmaster/logout", {
      member: true,
      id: 43,
      method: "POST",
      headers: {
        Cookie:
          (await cookie(false, 43)) + "; __Host-hiitco-push-device=" + device,
      },
    });
    assert.equal(logout.status, 200);
    await post(42, {
      action: "send",
      peer: b.me.id,
      text: "After logout",
      messageId: crypto.randomUUID(),
    });
    await wait(1800);
    assert.equal(
      (await getJson("/test-captures")).length,
      0,
      "logout revokes only that device subscription",
    );
    // Group pushes reach joined participants, not pending invitees or the sender.
    const c = await state(44);
    await post(44, { action: "privacy", public: true });
    await post(42, { action: "request", peer: c.me.id });
    await post(44, { action: "accept", peer: a.me.id });
    const group = crypto.randomUUID();
    await post(42, {
      action: "create_group",
      group,
      groupName: "Crew",
      members: [b.me.id, c.me.id],
    });
    await post(43, { action: "push_subscribe", subscription });
    await post(44, {
      action: "push_subscribe",
      subscription: {
        ...subscription,
        endpoint: "https://fcm.googleapis.com/fcm/send/gone-device",
      },
    });
    await post(42, {
      action: "group_send",
      group,
      text: "Before anyone joins",
      messageId: crypto.randomUUID(),
    });
    await wait(1300);
    assert.equal((await getJson("/test-captures")).length, 0);
    await post(43, { action: "join_group", group });
    await post(44, { action: "join_group", group });
    await post(42, {
      action: "group_send",
      group,
      text: "Welcome",
      messageId: crypto.randomUUID(),
    });
    await capturesAtLeast(2);
    let groupHistory = await getJson("/api/gymmaster/connect?group=" + group, {
      member: true,
      id: 43,
    });
    await post(43, {
      action: "mark_read",
      group,
      through: groupHistory.messages.at(-1).id,
    });
    const baseline = (await getJson("/test-captures")).length;
    await post(42, {
      action: "group_send",
      group,
      text: "Seen immediately",
      messageId: crypto.randomUUID(),
    });
    groupHistory = await getJson("/api/gymmaster/connect?group=" + group, {
      member: true,
      id: 43,
    });
    await post(43, {
      action: "mark_read",
      group,
      through: groupHistory.messages.at(-1).id,
    });
    await wait(1500);
    assert.equal(
      (await getJson("/test-captures")).length,
      baseline,
      "already-read messages are skipped and expired 410 subscriptions are removed",
    );
    const handlers = {},
      shown = [],
      navigation = [];
    const client = {
      url: "https://example.test/#home",
      postMessage: (m) => assert.equal(m.type, "HIITCO_MESSAGE_PUSH"),
      navigate: async (url) => navigation.push(url),
      focus: async () => {},
    };
    const self = {
      addEventListener: (type, fn) => (handlers[type] = fn),
      location: { origin: "https://example.test" },
      clients: {
        matchAll: async () => [client],
        openWindow: async (url) => navigation.push(url),
      },
      registration: {
        showNotification: async (title, options) =>
          shown.push({ title, options }),
      },
    };
    const source = await require("node:fs/promises").readFile(
      join(root, "public/push-worker.js"),
      "utf8",
    );
    require("node:vm").runInNewContext(source, { self, URL });
    let completed;
    handlers.push({
      data: {
        json: () => ({
          body: "Never display attacker content",
          url: "https://evil.test",
        }),
      },
      waitUntil: (p) => (completed = p),
    });
    await completed;
    assert.equal(shown[0].options.body, "You have a new message in Connect.");
    handlers.notificationclick({
      notification: { close() {}, data: { url: "https://evil.test" } },
      waitUntil: (p) => (completed = p),
    });
    await completed;
    assert.equal(navigation[0], "https://example.test/#connect");
    let ready = false;
    handlers.message({
      data: { type: "HIITCO_PUSH_READY" },
      ports: [{ postMessage: (data) => (ready = data.ready) }],
    });
    assert.equal(ready, true);
    console.log(
      "PASS notification runtime: scoped unread/read cursors, real alarm delivery, RFC 8291 decryption, signed VAPID payload, generic lock-screen content, persisted keys, endpoint validation, account transfer and logout revocation.",
    );
  } finally {
    await mf.dispose();
    await rm(persistence, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
