import { validDate } from "./training";
import { weekKey } from "./attendance";
import type { PlannedWorkout } from "../data/workoutPlan";
export interface PublishedWorkout {
  date: string;
  timeZone: "Pacific/Auckland";
  block: string;
  category: string;
  programWeek: number;
  weekBeginning: string;
  day: string;
  publishedAt: string;
  stations: { station: number; workout: string; chow: boolean }[];
}
export function parsePublishedWorkout(
  value: unknown,
  requestedDate: string,
): PublishedWorkout {
  if (!value || typeof value !== "object") throw Error("Invalid workout");
  const w = value as PublishedWorkout;
  if (
    w.date !== requestedDate ||
    !validDate(w.date) ||
    w.timeZone !== "Pacific/Auckland" ||
    w.weekBeginning !== weekKey(w.date) ||
    !Number.isInteger(w.programWeek) ||
    w.programWeek < 1 ||
    w.programWeek > 999 ||
    typeof w.publishedAt !== "string" ||
    !Number.isFinite(Date.parse(w.publishedAt)) ||
    ![w.block, w.category, w.day].every(
      (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 100,
    ) ||
    !Array.isArray(w.stations) ||
    w.stations.length !== 9 ||
    w.stations.some(
      (s, i) =>
        !s ||
        s.station !== i + 1 ||
        typeof s.workout !== "string" ||
        s.workout.length > 6000 ||
        typeof s.chow !== "boolean",
    )
  )
    throw Error("Invalid workout");
  return {
    date: w.date,
    timeZone: w.timeZone,
    block: w.block,
    category: w.category,
    programWeek: w.programWeek,
    weekBeginning: w.weekBeginning,
    day: w.day,
    publishedAt: w.publishedAt,
    stations: w.stations.map((s) => ({
      station: s.station,
      workout: s.workout,
      chow: s.chow,
    })),
  };
}
export function workoutPlan(w: PublishedWorkout, pair: number): PlannedWorkout {
  return {
    id: ["monday", "tuesday", "wednesday"][pair],
    day: ["Mon/Thurs", "Tues/Fri", "Wed/Sat"][pair],
    dayOffsets: (
      [
        [0, 3],
        [1, 4],
        [2, 5],
      ] as const
    )[pair],
    stations: w.stations.map((s) => ({
      number: s.station,
      durationMinutes: 3,
      workoutText: s.workout,
      chow: s.chow,
      exercises: [],
    })),
  };
}
