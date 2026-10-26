import { controlData, type ControlDataEnv } from "./data";
import { openTraining } from "../training";
export async function weeklyGoal(env: ControlDataEnv, memberKey: string) {
  const stored = await controlData(env, "/member-target?id=" + memberKey);
  const club = stored.clubTarget
    ? await openTraining(
        stored.clubTarget,
        env.GYMMASTER_API_KEY!,
        "control.club-target",
      )
    : null;
  const individual = stored.sealed
    ? await openTraining(
        stored.sealed,
        env.GYMMASTER_API_KEY!,
        "control.member-target:" + memberKey,
      )
    : null;
  const clubWeeklyTarget = club?.weeklyTarget ?? 3,
    weeklyTargetOverride = individual?.weeklyTarget ?? null;
  for (const target of [
    clubWeeklyTarget,
    ...(weeklyTargetOverride === null ? [] : [weeklyTargetOverride]),
  ])
    if (!Number.isInteger(target) || target < 1 || target > 7)
      throw Error("Invalid weekly goal");
  return {
    clubWeeklyTarget,
    weeklyTargetOverride,
    weeklyTarget: weeklyTargetOverride ?? clubWeeklyTarget,
  };
}
