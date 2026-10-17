import { beforeEach, it, expect, vi } from "vitest";
import {
  readTrainingLog,
  writeTrainingLog,
  trainingStorageKey,
} from "./training";
import { emptyTrainingLog } from "../domain/training";
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
});
it("persists sessions and custom exercises across loads and separates members", () => {
  const log = emptyTrainingLog();
  log.exercises.push({ id: "custom", name: "Goblet squat" });
  log.sessions.push({
    id: "s1",
    exerciseId: "custom",
    date: "2026-01-01",
    createdAt: "2026-01-01T00:00:00Z",
    sets: [{ reps: 10, weight: 20 }],
  });
  writeTrainingLog("sarah", log);
  expect(readTrainingLog("sarah")).toEqual(log);
  expect(readTrainingLog("james").sessions).toEqual([]);
  expect(
    readTrainingLog("james").exercises.some((e) => e.id === "custom"),
  ).toBe(false);
});
it("round trips edits and deletes without affecting other entries", () => {
  const log = emptyTrainingLog();
  log.sessions = [
    {
      id: "s1",
      exerciseId: "back-squat",
      date: "2026-01-01",
      createdAt: "2026-01-01T00:00:00Z",
      sets: [{ reps: 8, weight: 40 }],
    },
  ];
  writeTrainingLog("one", log);
  const loaded = readTrainingLog("one");
  loaded.sessions[0].sets[0].weight = 50;
  writeTrainingLog("one", loaded);
  expect(readTrainingLog("one").sessions[0].sets[0].weight).toBe(50);
  writeTrainingLog("one", { ...loaded, sessions: [] });
  expect(readTrainingLog("one").sessions).toEqual([]);
});
it("does not replace corrupt or unsupported saved data", () => {
  for (const raw of [
    "broken",
    "null",
    JSON.stringify({ version: 2, exercises: [], sessions: [] }),
  ]) {
    store.set(trainingStorageKey("one"), raw);
    expect(() => readTrainingLog("one")).toThrow();
    expect(store.get(trainingStorageKey("one"))).toBe(raw);
  }
});
it("rejects duplicate session IDs, unknown exercises and invalid stored sets", () => {
  const log = emptyTrainingLog();
  const session = {
    id: "s1",
    exerciseId: "back-squat",
    date: "2026-01-01",
    createdAt: "2026-01-01T00:00:00Z",
    sets: [{ reps: 8, weight: 40 }],
  };
  for (const sessions of [
    [session, session],
    [{ ...session, exerciseId: "missing" }],
    [{ ...session, sets: [{ reps: 2.5, weight: 20 }] }],
  ]) {
    store.set(trainingStorageKey("one"), JSON.stringify({ ...log, sessions }));
    expect(() => readTrainingLog("one")).toThrow();
  }
});
it("surfaces storage failures instead of reporting a successful save", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {
      throw Error("Storage full");
    },
  });
  expect(() => writeTrainingLog("one", emptyTrainingLog())).toThrow(
    "Storage full",
  );
});
