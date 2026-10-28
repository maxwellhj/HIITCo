import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./data", () => ({ controlData: vi.fn() }));
vi.mock("../training", () => ({ openTraining: vi.fn(async (v) => v) }));
vi.mock("../gymmaster/checkins", () => ({ readMemberCheckins: vi.fn() }));
import { controlData } from "./data";
import { readMemberCheckins } from "../gymmaster/checkins";
import { controlAttendance } from "./attendance";
const env = { GYMMASTER_API_KEY: "test" };
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
describe("Control Room attendance", () => {
  function setup(snapshot: unknown, checkins: unknown[] = []) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T20:00:00Z"));
    vi.mocked(controlData).mockResolvedValue({ sealed: snapshot });
    vi.mocked(readMemberCheckins).mockResolvedValue({
      checkins,
      historyPending: false,
    } as never);
  }
  it("counts actual attendance days without requiring any weight logs, and deduplicates check-ins", async () => {
    setup(
      {
        from: "2026-10-12",
        through: "2026-10-28",
        updatedAt: "2026-10-28T00:00:00Z",
        days: [
          { date: "2026-10-26", visits: 2 },
          { date: "2026-10-27", visits: 1 },
        ],
      },
      [{ date: "2026-10-27" }, { date: "2026-10-29" }, { date: "2026-10-29" }],
    );
    const value = await controlAttendance(env, "member", 42);
    expect(value.days).toBe(3);
    expect(readMemberCheckins).toHaveBeenCalledWith(env, 42);
  });
  it("includes received attendance even before a member refreshes their app", async () => {
    setup(null, [{ date: "2026-10-28" }]);
    expect((await controlAttendance(env, "member", 43)).days).toBe(1);
  });
  it("does not carry last week's snapshot into this week", async () => {
    setup({
      from: "2026-10-05",
      through: "2026-10-25",
      updatedAt: "2026-10-25T00:00:00Z",
      days: [{ date: "2026-10-24", visits: 1 }],
    });
    expect((await controlAttendance(env, "member", 42)).days).toBe(0);
  });
  it("shows unavailable rather than zero when neither source is available", async () => {
    setup(null);
    vi.mocked(readMemberCheckins).mockRejectedValue(new Error());
    expect((await controlAttendance(env, "member", 42)).days).toBeNull();
  });
});
