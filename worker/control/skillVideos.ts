import { apiJson } from "../gymmaster/auth";
import { readSession } from "../gymmaster/session";
import { sealTraining, openTraining } from "../training";
import { controlAllowed, type ControlEnv } from "./access";
import { controlData } from "./data";
import type { SkillVideo } from "../../src/data/skills";
import type { ControlNamespace } from "./types";
export interface SkillsEnv extends ControlEnv {
  SKILL_VIDEOS?: ControlNamespace;
}
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const validId = (id: string) => /^[a-f0-9-]{36}$/.test(id);
async function catalog(
  env: SkillsEnv,
): Promise<(SkillVideo & { published: boolean })[]> {
  const result = await controlData(env, "/skills");
  return Promise.all(
    result.rows.map(
      async (r: { id: string; sealed: string; published: number }) => ({
        ...(await openTraining(
          r.sealed,
          env.GYMMASTER_API_KEY!,
          "control.skill:" + r.id,
        )),
        id: r.id,
        published: r.published === 1,
        videoUrl: "/api/gymmaster/skills/video/" + r.id,
      }),
    ),
  );
}
function videoStore(env: SkillsEnv, id: string) {
  if (!env.SKILL_VIDEOS) throw Error();
  return env.SKILL_VIDEOS.get(env.SKILL_VIDEOS.idFromName(id));
}
export async function skillsApi(
  request: Request,
  env: SkillsEnv,
): Promise<Response | null> {
  const url = new URL(request.url),
    path = url.pathname;
  const admin =
    path === "/api/control/skills" || path.startsWith("/api/control/skills/");
  const member =
    path === "/api/gymmaster/skills" ||
    path.startsWith("/api/gymmaster/skills/");
  if (!admin && !member) return null;
  if (admin && !controlAllowed(request, env))
    return apiJson({ error: "control_access_restricted" }, 403);
  if (!admin && !(await readSession(request, env.GYMMASTER_API_KEY)))
    return apiJson({ error: "session_expired" }, 401);
  if (
    request.headers.get("Sec-Fetch-Site") === "cross-site" ||
    (!["GET", "HEAD"].includes(request.method) &&
      request.headers.get("Origin") !== url.origin)
  )
    return apiJson({ error: "request_not_allowed" }, 403);
  if (!env.CONTROL_STORE || !env.SKILL_VIDEOS || !env.GYMMASTER_API_KEY)
    return apiJson({ error: "skills_unavailable" }, 503);
  try {
    if (
      admin &&
      env.CONTROL_RATE_LIMITER &&
      !(
        await env.CONTROL_RATE_LIMITER.limit({
          key: "skills:" + request.headers.get("CF-Connecting-IP"),
        })
      ).success
    )
      return apiJson({ error: "too_many_attempts" }, 429);
    const prefix = admin ? "/api/control/skills" : "/api/gymmaster/skills";
    if (path === prefix && request.method === "GET") {
      const videos = await catalog(env);
      return apiJson({
        videos: admin
          ? videos
          : videos
              .filter((v) => v.published)
              .map(({ published: _, ...v }) => v),
      });
    }
    if (
      path.startsWith(prefix + "/video/") &&
      ["GET", "HEAD"].includes(request.method)
    ) {
      const id = path.slice((prefix + "/video/").length);
      if (
        !validId(id) ||
        !(await catalog(env)).some((v) => v.id === id && (admin || v.published))
      )
        return apiJson({ error: "not_found" }, 404);
      return await videoStore(env, id).fetch(
        new Request("https://video.internal/video", {
          method: request.method,
          headers: request.headers.has("Range")
            ? { Range: request.headers.get("Range")! }
            : {},
        }),
      );
    }
    if (!admin || request.method !== "POST")
      return apiJson({ error: "method_not_allowed" }, 405);
    if (path === prefix + "/upload") {
      const title = url.searchParams.get("title")?.trim() ?? "",
        description = url.searchParams.get("description")?.trim() ?? "",
        category = url.searchParams.get("category"),
        mime = request.headers.get("Content-Type"),
        size = Number(request.headers.get("X-Video-Size"));
      if (
        !title ||
        title.length > 100 ||
        description.length > 500 ||
        !["Box", "Lift", "Sweat"].includes(category ?? "") ||
        !["video/mp4", "video/webm"].includes(mime ?? "") ||
        !Number.isSafeInteger(size) ||
        size < 16 ||
        size > MAX_VIDEO_BYTES ||
        !request.body
      )
        return apiJson({ error: "invalid_video" }, 400);
      if ((await catalog(env)).length >= 200)
        return apiJson({ error: "library_full" }, 409);
      const id = crypto.randomUUID(),
        store = videoStore(env, id);
      const uploaded = await store.fetch(
        new Request("https://video.internal/upload", {
          method: "POST",
          headers: { "Content-Type": mime!, "X-Video-Size": String(size) },
          body: request.body,
        }),
      );
      if (!uploaded.ok) return apiJson({ error: "invalid_video" }, 400);
      try {
        const sealed = await sealTraining(
          {
            title,
            description,
            category,
            size,
            createdAt: new Date().toISOString(),
          },
          env.GYMMASTER_API_KEY,
          "control.skill:" + id,
        );
        await controlData(env, "/skill", { id, sealed, published: false });
      } catch (error) {
        await store.fetch(
          new Request("https://video.internal/delete", { method: "POST" }),
        );
        throw error;
      }
      return apiJson({ saved: true, id });
    }
    if (path === prefix + "/publish" || path === prefix + "/remove") {
      if (request.headers.get("Content-Type") !== "application/json")
        return apiJson({ error: "invalid_request" }, 400);
      const { limitedText } = await import("../gymmaster/auth");
      const body = JSON.parse(await limitedText(request.body, 2000));
      if (typeof body.id !== "string" || !validId(body.id))
        return apiJson({ error: "invalid_request" }, 400);
      if (!(await catalog(env)).some((v) => v.id === body.id))
        return apiJson({ error: "not_found" }, 404);
      if (path.endsWith("/publish")) {
        if (typeof body.published !== "boolean")
          return apiJson({ error: "invalid_request" }, 400);
        await controlData(env, "/skill-publish", {
          id: body.id,
          published: body.published,
        });
      } else {
        await controlData(env, "/skill-remove", { id: body.id });
        const removed = await videoStore(env, body.id).fetch(
          new Request("https://video.internal/delete", { method: "POST" }),
        );
        if (!removed.ok) throw Error();
      }
      return apiJson({ saved: true });
    }
    return apiJson({ error: "not_found" }, 404);
  } catch {
    return apiJson({ error: "skills_unavailable" }, 503);
  }
}
