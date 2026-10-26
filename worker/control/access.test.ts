import { describe, it, expect } from "vitest";
import { controlAllowed } from "./access";
const req = (ip?: string) =>
  new Request("https://example.test/api/control/members", {
    headers: ip ? { "CF-Connecting-IP": ip } : {},
  });
describe("no-login Control Room network access", () => {
  it("denies missing/unconfigured/malformed addresses and never treats a member cookie as admin authority", () => {
    for (const rules of [undefined, "", "*", "0.0.0.0/0", "::/0", "not-an-ip"])
      expect(
        controlAllowed(req("203.0.113.7"), { CONTROL_ROOM_ALLOWED_IPS: rules }),
      ).toBe(false);
    expect(
      controlAllowed(req(), { CONTROL_ROOM_ALLOWED_IPS: "203.0.113.7" }),
    ).toBe(false);
  });
  it("allows only the configured IPv4 address or narrow range", () => {
    expect(
      controlAllowed(req("203.0.113.7"), {
        CONTROL_ROOM_ALLOWED_IPS: "203.0.113.7",
      }),
    ).toBe(true);
    expect(
      controlAllowed(req("203.0.113.8"), {
        CONTROL_ROOM_ALLOWED_IPS: "203.0.113.7",
      }),
    ).toBe(false);
    expect(
      controlAllowed(req("203.0.113.8"), {
        CONTROL_ROOM_ALLOWED_IPS: "203.0.113.0/24",
      }),
    ).toBe(true);
    expect(
      controlAllowed(req("203.0.114.8"), {
        CONTROL_ROOM_ALLOWED_IPS: "203.0.113.0/24",
      }),
    ).toBe(false);
  });
  it("handles IPv6 compression and explicit staff network ranges", () => {
    expect(
      controlAllowed(req("2001:db8::1"), {
        CONTROL_ROOM_ALLOWED_IPS: "2001:0db8:0:0:0:0:0:1",
      }),
    ).toBe(true);
    expect(
      controlAllowed(req("2001:db8:1::10"), {
        CONTROL_ROOM_ALLOWED_IPS: "2001:db8:1::/64",
      }),
    ).toBe(true);
    expect(
      controlAllowed(req("2001:db8:2::10"), {
        CONTROL_ROOM_ALLOWED_IPS: "2001:db8:1::/64",
      }),
    ).toBe(false);
    expect(
      controlAllowed(req("2001:db8:::1"), {
        CONTROL_ROOM_ALLOWED_IPS: "2001:db8::/64",
      }),
    ).toBe(false);
  });
});
