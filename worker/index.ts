import { skillsApi, type SkillsEnv } from "./control/skillVideos";
export { SkillVideoStore } from "./control/videoStore";
import { controlApi, memberTrophies } from "./control/api";
import type { ControlEnv } from "./control/access";
export { ControlStore } from "./control/store";
import { gymMasterAuth, type AuthEnv } from "./gymmaster/auth";
import { gymMasterVisits } from "./gymmaster/visits";
import { gymMasterProfile } from "./gymmaster/profile";
import { gymMasterWebhook, type WebhookEnv } from "./gymmaster/webhook";
import { gymMasterCheckins } from "./gymmaster/checkins";
import { memberTraining, type TrainingEnv } from "./training";
export { MemberTrainingStore } from "./training";
import { memberWorkouts, type WorkoutEnv } from "./workouts";
export { GymMasterCheckinInbox } from "./gymmaster/webhookInbox";
export interface Env
  extends AuthEnv, WebhookEnv, TrainingEnv, WorkoutEnv, ControlEnv, SkillsEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

function json(
  data: Record<string, string>,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/api/health") {
      if (request.method !== "GET")
        return json({ error: "Method not allowed" }, 405, { Allow: "GET" });
      // Public liveness only. Never reveal secret values or credential status.
      return json({ status: "ok" });
    }
    const skillsResponse = await skillsApi(request, env);
    if (skillsResponse) return skillsResponse;
    const controlResponse = await controlApi(request, env);
    if (controlResponse) return controlResponse;
    const trophyResponse = await memberTrophies(request, env);
    if (trophyResponse) return trophyResponse;
    const webhookResponse = await gymMasterWebhook(request, env);
    if (webhookResponse) return webhookResponse;
    const authResponse = await gymMasterAuth(request, env);
    if (authResponse) return authResponse;
    const checkinResponse = await gymMasterCheckins(request, env);
    if (checkinResponse) return checkinResponse;
    const profileResponse = await gymMasterProfile(request, env);
    if (profileResponse) return profileResponse;
    const trainingResponse = await memberTraining(request, env);
    if (trainingResponse) return trainingResponse;
    const workoutResponse = await memberWorkouts(request, env);
    if (workoutResponse) return workoutResponse;
    const visitsResponse = await gymMasterVisits(request, env);
    if (visitsResponse) return visitsResponse;
    if (path === "/api/gymmaster" || path.startsWith("/api/gymmaster/")) {
      // Undocumented routes remain disabled; never expose an arbitrary provider proxy.
      return json(
        { error: "GymMaster integration is not connected yet." },
        501,
      );
    }
    if (path === "/api" || path.startsWith("/api/")) {
      return json({ error: "API route not found" }, 404);
    }
    return env.ASSETS.fetch(request);
  },
};
