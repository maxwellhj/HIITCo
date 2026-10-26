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
    await getJson("/api/gymmaster/profile", { member: true, id: 43 });
    const members = (await getJson("/api/control/members")).members,
      a = members.find((m) => m.memberId === 42),
      b = members.find((m) => m.memberId === 43);
    assert.equal(
      (await getJson("/api/gymmaster/club", { member: true, id: 42 }))
        .weeklyTarget,
      3,
    );
    await json("/api/control/member-goal", {
      memberKey: a.memberKey,
      weeklyTarget: 5,
    });
    assert.equal(
      (await getJson("/api/gymmaster/club", { member: true, id: 42 }))
        .weeklyTarget,
      5,
    );
    assert.equal(
      (await getJson("/api/gymmaster/club", { member: true, id: 43 }))
        .weeklyTarget,
      3,
    );
    let detail = await getJson("/api/control/member?id=" + a.memberKey);
    assert.equal(detail.weeklyTargetOverride, 5);
    assert.equal(detail.clubWeeklyTarget, 3);
    for (const weeklyTarget of [0, 8, 1.5, "5"])
      assert.equal(
        (
          await call("/api/control/member-goal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ memberKey: a.memberKey, weeklyTarget }),
          })
        ).status,
        400,
      );
    assert.equal(
      (
        await call("/api/control/member-goal", {
          method: "POST",
          ip: "198.51.100.1",
          member: true,
          id: 43,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberKey: a.memberKey, weeklyTarget: 7 }),
        })
      ).status,
      403,
    );
    assert.equal(
      (await call("/api/gymmaster/club?memberId=42", { member: true, id: 43 }))
        .status,
      400,
    );
    assert.equal(
      (
        await call("/api/control/member-goal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberKey: "0".repeat(64), weeklyTarget: 2 }),
        })
      ).status,
      404,
    );
    await json("/api/control/club/target", { weeklyTarget: 4 });
    assert.equal(
      (await getJson("/api/gymmaster/club", { member: true, id: 42 }))
        .weeklyTarget,
      5,
    );
    assert.equal(
      (await getJson("/api/gymmaster/club", { member: true, id: 43 }))
        .weeklyTarget,
      4,
    );
    await json("/api/control/member-goal", {
      memberKey: a.memberKey,
      weeklyTarget: null,
    });
    assert.equal(
      (await getJson("/api/gymmaster/club", { member: true, id: 42 }))
        .weeklyTarget,
      4,
    );
    await json("/api/control/member-goal", {
      memberKey: a.memberKey,
      weeklyTarget: 2,
    });
    await mf.dispose();
    mf = new Miniflare(options);
    assert.equal(
      (await getJson("/api/gymmaster/club", { member: true, id: 42 }))
        .weeklyTarget,
      2,
    );
    assert.equal(
      (await getJson("/api/gymmaster/club", { member: true, id: 43 }))
        .weeklyTarget,
      4,
    );
    detail = await getJson("/api/control/member?id=" + b.memberKey);
    assert.equal(detail.weeklyTargetOverride, null);
    assert.equal(detail.weeklyTarget, 4);
    console.log(
      "PASS individual member goals: own target, other-member isolation, restricted staff writes, validation, default inheritance/reset and persistence after restart.",
    );
  } finally {
    await mf.dispose();
    await rm(persistence, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
