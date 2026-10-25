import { describe, it, expect } from "vitest";
import { workoutExerciseMatches } from "./workoutExercises";
import { parsePublishedWorkout, workoutPlan } from "./publishedWorkouts";
const fixture = {
  date: "2026-10-26",
  timeZone: "Pacific/Auckland",
  block: "Strength",
  category: "Strength",
  programWeek: 3,
  weekBeginning: "2026-10-26",
  day: "Monday",
  publishedAt: "2026-10-25T04:00:00Z",
  stations: Array.from({ length: 9 }, (_, i) => ({
    station: i + 1,
    workout:
      i === 1
        ? "Back squat 5 reps\nBench Press 8 reps"
        : "4x 1,2,3\n3x Jab–cross",
    chow: i === 0,
  })),
};
describe("builder workout adapter", () => {
  it("preserves exact multiline station instructions and CHOW while linking recognized exercises", () => {
    const result = workoutPlan(parsePublishedWorkout(fixture, fixture.date), 0);
    expect(result.stations).toHaveLength(9);
    expect(result.stations[0].workoutText).toBe(fixture.stations[0].workout);
    expect(result.stations[0].chow).toBe(true);
    expect(result.stations[0].exercises).toEqual([]);
    expect(
      workoutExerciseMatches(result.stations[1].workoutText!, 2).map(
        (m) => m.exercise.id,
      ),
    ).toEqual(["back-squat", "bench-press"]);
    expect(result.dayOffsets).toEqual([0, 3]);
  });
  it("keeps exercise variants out of unrelated progress histories", () => {
    const value = structuredClone(fixture);
    value.stations[1].workout =
      "Trap Bar Deadlifts 6 reps\nDB Bench Press 8 reps";
    expect(
      workoutExerciseMatches(value.stations[1].workout, 2).map(
        (m) => m.exercise.id,
      ),
    ).toEqual(["trap-bar-deadlift", "db-bench-press"]);
  });
  it("validates and preserves the nine block CHOW definitions", () => {
    const value = {
      ...fixture,
      blockBeginning: "2026-10-26",
      blockChows: Array.from({ length: 9 }, (_, i) => ({
        station: i + 1,
        workout: `CHOW ${i + 1}`,
      })),
    };
    expect(parsePublishedWorkout(value, value.date).blockChows).toEqual(
      value.blockChows,
    );
    expect(() =>
      parsePublishedWorkout(
        { ...value, blockChows: value.blockChows.slice(0, 8) },
        value.date,
      ),
    ).toThrow();
  });
  it("rejects malformed or wrongly dated feeds", () => {
    for (const value of [
      null,
      { ...fixture, date: "2026-10-27" },
      { ...fixture, stations: [...fixture.stations].reverse() },
      {
        ...fixture,
        stations: fixture.stations.map((s) => ({ ...s, chow: "true" })),
      },
    ])
      expect(() => parsePublishedWorkout(value, fixture.date)).toThrow();
  });
});
