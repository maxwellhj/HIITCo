import { describe, expect, it } from "vitest";
import {
  grantedCheckin,
  nzCheckinTimestamp,
  memberCheckinIndex,
  sealCheckin,
  openCheckin,
} from "./checkinRecords";
import {
  parseCheckinTimes,
  checkinTimeLabel,
} from "../../src/domain/checkinTimes";
const event = {
  event_type: "member_checkin",
  event_timestamp: "2026-10-22T07:09:24.906388",
  payload: {
    id: 123,
    memberid: 42,
    access: "granted",
    timestamp: "2026-10-22 06:47:30.172346",
    doorname: "Reception",
    membername: "Never forward this",
  },
};
describe("NZ member check-in records", () => {
  it("maps only the actual check-in timestamp, without delivery time, names or member IDs", () => {
    expect(grantedCheckin(event)).toEqual({
      memberId: 42,
      record: {
        id: "123",
        date: "2026-10-22",
        localTimestamp: "2026-10-22T06:47:30.172346",
        door: "Reception",
      },
    });
  });
  it("excludes tests, denied attempts, unknown event types and malformed records", () => {
    for (const e of [
      { ...event, test_webhook: true },
      { ...event, event_type: "member_add" },
      ...[
        { test_webhook: true },
        { test_webhook: "true" },
        { access: "denied" },
        { memberid: 0 },
        { id: null },
        { timestamp: "2026-02-30 06:47:30" },
        { timestamp: "2026-10-22T99:47:30Z" },
      ].map((p) => ({ ...event, payload: { ...event.payload, ...p } })),
    ])
      expect(grantedCheckin(e)).toBeNull();
  });
  it("accepts explicit UTC and offset timestamps and converts them to the correct NZ day and time", () => {
    for (const [input, expected] of [
      ["2026-10-21T17:47:30.172346Z", "2026-10-22T06:47:30.172346"],
      ["2026-07-01T18:47:30Z", "2026-07-02T06:47:30"],
      ["2026-10-22T06:47:30+13:00", "2026-10-22T06:47:30"],
      ["2026-07-02T06:47:30+12", "2026-07-02T06:47:30"],
      ["2026-10-22T06:47:30+12:00", "2026-10-22T07:47:30"],
    ])
      expect(nzCheckinTimestamp(input)).toBe(expected);
    expect(
      grantedCheckin({
        ...event,
        payload: { ...event.payload, timestamp: "2026-10-21T17:47:30Z" },
      })?.record.localTimestamp,
    ).toBe("2026-10-22T06:47:30");
  });
  it("formats NZ wall times without adding 12 or 13 hours, regardless of season", () => {
    for (const date of ["2026-07-02", "2026-10-22", "2026-04-05", "2026-09-27"])
      expect(checkinTimeLabel(`${date}T06:47:30.172346`)).toMatch(/6:47\s*am/i);
  });
  it("binds encrypted records to the authenticated member index", async () => {
    const secret = "test-only-secret-marker",
      record = grantedCheckin(event)!.record;
    const a = await memberCheckinIndex(42, secret),
      b = await memberCheckinIndex(43, secret);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    const sealed = await sealCheckin(record, secret, a);
    expect(await openCheckin(sealed, secret, a)).toEqual(record);
    await expect(openCheckin(sealed, secret, b)).rejects.toThrow();
    await expect(openCheckin(sealed, "different-token", a)).rejects.toThrow();
  });
  it("validates and sorts only safe normalized fields", () => {
    const record = grantedCheckin(event)!.record;
    expect(
      parseCheckinTimes([{ ...record, private: "not-forwarded" }]),
    ).toEqual([record]);
    expect(() => parseCheckinTimes([record, record])).toThrow();
    expect(() =>
      parseCheckinTimes([{ ...record, date: "2026-10-21" }]),
    ).toThrow();
  });
});
