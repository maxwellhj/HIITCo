import { shiftDate, weekKey } from "./attendance";
export const habitDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export interface GoalHabit {
  id: string;
  title: string;
  days: number[];
  completed: string[];
}
export interface MemberGoal {
  id: string;
  title: string;
  targetDate: string;
  createdDate: string;
  habits: GoalHabit[];
}
export interface GoalsLog {
  goals: MemberGoal[];
}
export function validGoalDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + "T12:00:00Z")) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function habitScheduled(habit: GoalHabit, date: string) {
  return habit.days.includes(
    (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7,
  );
}
export function goalWeek(date: string) {
  return habitDays.map((_, i) => shiftDate(weekKey(date), i));
}
export function parseGoals(value: unknown, today: string): GoalsLog {
  const data = value as GoalsLog;
  if (!data || !Array.isArray(data.goals) || data.goals.length > 50)
    throw Error("Invalid goals");
  const ids = new Set<string>();
  const text = (s: unknown, max: number): s is string =>
    typeof s === "string" &&
    s.trim().length > 0 &&
    s.length <= max &&
    !/[\u0000-\u001f]/.test(s);
  for (const goal of data.goals) {
    if (
      !goal ||
      !text(goal.id, 80) ||
      ids.has(goal.id) ||
      !text(goal.title, 160) ||
      !validGoalDate(goal.targetDate) ||
      !validGoalDate(goal.createdDate) ||
      goal.createdDate > today ||
      !Array.isArray(goal.habits) ||
      goal.habits.length > 5
    )
      throw Error("Invalid goal");
    ids.add(goal.id);
    const habits = new Set<string>();
    for (const habit of goal.habits) {
      if (
        !habit ||
        !text(habit.id, 80) ||
        habits.has(habit.id) ||
        !text(habit.title, 120) ||
        !Array.isArray(habit.days) ||
        !habit.days.length ||
        habit.days.length > 7 ||
        new Set(habit.days).size !== habit.days.length ||
        habit.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
        !Array.isArray(habit.completed) ||
        habit.completed.length > 3660 ||
        new Set(habit.completed).size !== habit.completed.length ||
        habit.completed.some(
          (d) => !validGoalDate(d) || d > today || d < goal.createdDate,
        )
      )
        throw Error("Invalid habit");
      habits.add(habit.id);
    }
  }
  return data;
}
