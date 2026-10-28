import { controlData, type ControlDataEnv } from "./data";
import { openTraining } from "../training";
import { readMemberCheckins } from "../gymmaster/checkins";
import type { WebhookEnv } from "../gymmaster/webhook";
import { dateKey, weekKey } from "../../src/domain/attendance";
import { trainingDays } from "../../src/domain/club";
import type { DailyVisits } from "../../src/domain/gymmasterVisits";
export async function controlAttendance(
  env: ControlDataEnv & WebhookEnv,
  memberKey: string,
  memberId: number,
) {
  const today = dateKey(new Date()),
    from = weekKey(today);
  const stored = await controlData(env, "/attendance?id=" + memberKey);
  const snapshot = stored.sealed
    ? ((await openTraining(
        stored.sealed,
        env.GYMMASTER_API_KEY!,
        "control.attendance:" + memberKey,
      )) as {
        days: DailyVisits[];
        from: string;
        through: string;
        updatedAt: string;
      })
    : null;
  const current =
    snapshot && snapshot.from <= from && snapshot.through >= from
      ? snapshot
      : null;
  let checkins = null;
  try {
    checkins = (await readMemberCheckins(env, memberId)).checkins;
  } catch {
    /* Preserve synced daily attendance if check-ins are unavailable. */
  }
  return {
    days:
      current || checkins
        ? trainingDays(current?.days ?? null, checkins, today)
        : null,
    updatedAt: current?.updatedAt ?? null,
    through: current?.through ?? null,
    from,
  };
}
