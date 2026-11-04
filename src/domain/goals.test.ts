import { describe, it, expect } from "vitest";
import { parseGoals, habitScheduled, goalWeek } from "./goals";
const today = "2026-11-05";
const sample = () => ({
  goals: [
    {
      id: "one",
      title: "Lose 10 kilos",
      targetDate: "2026-12-25",
      createdDate: "2026-11-01",
      habits: [
        {
          id: "steps",
          title: "10,000 steps",
          days: [1, 2, 3, 4, 5, 6],
          completed: ["2026-11-03"],
        },
      ],
    },
  ],
});
describe("goals and daily habits", () => {
  it("restores goals and past completion history", () =>
    expect(parseGoals(sample(), today)).toEqual(sample()));
  it("schedules Tuesday through Sunday and builds a Monday week", () => {
    const h = sample().goals[0].habits[0];
    expect(habitScheduled(h, "2026-11-02")).toBe(false);
    expect(habitScheduled(h, "2026-11-03")).toBe(true);
    expect(goalWeek(today)).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
  });
  it("allows a goal without habits", () => {
    const s = sample();
    s.goals[0].habits = [];
    expect(parseGoals(s, today).goals).toHaveLength(1);
  });
  it("rejects invalid dates, future completions, empty schedules and more than five habits", () => {
    const badDate = sample();
    badDate.goals[0].targetDate = "2026-02-30";
    expect(() => parseGoals(badDate, today)).toThrow();
    const future = sample();
    future.goals[0].habits[0].completed = ["2026-11-06"];
    expect(() => parseGoals(future, today)).toThrow();
    const empty = sample();
    empty.goals[0].habits[0].days = [];
    expect(() => parseGoals(empty, today)).toThrow();
    const many = sample();
    many.goals[0].habits = Array.from({ length: 6 }, (_, i) => ({
      ...many.goals[0].habits[0],
      id: String(i),
    }));
    expect(() => parseGoals(many, today)).toThrow();
  });
  it("preserves history when a weekday schedule is edited", () => {
    const s = sample();
    s.goals[0].habits[0].days = [0];
    expect(parseGoals(s, today).goals[0].habits[0].completed).toEqual([
      "2026-11-03",
    ]);
  });
});
