import { describe, it, expect } from "vitest";
import { personalBests } from "./control";
import { emptyTrainingLog } from "./training";
import { chowChallenge, emptyChowLog } from "./chow";
function training() {
  const log = emptyTrainingLog();
  log.sessions = [
    {
      id: "one",
      exerciseId: "back-squat",
      date: "2026-10-26",
      createdAt: "2026-10-26T01:00:00Z",
      sets: [{ reps: 8, weight: 40 }],
    },
    {
      id: "two",
      exerciseId: "back-squat",
      date: "2026-10-27",
      createdAt: "2026-10-27T01:00:00Z",
      sets: [{ reps: 8, weight: 50 }],
    },
  ];
  return log;
}
describe("Control Room personal-best activity", () => {
  it("treats the first session as a baseline and emits real weight/volume improvements", () => {
    const log = training();
    expect(
      personalBests({ ...log, sessions: log.sessions.slice(0, 1) }, "training"),
    ).toEqual([]);
    const events = personalBests(log, "training");
    expect(events.map((e) => e.kind).sort()).toEqual([
      "volume_pb",
      "weight_pb",
    ]);
    expect(events.find((e) => e.kind === "weight_pb")?.value).toBe(50);
    expect(events.find((e) => e.kind === "volume_pb")?.value).toBe(400);
  });
  it("has stable identities on refresh and recalculates edits/deletions", () => {
    const log = training();
    expect(personalBests(log, "training")).toEqual(
      personalBests(structuredClone(log), "training"),
    );
    log.sessions[1].sets[0].weight = 30;
    expect(personalBests(log, "training")).toEqual([]);
    log.sessions = [];
    expect(personalBests(log, "training")).toEqual([]);
  });
  it("does not claim a PB for equal or lower results, or mix exercises", () => {
    const log = training();
    log.sessions[1].sets[0].weight = 40;
    expect(personalBests(log, "training")).toEqual([]);
    log.sessions[1].exerciseId = "deadlift";
    expect(personalBests(log, "training")).toEqual([]);
  });
  it("compares CHOW sets only within the same challenge", async () => {
    const log = emptyChowLog(),
      c = await chowChallenge({
        block: "Strength",
        weekBeginning: "2026-10-26",
        programWeek: 1,
        station: 1,
        workout: "Sprawls",
        blockScoped: true,
        blockStart: "2026-10-26",
      });
    log.challenges = [c];
    log.scores = [
      {
        id: "one",
        challengeId: c.id,
        date: "2026-10-26",
        createdAt: "2026-10-26T01:00:00Z",
        score: 8,
        unit: "sets",
      },
      {
        id: "two",
        challengeId: c.id,
        date: "2026-10-27",
        createdAt: "2026-10-27T01:00:00Z",
        score: 10,
        unit: "sets",
      },
      {
        id: "old",
        challengeId: c.id,
        date: "2026-10-28",
        createdAt: "2026-10-28T01:00:00Z",
        score: 200,
        unit: "reps",
      },
    ];
    expect(
      personalBests(log, "chow").map((e) => [e.kind, e.value, e.unit]),
    ).toEqual([["chow_pb", 10, "sets"]]);
  });
});
