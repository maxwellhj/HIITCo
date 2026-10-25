import { describe, it, expect } from "vitest";
import {
  bestChowScore,
  chowChallenge,
  emptyChowLog,
  parseChowLog,
} from "./chow";
const seed = {
  block: "Strength",
  weekBeginning: "2026-10-26",
  programWeek: 1,
  station: 1,
  workout: "4x Sprawls\n20x Butt Kicks\n4x Tuck Jumps",
};
async function sample() {
  const challenge = await chowChallenge(seed);
  return {
    version: 1 as const,
    challenges: [challenge],
    scores: [
      {
        id: "score-1",
        challengeId: challenge.id,
        date: "2026-10-26",
        score: 120,
        unit: "reps" as const,
        createdAt: "2026-10-26T03:00:00Z",
      },
    ],
  };
}
describe("CHOW attempts", () => {
  it("keeps identity stable for unchanged weekly challenges and separates changed workouts, stations and weeks", async () => {
    const challenge = await chowChallenge(seed);
    expect(
      (
        await chowChallenge({
          ...seed,
          workout: "  " + seed.workout.replace(/\n/g, "\r\n") + "  ",
        })
      ).id,
    ).toBe(challenge.id);
    for (const changed of [
      { ...seed, station: 2 },
      { ...seed, weekBeginning: "2026-11-02" },
      { ...seed, workout: "New challenge" },
    ])
      expect((await chowChallenge(changed)).id).not.toBe(challenge.id);
  });
  it("validates round trips without changing historical instructions", async () => {
    const log = await sample();
    expect(await parseChowLog(log, "2026-10-26")).toEqual(log);
    expect(await parseChowLog(emptyChowLog(), "2026-10-26")).toEqual(
      emptyChowLog(),
    );
    log.challenges[0].workout = "Changed";
    await expect(parseChowLog(log, "2026-10-26")).rejects.toThrow();
  });
  it("compares only the same challenge and unit, including a legitimate zero", () => {
    const scores = [
      {
        id: "s",
        challengeId: "c",
        date: "2026-10-26",
        score: 0,
        unit: "reps" as const,
        createdAt: "2026-10-26",
      },
      {
        id: "s2",
        challengeId: "c",
        date: "2026-10-26",
        score: 50,
        unit: "kg" as const,
        createdAt: "2026-10-26",
      },
    ];
    expect(bestChowScore(scores, "c", "reps")).toBe(0);
    expect(bestChowScore(scores, "c", "kg")).toBe(50);
    expect(bestChowScore(scores, "other", "reps")).toBeNull();
  });
  it("rejects invalid units, negative/nonfinite scores, excessive precision, future/out-of-week dates and duplicate attempts", async () => {
    for (const patch of [
      { score: -1 },
      { score: Infinity },
      { score: 1000001 },
      { score: 1.234 },
      { unit: "seconds" },
      { date: "2026-10-27" },
      { date: "2026-10-25" },
      { date: "2026-11-02" },
      { challengeId: "wrong" },
    ]) {
      const log = await sample();
      Object.assign(log.scores[0], patch);
      await expect(parseChowLog(log, "2026-10-26")).rejects.toThrow();
    }
    const duplicate = await sample();
    duplicate.scores.push(duplicate.scores[0]);
    await expect(parseChowLog(duplicate, "2026-10-26")).rejects.toThrow();
  });
});
