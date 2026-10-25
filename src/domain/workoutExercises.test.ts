import { describe, it, expect } from "vitest";
import { emptyTrainingLog } from "./training";
import {
  canLogStation,
  workoutExerciseMatches,
  prepareWorkoutExercise,
} from "./workoutExercises";
describe("inline workout exercise logs", () => {
  it("links the actual Station 2 row and DB step-up names while preserving the prescription text", () => {
    const text = "SA Row 5xM 7xT E/S\n6xM 4xT DB Box Step ups";
    const matches = workoutExerciseMatches(text, 2);
    expect(
      matches.map((m) => [m.exercise.id, text.slice(m.start, m.end)]),
    ).toEqual([
      ["single-arm-row", "SA Row"],
      ["db-box-step-up", "DB Box Step ups"],
    ]);
    expect(matches.every((m) => m.start < m.end)).toBe(true);
  });
  it("disables every exercise link in the excluded stations", () => {
    for (const station of [1, 4, 5, 6, 9]) {
      expect(canLogStation(station)).toBe(false);
      expect(
        workoutExerciseMatches("Back Squats\nDB Box Step ups", station),
      ).toEqual([]);
    }
    for (const station of [2, 3, 7, 8])
      expect(
        workoutExerciseMatches("Back Squats", station)[0].exercise.id,
      ).toBe("back-squat");
  });
  it("reuses the exercise identity when reps, dates or spelling case change", () => {
    for (const text of [
      "6xM 4xT DB Box Step ups",
      "10x DB box step-ups",
      "DB BOX STEP UP 8 reps",
    ]) {
      expect(workoutExerciseMatches(text, 2).map((m) => m.exercise.id)).toEqual(
        ["db-box-step-up"],
      );
    }
  });
  it("keeps equipment and lift variations separate and avoids nested duplicate matches", () => {
    const text =
      "Trap Bar Deadlifts 6xW\nDB Bench Press 8 reps\nDB Front Squats\nKB Box Step ups\nBstance RDL's\nDB RDL\nBB RDLs";
    expect(workoutExerciseMatches(text, 7).map((m) => m.exercise.id)).toEqual([
      "trap-bar-deadlift",
      "db-bench-press",
      "db-front-squat",
      "kb-box-step-up",
      "b-stance-rdl",
      "db-rdl",
      "barbell-rdl",
    ]);
  });
  it("opens a new exercise without mutating or saving the account log, and adds it once with the first session", () => {
    const log = emptyTrainingLog(),
      result = prepareWorkoutExercise(log, "db-box-step-up");
    expect(log.exercises.some((e) => e.id === "db-box-step-up")).toBe(false);
    expect(result.exerciseId).toBe("db-box-step-up");
    expect(result.log.exercises.at(-1)).toEqual({
      id: "db-box-step-up",
      name: "DB box step ups",
    });
    expect(result.log.sessions).toEqual([]);
    expect(prepareWorkoutExercise(result.log, "db-box-step-up").log).toBe(
      result.log,
    );
  });
  it("opens an existing same-named custom exercise and its history without creating a second log", () => {
    const log = emptyTrainingLog();
    log.exercises.push({ id: "custom-step-ups", name: "DB BOX STEP UPS" });
    log.sessions.push({
      id: "session-1",
      exerciseId: "custom-step-ups",
      date: "2026-10-26",
      createdAt: "2026-10-26T00:00:00Z",
      sets: [{ weight: 20, reps: 8 }],
    });
    const result = prepareWorkoutExercise(log, "db-box-step-up");
    expect(result.exerciseId).toBe("custom-step-ups");
    expect(result.log).toBe(log);
    expect(result.log.sessions[0].sets[0].weight).toBe(20);
  });
  it("recognizes common accessory movements without changing their source names", () => {
    expect(
      workoutExerciseMatches(
        "Chest flies 6 reps\nLying Tricep Extensions\nOH Tricep Extensions\nTRX extensions\nBand Face Pulls 8x",
        2,
      ).map((m) => m.exercise.id),
    ).toEqual([
      "chest-fly",
      "lying-tricep-extension",
      "overhead-tricep-extension",
      "trx-tricep-extension",
      "band-face-pull",
    ]);
  });
  it("does not invent exercises for numeric combos or unknown links", () => {
    expect(workoutExerciseMatches("1,1,2\n2,3,Roll,Lrip", 2)).toEqual([]);
    const log = emptyTrainingLog();
    expect(prepareWorkoutExercise(log, "unknown").log).toBe(log);
  });
});
