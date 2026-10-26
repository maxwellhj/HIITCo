import type { ControlDataEnv } from "./data";
export interface ControlEnv extends ControlDataEnv {
  CONTROL_ROOM_ALLOWED_IPS?: string;
  GYMMASTER_REPORTS_KEY?: string;
  CONTROL_RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}
function address(value: string): { bits: number; value: bigint } | null {
  if (value.includes(".")) {
    if (value.includes(":")) return null;
    const parts = value.split(".");
    if (
      parts.length !== 4 ||
      parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)
    )
      return null;
    return {
      bits: 32,
      value: parts.reduce((a, p) => (a << 8n) + BigInt(p), 0n),
    };
  }
  if (!/^[a-fA-F0-9:]+$/.test(value) || !value.includes(":")) return null;
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [],
    right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if ([...left, ...right].some((p) => !/^[a-fA-F0-9]{1,4}$/.test(p)))
    return null;
  const fill = 8 - left.length - right.length;
  if ((halves.length === 1 && fill !== 0) || (halves.length === 2 && fill < 1))
    return null;
  const parts = [...left, ...Array(fill).fill("0"), ...right];
  return {
    bits: 128,
    value: parts.reduce((a, p) => (a << 16n) + BigInt("0x" + p), 0n),
  };
}
export function controlAllowed(request: Request, env: ControlEnv) {
  const ip = address(request.headers.get("CF-Connecting-IP") ?? "");
  if (!ip) return false;
  return (env.CONTROL_ROOM_ALLOWED_IPS ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((rule) => {
      const [network, prefix, extra] = rule.split("/");
      if (extra !== undefined) return false;
      const target = address(network);
      if (!target || target.bits !== ip.bits) return false;
      const n = prefix === undefined ? target.bits : Number(prefix);
      if (
        !Number.isInteger(n) ||
        n > target.bits ||
        n < (target.bits === 32 ? 24 : 48)
      )
        return false;
      const shift = BigInt(target.bits - n);
      return ip.value >> shift === target.value >> shift;
    });
}
