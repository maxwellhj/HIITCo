const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const { build } = require("esbuild");
const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
(async () => {
  const root = resolve(__dirname, "..");
  const { outputFiles } = await build({
    entryPoints: [join(root, "worker/index.ts")],
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
        },
        durableObjects: {
          CONTROL_STORE: { className: "ControlStore", useSQLite: true },
          SKILL_VIDEOS: { className: "SkillVideoStore", useSQLite: true },
        },
      },
    ],
    resourcePersistencePath: persistence,
    cf: false,
    telemetry: { enabled: false },
  });
  let mf = new Miniflare(options);
  async function cookie(expired = false) {
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
          token: "fake-member-token",
          memberId: 42,
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
        ...(member ? { Cookie: await cookie(expired) } : {}),
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
    id: "club-social",
    title: "Club social",
    description: "Meet the crew.\nBring a friend.",
    date: "2026-12-05",
    time: "18:30",
    bookingUrl: "https://example.com/book",
  };
  try {
    assert.equal((await call("/api/gymmaster/club")).status, 401);
    assert.equal((await call("/api/control/members")).status, 403);
    assert.deepEqual(await getJson("/api/control/club"), {
      weeklyTarget: 3,
      events: [],
    });
    const invalid = await call("/api/control/club/target", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weeklyTarget: 8 }),
    });
    assert.equal(invalid.status, 400);
    const cross = await call("/api/control/club/target", {
      method: "POST",
      origin: "https://other.test",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weeklyTarget: 4 }),
    });
    assert.equal(cross.status, 403);
    await json("/api/control/club/target", { weeklyTarget: 4 });
    await json("/api/control/club/events/save", event);
    const live = await getJson("/api/gymmaster/club", { member: true });
    assert.equal(live.weeklyTarget, 4);
    assert.equal(live.events.length, 1);
    assert.equal(live.events[0].title, event.title);
    assert.equal(live.events[0].bookingUrl, event.bookingUrl);
    await json("/api/control/club/events/save", {
      ...event,
      title: "Updated social",
      time: "",
      bookingUrl: "",
    });
    assert.equal((await getJson("/api/control/club")).events.length, 1);
    const bad = await call("/api/control/club/events/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...event, bookingUrl: "javascript:alert(1)" }),
    });
    assert.equal(bad.status, 400);
    await json("/api/control/club/events/save", {
      ...event,
      id: "unicode-event",
      title: "語".repeat(120),
      description: "語".repeat(3000),
      bookingUrl: "https://example.com/" + "語".repeat(1980),
    });
    await json("/api/control/club/events/remove", { id: "unicode-event" });
    await mf.dispose();
    mf = new Miniflare(options);
    const restored = await getJson("/api/gymmaster/club", { member: true });
    assert.equal(restored.weeklyTarget, 4);
    assert.equal(restored.events[0].title, "Updated social");
    assert.equal(restored.events[0].time, "");
    await json("/api/control/club/events/remove", { id: event.id });
    assert.deepEqual(
      (await getJson("/api/gymmaster/club", { member: true })).events,
      [],
    );
    console.log(
      "PASS real club Worker/SQLite: default and saved targets, event create/edit/remove, optional time/link, safe URLs, cross-site and session protection, member-data isolation and restart persistence.",
    );
  } finally {
    await mf.dispose();
    await rm(persistence, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
