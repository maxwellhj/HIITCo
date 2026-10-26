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
          CONTROL_ROOM_ALLOWED_IPS: "203.0.113.7",
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
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 37);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  bytes.write("ftyp", 4);
  const params =
    "?" +
    new URLSearchParams({
      title: "Back squat technique",
      category: "Lift",
      description: "Brace before you squat.",
    });
  const upload = (body = bytes, options = {}) =>
    call("/api/control/skills/upload" + params, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "video/mp4",
        "X-Video-Size": String(bytes.length),
      },
      ...options,
    });
  const getJson = async (path, options) => {
    const r = await call(path, options);
    assert.equal(r.status, 200, path);
    return r.json();
  };
  try {
    assert.equal(
      (await call("/api/control/skills", { ip: "198.51.100.1", member: true }))
        .status,
      403,
    );
    assert.equal((await call("/api/gymmaster/skills")).status, 401);
    assert.equal(
      (await call("/api/gymmaster/skills", { member: true, expired: true }))
        .status,
      401,
    );
    assert.equal(
      (await upload(bytes, { origin: "https://other.test" })).status,
      403,
    );
    assert.equal(
      (await upload(Buffer.from("<html>bad file</html>"))).status,
      400,
    );
    assert.equal(
      (
        await upload(bytes, {
          headers: {
            "Content-Type": "video/mp4",
            "X-Video-Size": String(51 * 1024 * 1024),
          },
        })
      ).status,
      400,
    );
    assert.deepEqual((await getJson("/api/control/skills")).videos, []);
    const uploaded = await upload();
    assert.equal(uploaded.status, 200, await uploaded.clone().text());
    const { id } = await uploaded.json();
    const preview = "/api/control/skills/video/" + id,
      media = "/api/gymmaster/skills/video/" + id;
    const draft = (await getJson("/api/control/skills")).videos[0];
    assert.equal(draft.title, "Back squat technique");
    assert.equal(draft.category, "Lift");
    assert.equal(draft.published, false);
    assert.deepEqual(
      (await getJson("/api/gymmaster/skills", { member: true })).videos,
      [],
    );
    assert.equal((await call(media, { member: true })).status, 404);
    assert.equal(
      (await call(preview, { ip: "198.51.100.1", member: true })).status,
      403,
    );
    assert.deepEqual(
      Buffer.from(await (await call(preview)).arrayBuffer()),
      bytes,
    );
    await json("/api/control/skills/publish", { id, published: true });
    const library = (await getJson("/api/gymmaster/skills", { member: true }))
      .videos;
    assert.equal(library.length, 1);
    assert.equal(library[0].videoUrl, media);
    assert.equal((await call(media)).status, 401);
    const full = await call(media, { member: true });
    assert.equal(full.headers.get("Content-Type"), "video/mp4");
    assert.equal(full.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
    for (const [range, start, end] of [
      ["bytes=0-15", 0, 15],
      ["bytes=1048570-1048590", 1048570, 1048590],
      ["bytes=-23", bytes.length - 23, bytes.length - 1],
      ["bytes=2097152-", 2097152, bytes.length - 1],
    ]) {
      const r = await call(media, { member: true, headers: { Range: range } });
      assert.equal(r.status, 206);
      assert.equal(
        r.headers.get("Content-Range"),
        `bytes ${start}-${end}/${bytes.length}`,
      );
      assert.deepEqual(
        Buffer.from(await r.arrayBuffer()),
        bytes.subarray(start, end + 1),
      );
    }
    for (const range of [
      "bytes=9-2",
      "bytes=0-1,5-6",
      "bytes=-0",
      `bytes=${bytes.length}-`,
    ])
      assert.equal(
        (await call(media, { member: true, headers: { Range: range } })).status,
        416,
      );
    const head = await call(media, { method: "HEAD", member: true });
    assert.equal(head.headers.get("Content-Length"), String(bytes.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    await mf.dispose();
    mf = new Miniflare(options);
    assert.equal(
      (await getJson("/api/gymmaster/skills", { member: true })).videos.length,
      1,
    );
    assert.deepEqual(
      Buffer.from(
        await (
          await call(media, { member: true, headers: { Range: "bytes=0-15" } })
        ).arrayBuffer(),
      ),
      bytes.subarray(0, 16),
    );
    await json("/api/control/skills/publish", { id, published: false });
    assert.equal((await call(media, { member: true })).status, 404);
    await json("/api/control/skills/remove", { id });
    assert.deepEqual((await getJson("/api/control/skills")).videos, []);
    assert.equal((await call(preview)).status, 404);
    console.log(
      "PASS Skills Library Worker/SQLite: upload validation, network/session isolation, drafts/publishing/unpublishing/removal, chunked media bytes, seeking/ranges/HEAD, and persistence across restarts.",
    );
  } finally {
    await mf.dispose();
    await rm(persistence, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
