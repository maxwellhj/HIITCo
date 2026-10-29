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
      contents: `import app from ${JSON.stringify(join(root, "worker/index.ts"))};export * from ${JSON.stringify(join(root, "worker/index.ts"))};globalThis.fetch=async(url)=>{const u=new URL(url);if(u.pathname==="/portal/api/v1/member/profile"){const id=Number(u.searchParams.get("token").split("-").at(-1));return Response.json({result:{id,firstname:id===42?"Alex":"Jamie",surname:"Example",totalvisits:8},error:""});}throw Error("Unexpected test upstream");};export default {fetch(request,env){return app.fetch(request,{...env,LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}})}};`,
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
    await getJson("/api/gymmaster/profile", { member: true, id: 42 });
    const member = (await getJson("/api/control/members")).members[0];
    const image =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVxkAAAAASUVORK5CYII=";
    await json("/api/control/stickers", {
      id: "mile",
      name: "100 Club",
      description: "Milestone",
      mime: "image/png",
      image,
    });
    await json("/api/control/stickers", {
      id: "event",
      name: "Club event",
      description: "Event",
      category: "events",
      mime: "image/png",
      image,
    });
    await json("/api/control/awards", {
      memberKey: member.memberKey,
      stickerId: "mile",
      unlocked: true,
      requestId: crypto.randomUUID(),
    });
    const before = await getJson("/api/gymmaster/trophies", {
      member: true,
      id: 42,
    });
    assert.equal(
      before.stickers.find((s) => s.id === "mile").category,
      "milestones",
    );
    assert.equal(
      before.stickers.find((s) => s.id === "event").category,
      "events",
    );
    assert.equal(before.stickers.find((s) => s.id === "mile").unlockCount, 1);
    assert.equal(before.stickers.find((s) => s.id === "event").unlockCount, 0);
    await getJson("/api/gymmaster/profile", { member: true, id: 43 });
    await getJson("/api/gymmaster/profile", { member: true, id: 44 });
    const second = (await getJson("/api/control/members")).members.find(
      (m) => m.memberId === 43,
    );
    const award = async (memberKey, unlocked) =>
      json("/api/control/awards", {
        memberKey,
        stickerId: "mile",
        unlocked,
        requestId: crypto.randomUUID(),
      });
    await award(second.memberKey, true);
    await award(second.memberKey, true);
    const aggregate = await getJson("/api/gymmaster/trophies", {
      member: true,
      id: 44,
    });
    assert.equal(
      aggregate.stickers.find((s) => s.id === "mile").unlockCount,
      2,
      "repeat grants count each recipient once",
    );
    assert.deepEqual(aggregate.earnedStickerIds, []);
    assert.equal(
      JSON.stringify(aggregate).includes(second.memberKey),
      false,
      "aggregate count exposes no recipient identities",
    );
    const art = await call("/api/gymmaster/trophy-art/mile", {
      member: true,
      id: 42,
    });
    const bytes = Buffer.from(await art.arrayBuffer());
    await json("/api/control/stickers/category", {
      id: "mile",
      category: "events",
    });
    const after = await getJson("/api/gymmaster/trophies", {
      member: true,
      id: 42,
    });
    assert.equal(
      after.stickers.find((s) => s.id === "mile").category,
      "events",
    );
    assert.equal(
      after.stickers.find((s) => s.id === "mile").createdAt,
      before.stickers.find((s) => s.id === "mile").createdAt,
    );
    assert.deepEqual(after.earnedStickerIds, before.earnedStickerIds);
    assert.deepEqual(
      Buffer.from(
        await (
          await call("/api/gymmaster/trophy-art/mile", { member: true, id: 42 })
        ).arrayBuffer(),
      ),
      bytes,
    );
    const update = (body, extra = {}) =>
      call("/api/control/stickers/category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        ...extra,
      });
    assert.equal((await update({ id: "mile", category: "other" })).status, 400);
    assert.equal(
      (await update({ id: "missing", category: "events" })).status,
      404,
    );
    assert.equal(
      (
        await update(
          { id: "mile", category: "milestones" },
          { ip: "198.51.100.1", member: true, id: 42 },
        )
      ).status,
      403,
    );
    await award(second.memberKey, false);
    assert.equal(
      (
        await getJson("/api/gymmaster/trophies", { member: true, id: 42 })
      ).stickers.find((s) => s.id === "mile").unlockCount,
      1,
    );
    await award(second.memberKey, true);
    await award(member.memberKey, false);
    const locked = await getJson("/api/gymmaster/trophies", {
      member: true,
      id: 42,
    });
    assert.equal(locked.stickers.find((s) => s.id === "mile").unlockCount, 1);
    assert.deepEqual(locked.earnedStickerIds, []);
    await award(second.memberKey, false);
    assert.equal(
      (
        await getJson("/api/gymmaster/trophies", { member: true, id: 42 })
      ).stickers.find((s) => s.id === "mile").unlockCount,
      0,
    );
    await mf.dispose();
    mf = new Miniflare(options);
    assert.equal(
      (
        await getJson("/api/gymmaster/trophies", { member: true, id: 42 })
      ).stickers.find((s) => s.id === "mile").category,
      "events",
    );
    console.log(
      "PASS stickers: categories, artwork/award preservation, distinct-recipient counts, repeated grants, revocation, zero counts, recipient privacy, access checks and persistence.",
    );
  } finally {
    await mf.dispose();
    await rm(persistence, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
