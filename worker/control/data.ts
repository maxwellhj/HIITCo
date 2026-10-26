import type { ControlNamespace } from "./types";
import {
  openTraining,
  sealTraining,
  trainingMemberKey,
  type TrainingEnv,
} from "../training";
import type { GymMasterMemberProfile } from "../../src/domain/gymmasterProfile";
import type { AppMember } from "../../src/domain/control";
export interface ControlDataEnv extends TrainingEnv {
  CONTROL_STORE?: ControlNamespace;
}
export async function controlData(
  env: ControlDataEnv,
  path: string,
  body?: unknown,
): Promise<Record<string, any>> {
  if (!env.CONTROL_STORE) throw Error("Control storage unavailable");
  const response = await env.CONTROL_STORE.get(
    env.CONTROL_STORE.idFromName("hiitco-control-v1"),
  ).fetch(
    new Request("https://control.internal" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  if (!response.ok) throw Error("Control storage failed");
  return response.json();
}
export async function registerAppMember(
  env: ControlDataEnv,
  memberId: number,
  profile: GymMasterMemberProfile,
) {
  if (!env.CONTROL_STORE || !env.GYMMASTER_API_KEY) return;
  const memberKey = await trainingMemberKey(memberId, env.GYMMASTER_API_KEY);
  const value: AppMember = {
    memberKey,
    memberId,
    ...profile,
    lastSeen: new Date().toISOString(),
  };
  const sealed = await sealTraining(
    value,
    env.GYMMASTER_API_KEY,
    "control.directory:" + memberKey,
  );
  await controlData(env, "/register", { memberKey, sealed });
}
export async function listAppMembers(env: ControlDataEnv, after = "") {
  const result = await controlData(env, "/members?after=" + after);
  const members = await Promise.all(
    result.rows.map(
      async (r: { member_key: string; sealed: string }) =>
        openTraining(
          r.sealed,
          env.GYMMASTER_API_KEY!,
          "control.directory:" + r.member_key,
        ) as Promise<AppMember>,
    ),
  );
  return { members, next: result.next };
}
export async function getAppMember(
  env: ControlDataEnv,
  memberKey: string,
): Promise<AppMember | null> {
  const result = await controlData(env, "/member?id=" + memberKey);
  if (!result.rows.length) return null;
  return openTraining(
    result.rows[0].sealed,
    env.GYMMASTER_API_KEY!,
    "control.directory:" + memberKey,
  );
}
export async function getRecord(
  env: ControlDataEnv,
  memberKey: string,
  kind: "training" | "chow",
) {
  if (!env.MEMBER_TRAINING_LOGS) throw Error();
  const response = await env.MEMBER_TRAINING_LOGS.get(
    env.MEMBER_TRAINING_LOGS.idFromName(memberKey),
  ).fetch(
    new Request(
      "https://training.internal/" + (kind === "training" ? "log" : "chow"),
    ),
  );
  if (!response.ok) throw Error();
  const result = (await response.json()) as {
    sealed: string | null;
    revision: number;
  };
  return result.sealed
    ? openTraining(
        result.sealed,
        env.GYMMASTER_API_KEY!,
        kind === "chow" ? memberKey + ":chow-v1" : memberKey,
      )
    : null;
}
