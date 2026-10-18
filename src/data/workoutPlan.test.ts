import { describe, expect, it } from "vitest";
import { weeklyWorkoutPlan } from "./workoutPlan";
import { defaultExercises } from "../domain/training";
describe("weekly station plan", () => {
  it("pairs repeated workouts across Monday to Saturday with nine three-minute stations per plan", () => {
    expect(weeklyWorkoutPlan.map((day) => day.day)).toEqual([
      "Mon/Thurs",
      "Tues/Fri",
      "Wed/Sat",
    ]);
    expect(weeklyWorkoutPlan.map((day) => day.dayOffsets)).toEqual([
      [0, 3],
      [1, 4],
      [2, 5],
    ]);
    expect(
      weeklyWorkoutPlan.flatMap((day) => [...day.dayOffsets]).sort(),
    ).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(weeklyWorkoutPlan.map((day) => day.id)).size).toBe(3);
    for (const day of weeklyWorkoutPlan) {
      expect(day.stations.map((s) => s.number)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9,
      ]);
      expect(
        day.stations.reduce((minutes, s) => minutes + s.durationMinutes, 0),
      ).toBe(27);
      for (const station of day.stations) {
        expect(station.durationMinutes).toBe(3);
        expect(station.exercises.length).toBeGreaterThan(0);
      }
    }
  });
  it("links each trackable movement to the correct existing log exercise", () => {
    for (const day of weeklyWorkoutPlan)
      for (const station of day.stations)
        for (const exercise of station.exercises) {
          expect(exercise.name.trim()).not.toBe("");
          expect(exercise.instruction.trim()).not.toBe("");
          if (exercise.logExerciseId) {
            const logExercise = defaultExercises.find(
              (item) => item.id === exercise.logExerciseId,
            );
            expect(logExercise?.name).toBe(exercise.name);
          }
        }
    expect(weeklyWorkoutPlan[2].stations[0].exercises[0].logExerciseId).toBe(
      "back-squat",
    );
  });
});
