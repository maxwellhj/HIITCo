import { beforeEach, expect, it, vi } from "vitest";
import { createMockData, demoRepository, resetDemo } from "./mock";
import { attendanceStats } from "../domain/attendance";
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
});
it("provides varied fictional histories from a shared model", () => {
  const now = new Date("2026-10-17T00:00:00Z"),
    data = createMockData(now);
  const stats = data.members.map((m) =>
    attendanceStats(m, data.attendance, now),
  );
  expect(data.members.length).toBeGreaterThanOrEqual(10);
  expect(stats[0].total).toBe(86);
  expect(stats.some((s) => s.percentage >= 100)).toBe(true);
  expect(stats.some((s) => s.completed === 0)).toBe(true);
  expect(stats.some((s) => s.completed > 0 && s.percentage < 100)).toBe(true);
});
it("persists target updates across reloads, validates, and resets", async () => {
  await demoRepository.saveTarget("member-1", 5);
  expect((await demoRepository.load()).members[0].weeklyTarget).toBe(5);
  await expect(demoRepository.saveTarget("member-1", 0)).rejects.toThrow();
  expect((await demoRepository.load()).members[0].weeklyTarget).toBe(5);
  resetDemo();
  expect((await demoRepository.load()).members[0].weeklyTarget).toBe(3);
});
it("reports corrupt stored data rather than silently replacing it", async () => {
  store.set("hiit-co.demo.targets.v1", "broken");
  await expect(demoRepository.load()).rejects.toThrow();
});
it("surfaces storage write failures", async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {
      throw new Error("Storage full");
    },
  });
  await expect(demoRepository.saveTarget("member-1", 4)).rejects.toThrow(
    "Storage full",
  );
});
