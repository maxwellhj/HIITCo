import type { DemoData, MemberRepository } from "../domain/models";
import {
  dateKey,
  shiftDate,
  weekKey,
  validateTarget,
} from "../domain/attendance";
const STORAGE_KEY = "hiit-co.demo.targets.v1";
const names = [
  ["Sarah", "Mitchell"],
  ["James", "Wilson"],
  ["Aroha", "Thompson"],
  ["Ben", "Carter"],
  ["Olivia", "Chen"],
  ["Liam", "Taylor"],
  ["Maia", "Williams"],
  ["Tom", "Anderson"],
  ["Emma", "Roberts"],
  ["Noah", "Patel"],
  ["Sophie", "Brown"],
  ["Jack", "Evans"],
];
export function createMockData(now = new Date()): DemoData {
  const monday = weekKey(dateKey(now)),
    today = dateKey(now);
  const members = names.map(([firstName, lastName], i) => ({
    id: `member-${i + 1}`,
    firstName,
    lastName,
    initials: firstName[0] + lastName[0],
    weeklyTarget: [3, 4, 3, 2, 4, 3, 3, 5, 2, 3, 4, 3][i],
    historyComplete: true,
  }));
  const attendance: DemoData["attendance"] = [];
  members.forEach((m, i) => {
    const total = i === 0 ? 86 : 25 + i * 17;
    let added = 0;
    for (let w = 0; added < total && w < 180; w++) {
      if (
        (i === 3 && w < 3) ||
        (i === 8 && w < 2) ||
        (i === 0 && w === 8) ||
        (i % 3 === 1 && w % 5 === 3)
      )
        continue;
      const count =
        w === 0
          ? [2, 4, 3, 0, 1, 3, 2, 5, 0, 1, 4, 2][i]
          : [3, 4, 2, 2, 3, 3][(i + w) % 6];
      for (let d = 0; d < count && added < total; d++) {
        const day = shiftDate(monday, -w * 7 + [0, 2, 3, 4, 5][d]);
        if (day > today) continue;
        attendance.push({
          id: `${m.id}-${w}-${d}`,
          memberId: m.id,
          occurredAt: `${day}T07:30:00+13:00`,
          source: "demo",
          reference: `DEMO-${m.id}-${w}-${d}`,
        });
        added++;
      }
    }
  });
  return {
    members,
    attendance,
    memberships: members.map((m) => ({
      memberId: m.id,
      status: "active",
      planName: "Unlimited training",
    })),
  };
}
function readTargets(): Record<string, number> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(
      "Saved demo targets could not be read. Reset the demo to continue.",
    );
  const result: Record<string, number> = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (typeof value !== "number")
      throw new Error(
        "Saved demo targets are invalid. Reset the demo to continue.",
      );
    validateTarget(value);
    result[id] = value;
  }
  return result;
}
export const demoRepository: MemberRepository = {
  async load() {
    const data = createMockData();
    const targets = readTargets();
    data.members = data.members.map((m) => ({
      ...m,
      weeklyTarget: targets[m.id] ?? m.weeklyTarget,
    }));
    return data;
  },
  async saveTarget(id, target) {
    validateTarget(target);
    const targets = readTargets();
    targets[id] = target;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(targets));
  },
};
export function resetDemo() {
  localStorage.removeItem(STORAGE_KEY);
}
