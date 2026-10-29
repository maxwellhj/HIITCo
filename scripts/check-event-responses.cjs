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
  const event = {
    id: "club-event-1",
    title: "Club BBQ",
    description: "Train and catch up.",
    date: "2030-11-04",
    time: "18:30",
    bookingUrl: "https://example.com/book",
  };
  const rsvp = async (id, status, extra = {}) =>
    call("/api/gymmaster/event-response", {
      method: "POST",
      member: true,
      id,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event.id, status }),
      ...extra,
    });
  try {
    await getJson("/api/gymmaster/profile", { member: true, id: 42 });
    await getJson("/api/gymmaster/profile", { member: true, id: 43 });
    const a = (await getJson("/api/control/members")).members.find(
      (m) => m.memberId === 42,
    );
    await json("/api/control/club/events/save", event);
    await json("/api/control/club/events/save", {
      ...event,
      id: "club-event-2",
      title: "Open day",
    });
    assert.deepEqual(
      (await getJson("/api/gymmaster/club", { member: true, id: 42 }))
        .eventResponses,
      [],
    );
    assert.equal(
      (await getJson("/api/control/club")).eventResponses,
      undefined,
    );
    assert(
      (
        await getJson("/api/control/member?id=" + a.memberKey)
      ).eventResponses.every((e) => e.status === null),
    );
    const dismiss = (id, eventId = event.id, extra = {}) =>
      call("/api/gymmaster/event-dismiss", {
        method: "POST",
        member: true,
        id,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
        ...extra,
      });
    assert.equal((await dismiss(42)).status, 200);
    assert.equal((await dismiss(42)).status, 200);
    assert.deepEqual(
      (await getJson("/api/gymmaster/club", { member: true, id: 42 }))
        .dismissedEventIds,
      [event.id],
    );
    assert.deepEqual(
      (await getJson("/api/gymmaster/club", { member: true, id: 43 }))
        .dismissedEventIds,
      [],
    );
    assert.deepEqual(
      (await getJson("/api/gymmaster/club", { member: true, id: 42 }))
        .eventResponses,
      [],
      "dismissal never creates an RSVP",
    );
    assert.equal(
      (await getJson("/api/control/club")).dismissedEventIds,
      undefined,
    );
    assert.equal((await dismiss(42, event.id, { member: false })).status, 401);
    assert.equal(
      (await dismiss(42, event.id, { origin: "https://other.test" })).status,
      403,
    );
    assert.equal(
      (
        await dismiss(42, event.id, {
          body: JSON.stringify({ eventId: event.id, memberId: 43 }),
        })
      ).status,
      400,
    );
    assert.equal((await dismiss(42, "missing-event")).status, 404);
    assert.equal((await rsvp(42, "going")).status, 200);
    assert.equal((await rsvp(43, "maybe")).status, 200);
    assert.equal((await rsvp(42, "cant_attend")).status, 200);
    let own = await getJson("/api/gymmaster/club", { member: true, id: 42 });
    assert.equal(own.eventResponses.length, 1);
    assert.equal(own.eventResponses[0].status, "cant_attend");
    assert.equal(
      (await getJson("/api/gymmaster/club", { member: true, id: 43 }))
        .eventResponses[0].status,
      "maybe",
    );
    let detail = await getJson("/api/control/member?id=" + a.memberKey);
    assert.equal(
      detail.eventResponses.find((e) => e.eventId === event.id).status,
      "cant_attend",
    );
    assert.equal(
      detail.eventResponses.find((e) => e.eventId === "club-event-2").status,
      null,
    );
    assert.equal((await rsvp(42, "going", { member: false })).status, 401);
    assert.equal((await rsvp(42, "going", { expired: true })).status, 401);
    assert.equal(
      (await rsvp(42, "going", { origin: "https://other.test" })).status,
      403,
    );
    assert.equal((await rsvp(42, "something_else")).status, 400);
    assert.equal(
      (
        await rsvp(42, "going", {
          body: JSON.stringify({
            eventId: event.id,
            status: "going",
            memberId: 43,
          }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await rsvp(42, "going", {
          body: JSON.stringify({ eventId: "missing-event", status: "going" }),
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await call("/api/control/member?id=" + a.memberKey, {
          ip: "198.51.100.1",
          member: true,
          id: 43,
        })
      ).status,
      403,
    );
    await mf.dispose();
    mf = new Miniflare(options);
    own = await getJson("/api/gymmaster/club", { member: true, id: 42 });
    assert.equal(own.eventResponses[0].status, "cant_attend");
    assert.deepEqual(
      own.dismissedEventIds,
      [event.id],
      "dismissals survive store restart",
    );
    await json("/api/control/club/events/remove", { id: event.id });
    assert.deepEqual(
      (await getJson("/api/gymmaster/club", { member: true, id: 42 }))
        .eventResponses,
      [],
    );
    assert.equal(
      (await getJson("/api/control/member?id=" + a.memberKey)).eventResponses
        .length,
      1,
    );
    assert.deepEqual(
      (await getJson("/api/gymmaster/club", { member: true, id: 42 }))
        .dismissedEventIds,
      [],
      "deleting an event clears its dismissal",
    );
    assert.equal((await rsvp(42, "going")).status, 404);
    console.log(
      "PASS event responses: Going/Maybe/Can’t attend, member isolation, protected staff detail, no public response leak, changing choice without duplicates, validation, restart persistence and deleted-event cleanup.",
    );
  } finally {
    await mf.dispose();
    await rm(persistence, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
