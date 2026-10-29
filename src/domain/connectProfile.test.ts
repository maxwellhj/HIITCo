import { describe, expect, it } from "vitest";
import { defaultDisplayName, validDisplayName } from "./connectProfile";
describe("Connect display names", () => {
  it("uses first name and last initial, without exposing the surname", () => {
    expect(defaultDisplayName("Emma", "Harris")).toBe("Emma H.");
    expect(defaultDisplayName("Mary Jane", "O’Connor")).toBe("Mary Jane O.");
    expect(defaultDisplayName("René", "")).toBe("René");
  });
  it("accepts nicknames and rejects empty, oversized and control-character names", () => {
    expect(validDisplayName("Training buddy 🥊")).toBe(true);
    for (const value of [" ", "x".repeat(41), "A\nB", 42, null])
      expect(validDisplayName(value)).toBe(false);
  });
});
