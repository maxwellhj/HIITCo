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
      contents: `import app from ${JSON.stringify(join(root, "worker/index.ts"))};export * from ${JSON.stringify(join(root, "worker/index.ts"))};globalThis.fetch=async(url)=>{const u=new URL(url);if(u.pathname==="/portal/api/v1/member/profile"){const id=Number(u.searchParams.get("token").split("-").at(-1));return Response.json({result:{id,firstname:id===42?"Alex":"Jamie",surname:"Example",totalvisits:8},error:""});}if(u.pathname==="/portal/api/v2/member/visits/daily"){const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Pacific/Auckland",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); return Response.json({result:[{date:today,visits:2,watervisits:0,bookings:0}],error:""});}throw Error("Unexpected test upstream");};export default {fetch(request,env){return app.fetch(request,{...env,LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}})}};`,
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
          CONTROL_STORE: { className: "ControlStore", useSQLite: true },
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
  try {
    for (const id of [42, 43, 44])
      await getJson("/api/gymmaster/profile", { member: true, id });
    const state = (id) =>
      getJson("/api/gymmaster/connect", { member: true, id });
    const post = async (id, body, status = 200) => {
      const r = await call("/api/gymmaster/connect", {
        member: true,
        id,
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      assert.equal(r.status, status, await r.clone().text());
      return r.json();
    };
    const a = await state(42),
      b = await state(43),
      c = await state(44);
    assert.equal(a.me.public, false);
    assert.equal(b.me.public, false);
    assert.deepEqual(a.people, []);
    assert.deepEqual(a.edges, []);
    assert.equal((await call("/api/gymmaster/connect")).status, 401);
    assert.equal(
      (await call("/api/gymmaster/connect?actor=" + a.me.id, { member: true }))
        .status,
      400,
    );
    assert.equal(
      (
        await call("/api/gymmaster/connect", {
          member: true,
          headers: { "Sec-Fetch-Site": "cross-site" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/api/gymmaster/connect", {
          member: true,
          origin: "https://evil.test",
          method: "POST",
          body: JSON.stringify({ action: "privacy", public: true }),
          headers: { "Content-Type": "application/json" },
        })
      ).status,
      403,
    );
    await post(42, { action: "privacy", public: true, actor: b.me.id }, 400);
    await post(42, { action: "request", peer: b.me.id }, 404);
    await post(43, { action: "privacy", public: true });
    assert.equal((await state(42)).people[0].id, b.me.id);
    assert.equal(JSON.stringify(await state(42)).includes("memberId"), false);
    await post(42, { action: "request", peer: b.me.id });
    assert.equal((await state(43)).edges[0].incoming, true);
    const send = (
      id,
      peer,
      text = "Hello crew",
      messageId = crypto.randomUUID(),
    ) => post(id, { action: "send", peer, text, messageId });
    await post(
      42,
      {
        action: "send",
        peer: b.me.id,
        text: "too early",
        messageId: crypto.randomUUID(),
      },
      403,
    );
    await post(42, { action: "accept", peer: b.me.id }, 409);
    await post(43, { action: "accept", peer: a.me.id });
    await post(43, { action: "privacy", public: false });
    assert.equal((await state(44)).people.length, 0);
    const messageId = crypto.randomUUID();
    await send(42, b.me.id, "See you at training!", messageId);
    await send(42, b.me.id, "See you at training!", messageId);
    const messages = (id, peer) =>
      getJson("/api/gymmaster/connect?peer=" + peer, { member: true, id });
    let history = await messages(43, a.me.id);
    assert.equal(history.messages.length, 1);
    assert.equal(history.messages[0].text, "See you at training!");
    assert.equal(history.messages[0].mine, false);
    assert.equal((await messages(42, b.me.id)).messages[0].mine, true);
    assert.equal(
      (
        await call("/api/gymmaster/connect?peer=" + a.me.id, {
          member: true,
          id: 44,
        })
      ).status,
      403,
    );
    await post(
      43,
      {
        action: "send",
        peer: a.me.id,
        text: "x".repeat(2001),
        messageId: crypto.randomUUID(),
      },
      400,
    );
    await mf.dispose();
    mf = new Miniflare(options);
    assert.equal((await state(43)).me.public, false);
    assert.equal(
      (await messages(43, a.me.id)).messages[0].text,
      "See you at training!",
    );
    await post(43, { action: "block", peer: a.me.id });
    assert.equal((await state(42)).edges.length, 0);
    assert.equal((await state(43)).blocked[0].id, a.me.id);
    await post(
      42,
      {
        action: "send",
        peer: b.me.id,
        text: "blocked",
        messageId: crypto.randomUUID(),
      },
      404,
    );
    assert.equal(
      (
        await call("/api/gymmaster/connect?peer=" + b.me.id, {
          member: true,
          id: 42,
        })
      ).status,
      404,
    );
    await post(43, { action: "unblock", peer: a.me.id });
    await post(43, { action: "privacy", public: true });
    await post(42, { action: "request", peer: b.me.id });
    await post(43, { action: "decline", peer: a.me.id });
    assert.equal((await state(42)).edges.length, 0);
    await post(42, { action: "request", peer: b.me.id });
    await post(42, { action: "cancel", peer: b.me.id });
    assert.equal((await state(43)).edges.length, 0);
    await post(43, { action: "request", peer: b.me.id }, 400);
    await post(43, { action: "privacy", public: false });
    await post(44, { action: "request", peer: b.me.id }, 404);
    // Separate pair exercises long histories without exhausting a real member's write limit.
    for (const id of [45, 46, 47])
      await getJson("/api/gymmaster/profile", { member: true, id });
    const d = await state(45),
      e = await state(46);
    await post(46, { action: "privacy", public: true });
    await post(45, { action: "request", peer: e.me.id });
    await post(46, { action: "accept", peer: d.me.id });
    for (let i = 0; i < 26; i++) {
      await send(45, e.me.id, "A " + i);
      await send(46, d.me.id, "B " + i);
    }
    const recent = await messages(45, e.me.id);
    assert.equal(recent.messages.length, 50);
    assert.equal(recent.hasMore, true);
    const older = await getJson(
      "/api/gymmaster/connect?peer=" +
        e.me.id +
        "&before=" +
        recent.messages[0].id,
      { member: true, id: 45 },
    );
    assert.equal(older.messages.length, 2);
    assert.equal(older.hasMore, false);
    assert.ok(older.messages[1].id < recent.messages[0].id);
    assert.equal(
      (
        await call("/api/gymmaster/connect?peer=" + e.me.id + "&before=bad", {
          member: true,
          id: 45,
        })
      ).status,
      400,
    );
    for (let i = 0; i < 30; i++)
      await post(47, { action: "privacy", public: true });
    await post(47, { action: "privacy", public: false }, 429);
    for (const id of [101, 102, 103, 104])
      await getJson("/api/gymmaster/profile", { member: true, id });
    const owner = await state(101),
      guest = await state(102),
      guest2 = await state(103),
      outsider = await state(104);
    for (const [id, person] of [
      [102, guest],
      [103, guest2],
    ]) {
      await post(id, { action: "privacy", public: true });
      await post(101, { action: "request", peer: person.me.id });
      await post(id, { action: "accept", peer: owner.me.id });
      await post(id, { action: "privacy", public: false });
    }
    const create = (group, members = [guest.me.id, guest2.me.id]) =>
      post(101, {
        action: "create_group",
        group,
        groupName: "Morning crew",
        members,
      });
    await post(
      104,
      {
        action: "create_group",
        group: crypto.randomUUID(),
        groupName: "Invalid",
        members: [guest.me.id, owner.me.id],
      },
      403,
    );
    await post(
      104,
      {
        action: "create_group",
        group: crypto.randomUUID(),
        groupName: "Invalid",
        members: [guest.me.id, guest.me.id],
      },
      400,
    );
    await post(
      104,
      {
        action: "create_group",
        group: crypto.randomUUID(),
        groupName: "Invalid",
        members: [guest.me.id],
      },
      400,
    );
    const group = crypto.randomUUID();
    await create(group);
    await create(group);
    assert.equal((await state(101)).groups.length, 1);
    assert.equal((await state(102)).groups[0].status, "invited");
    assert.equal(
      (await state(102)).groups[0].members.length,
      1,
      "pending members are hidden until they join",
    );
    const groupHistory = async (id, status = 200) => {
      const r = await call("/api/gymmaster/connect?group=" + group, {
        member: true,
        id,
      });
      assert.equal(r.status, status, await r.clone().text());
      return r.json();
    };
    await groupHistory(102, 403);
    await groupHistory(104, 404);
    await post(
      102,
      {
        action: "group_send",
        group,
        text: "Not yet",
        messageId: crypto.randomUUID(),
      },
      403,
    );
    await post(102, { action: "close_group", group }, 403);
    await post(102, { action: "join_group", group });
    const groupMessageId = crypto.randomUUID();
    await post(101, {
      action: "group_send",
      group,
      text: "Crew session at six?",
      messageId: groupMessageId,
    });
    await post(101, {
      action: "group_send",
      group,
      text: "Crew session at six?",
      messageId: groupMessageId,
    });
    await post(102, {
      action: "group_send",
      group,
      text: "Count me in",
      messageId: crypto.randomUUID(),
    });
    let groupMessages = await groupHistory(102);
    assert.equal(groupMessages.messages.length, 2);
    assert.equal(groupMessages.messages[0].text, "Crew session at six?");
    assert.equal(groupMessages.messages[0].mine, false);
    assert.equal(groupMessages.messages[1].mine, true);
    assert.ok(groupMessages.messages[0].name);
    await post(103, { action: "join_group", group });
    assert.equal((await groupHistory(103)).messages.length, 2);
    await mf.dispose();
    mf = new Miniflare(options);
    assert.equal(
      (await groupHistory(103)).messages.length,
      2,
      "group messages persist after restart",
    );
    await post(103, { action: "block", peer: guest.me.id });
    assert.equal(
      (await state(103)).groups.length,
      0,
      "blocking a private group participant leaves the shared group",
    );
    await post(103, { action: "unblock", peer: guest.me.id });
    await post(102, { action: "leave_group", group });
    await groupHistory(102, 404);
    await post(
      102,
      {
        action: "group_send",
        group,
        text: "Left",
        messageId: crypto.randomUUID(),
      },
      404,
    );
    await post(101, { action: "close_group", group });
    assert.equal((await state(103)).groups.length, 0);
    await groupHistory(101, 404);
    const declined = crypto.randomUUID();
    await create(declined);
    await post(102, { action: "decline_group", group: declined });
    assert.equal((await state(102)).groups.length, 0);
    // Blocking another participant leaves shared groups and revokes access immediately.
    await post(103, { action: "join_group", group: declined });
    await post(103, { action: "block", peer: owner.me.id });
    assert.equal((await state(103)).groups.length, 0);
    assert.equal(
      (
        await call("/api/gymmaster/connect?group=" + declined, {
          member: true,
          id: 103,
        })
      ).status,
      404,
    );
    for (const id of [201, 202])
      await getJson("/api/gymmaster/profile", { member: true, id });
    const ownerProfile = () =>
      getJson("/api/gymmaster/connect?profile=me", { member: true, id: 201 });
    const initialProfile = await ownerProfile();
    assert.equal(initialProfile.displayName, "Jamie E.");
    assert.equal(initialProfile.customName, false);
    const avatar = {
      mime: "image/png",
      image:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVxkAAAAASUVORK5CYII=",
    };
    await post(201, {
      action: "profile_save",
      displayName: "Morning legend",
      photo: avatar,
    });
    const savedProfile = await ownerProfile();
    assert.equal(savedProfile.displayName, "Morning legend");
    assert.equal(savedProfile.public, false);
    assert.ok(savedProfile.photo);
    assert.equal(
      (await call(savedProfile.photo, { member: true, id: 201 })).status,
      200,
    );
    assert.equal(
      (await call(savedProfile.photo, { member: true, id: 202 })).status,
      404,
      "private photos are never served to other members",
    );
    assert.equal((await call(savedProfile.photo)).status, 401);
    await post(201, { action: "privacy", public: true });
    let publicPerson = (await state(202)).people.find(
      (p) => p.id === savedProfile.id,
    );
    assert.equal(publicPerson.name, "Morning legend");
    assert.ok(publicPerson.photo);
    const photoResponse = await call(savedProfile.photo, {
      member: true,
      id: 202,
    });
    assert.equal(photoResponse.status, 200);
    assert.ok(photoResponse.headers.get("Cache-Control").includes("no-store"));
    assert.equal(photoResponse.headers.get("Content-Type"), "image/png");
    await post(202, { action: "request", peer: savedProfile.id });
    const viewerId = (await state(202)).me.id;
    await post(201, { action: "accept", peer: viewerId });
    await post(201, { action: "privacy", public: false });
    const friendProfile = (await state(202)).edges.find(
      (p) => p.id === savedProfile.id,
    );
    assert.equal(friendProfile.name, "Morning legend");
    assert.equal(friendProfile.photo, null);
    assert.equal(
      (await call(savedProfile.photo, { member: true, id: 202 })).status,
      404,
      "even accepted connections cannot load a private photo using its old URL",
    );
    await mf.dispose();
    mf = new Miniflare(options);
    assert.equal((await ownerProfile()).displayName, "Morning legend");
    assert.ok((await ownerProfile()).photo);
    await post(201, { action: "profile_save", displayName: null });
    assert.equal((await ownerProfile()).displayName, "Jamie E.");
    assert.ok((await ownerProfile()).photo, "name reset preserves the photo");
    await post(201, { action: "privacy", public: true });
    assert.equal(
      (await state(202)).people.find((p) => p.id === savedProfile.id).name,
      "Jamie E.",
    );
    await post(202, { action: "block", peer: savedProfile.id });
    assert.equal(
      (await call(savedProfile.photo, { member: true, id: 202 })).status,
      404,
    );
    await post(
      201,
      { action: "profile_save", displayName: "", photo: null },
      400,
    );
    await post(
      201,
      { action: "profile_save", displayName: "x".repeat(41) },
      400,
    );
    await post(
      201,
      {
        action: "profile_save",
        displayName: "Name",
        photo: { mime: "image/svg+xml", image: avatar.image },
      },
      400,
    );
    await post(
      201,
      { action: "profile_save", displayName: null, actor: viewerId },
      400,
    );
    await post(201, { action: "profile_save", displayName: null, photo: null });
    assert.equal((await ownerProfile()).photo, null);
    assert.equal(
      (await call(savedProfile.photo, { member: true, id: 201 })).status,
      404,
    );
    console.log(
      "PASS Connect: private default, opt-in discovery, authenticated identity, CSRF, consent before messaging, scoped history, idempotent sends, persistence, block/unblock, decline, cancellation invite-only group chats and privacy-controlled photos/display names.",
    );
  } finally {
    await mf.dispose();
    await rm(persistence, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
