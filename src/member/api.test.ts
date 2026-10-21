import { afterEach, describe, expect, it, vi } from "vitest";
import { memberApi, memberError } from "./api";
afterEach(() => vi.restoreAllMocks());
describe("check-in diagnostics", () => {
  it("shows an approved diagnostic without exposing other server fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json(
        {
          error: "checkins_unavailable",
          code: "GM-CHECKINS-DECRYPT",
          private: "never-echo-this",
        },
        { status: 503 },
      ),
    );
    let caught: unknown;
    try {
      await memberApi("checkins");
    } catch (error) {
      caught = error;
    }
    const message = memberError(caught, "checkins");
    expect(message).toContain("GM-CHECKINS-DECRYPT");
    expect(message).not.toContain("never-echo-this");
  });
  it("does not display arbitrary diagnostic strings from a server response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json(
        { error: "checkins_unavailable", code: "private-secret" },
        { status: 503 },
      ),
    );
    let caught: unknown;
    try {
      await memberApi("checkins");
    } catch (error) {
      caught = error;
    }
    expect(memberError(caught, "checkins")).toContain("GM-CHECKINS-CONNECTION");
    expect(memberError(caught, "checkins")).not.toContain("private-secret");
  });
});
