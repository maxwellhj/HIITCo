import { heaviestSet, sessionVolume, type TrainingLogData } from "./training";
import type { ChowLogData } from "./chow";
export interface AppMember {
  memberKey: string;
  memberId: number;
  firstName: string;
  lastName: string;
  totalVisits: number | null;
  lastSeen: string;
}
export type StickerCategory = "milestones" | "events";
export interface ClubSticker {
  category?: StickerCategory;
  id: string;
  name: string;
  description: string;
  image: string;
  createdAt: string;
}
export interface ActivityItem {
  id: string;
  memberKey: string;
  kind:
    | "weight_pb"
    | "volume_pb"
    | "chow_pb"
    | "sticker_unlocked"
    | "sticker_locked";
  title: string;
  value?: number;
  unit?: string;
  date: string;
  createdAt: string;
  read?: boolean;
}
export interface BestEvent {
  id: string;
  kind: ActivityItem["kind"];
  title: string;
  value: number;
  unit: string;
  date: string;
  createdAt: string;
}
/** Recompute current PB history, so corrections/deletions do not leave stale notifications. */
export function personalBests(
  log: TrainingLogData | ChowLogData,
  kind: "training" | "chow",
): BestEvent[] {
  const result: BestEvent[] = [];
  if (kind === "training") {
    const data = log as TrainingLogData;
    for (const exercise of data.exercises) {
      const sessions = data.sessions
        .filter((s) => s.exerciseId === exercise.id)
        .slice()
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.createdAt.localeCompare(b.createdAt) ||
            a.id.localeCompare(b.id),
        );
      let weight = 0,
        volume = 0;
      sessions.forEach((s, i) => {
        const w = heaviestSet(s.sets),
          v = sessionVolume(s.sets);
        if (i > 0 && w > weight)
          result.push({
            id: `w-${exercise.id}-${s.id}-${w}`,
            kind: "weight_pb",
            title: exercise.name,
            value: w,
            unit: "kg",
            date: s.date,
            createdAt: s.createdAt,
          });
        if (i > 0 && v > volume)
          result.push({
            id: `v-${exercise.id}-${s.id}-${v}`,
            kind: "volume_pb",
            title: exercise.name,
            value: v,
            unit: "kg volume",
            date: s.date,
            createdAt: s.createdAt,
          });
        weight = Math.max(weight, w);
        volume = Math.max(volume, v);
      });
    }
  } else {
    const data = log as ChowLogData;
    for (const c of data.challenges) {
      let best = 0;
      data.scores
        .filter((s) => s.challengeId === c.id && s.unit === "sets")
        .slice()
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.createdAt.localeCompare(b.createdAt) ||
            a.id.localeCompare(b.id),
        )
        .forEach((s, i) => {
          if (i > 0 && s.score > best)
            result.push({
              id: `c-${c.id}-${s.id}-${s.score}`,
              kind: "chow_pb",
              title: `CHOW Station ${c.station} · ${c.block}`,
              value: s.score,
              unit: "sets",
              date: s.date,
              createdAt: s.createdAt,
            });
          best = Math.max(best, s.score);
        });
    }
  }
  return result
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) ||
        b.date.localeCompare(a.date) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 100);
}
