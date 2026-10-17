import { describe, it, expect } from "vitest";
import {
  emptyTrainingLog,
  exerciseProgress,
  heaviestSet,
  sessionVolume,
  validateSession,
  validDate,
  type TrainingSession,
} from "./training";
const session = (
  overrides: Partial<TrainingSession> = {},
): TrainingSession => ({
  id: "session-1",
  exerciseId: "back-squat",
  date: "2026-01-10",
  createdAt: "2026-01-10T03:00:00Z",
  sets: [
    { reps: 8, weight: 40 },
    { reps: 8, weight: 45 },
    { reps: 6, weight: 50 },
  ],
  ...overrides,
});
describe("training performance", () => {
  it("calculates volume across different sets and uses the heaviest individual set", () => {
    expect(sessionVolume(session().sets)).toBe(980);
    expect(heaviestSet(session().sets)).toBe(50);
    expect(
      sessionVolume([
        { reps: 3, weight: 0.1 },
        { reps: 3, weight: 0.2 },
      ]),
    ).toBe(0.9);
  });
  it("orders backdated sessions by date and same-day sessions by creation time", () => {
    const later = session({
      id: "later",
      date: "2026-01-15",
      sets: [{ reps: 5, weight: 60 }],
    });
    const first = session({
      id: "first",
      createdAt: "2026-01-10T01:00:00Z",
      sets: [{ reps: 10, weight: 40 }],
    });
    const progress = exerciseProgress(
      [
        later,
        session(),
        first,
        session({
          id: "other",
          exerciseId: "deadlift",
          sets: [{ reps: 5, weight: 200 }],
        }),
      ],
      "back-squat",
    );
    expect(progress.history.map((s) => s.id)).toEqual([
      "first",
      "session-1",
      "later",
    ]);
    expect(progress.bestWeight).toBe(60);
    expect(progress.bestVolume).toBe(980);
    expect(progress.latestVolume).toBe(300);
    expect(progress.weightChange).toBe(20);
    expect(progress.volumeChange).toBe(-100);
  });
  it("handles no history, one session and bodyweight entries without invented gains", () => {
    expect(exerciseProgress([], "back-squat").points).toEqual([]);
    expect(exerciseProgress([], "back-squat").weightChange).toBeNull();
    const s = exerciseProgress(
      [session({ sets: [{ reps: 10, weight: 0 }] })],
      "back-squat",
    );
    expect(s.bestWeight).toBe(0);
    expect(s.latestVolume).toBe(0);
    expect(s.volumeChange).toBeNull();
  });
  it("recalculates improvements after edits and deletions", () => {
    const first = session({ id: "first" });
    const second = session({
      id: "second",
      date: "2026-01-20",
      sets: [{ reps: 10, weight: 70 }],
    });
    expect(exerciseProgress([first, second], "back-squat").bestWeight).toBe(70);
    expect(
      exerciseProgress(
        [first, { ...second, sets: [{ reps: 10, weight: 35 }] }],
        "back-squat",
      ).bestWeight,
    ).toBe(50);
    expect(exerciseProgress([first], "back-squat").points).toHaveLength(1);
  });
});
describe("training input", () => {
  it("validates dates including leap days and rejects future workouts", () => {
    expect(validDate("2024-02-29")).toBe(true);
    expect(validDate("2025-02-29")).toBe(false);
    expect(validDate("2026-02-30")).toBe(false);
    expect(() =>
      validateSession(session({ date: "2026-01-11" }), "2026-01-10"),
    ).toThrow(/today or earlier/);
    expect(() => validateSession(session(), "2026-01-10")).not.toThrow();
  });
  it("rejects missing sets, invalid reps and invalid weights", () => {
    for (const sets of [
      [],
      Array.from({ length: 51 }, () => ({ reps: 1, weight: 20 })),
      [{ reps: 0, weight: 20 }],
      [{ reps: 2.5, weight: 20 }],
      [{ reps: 201, weight: 20 }],
      [{ reps: NaN, weight: 20 }],
      [{ reps: 2, weight: -1 }],
      [{ reps: 2, weight: Infinity }],
      [{ reps: 2, weight: 1001 }],
      [{ reps: 2, weight: NaN }],
    ])
      expect(() => validateSession(session({ sets }), "2026-01-10")).toThrow();
    expect(() =>
      validateSession(
        session({ sets: [{ reps: 8, weight: 41.25 }] }),
        "2026-01-10",
      ),
    ).not.toThrow();
  });
  it("returns independent empty logs with no fictional training records", () => {
    const first = emptyTrainingLog(),
      second = emptyTrainingLog();
    first.exercises[0].name = "Changed";
    expect(second.exercises[0].name).toBe("Back squat");
    expect(second.sessions).toEqual([]);
  });
});
