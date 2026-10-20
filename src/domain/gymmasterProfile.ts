export interface GymMasterMemberProfile {
  firstName: string;
  lastName: string;
  totalVisits: number | null;
}
/** Map only documented fields needed for the preview. Never forward the full Member object. */
export function parseMemberProfile(
  value: unknown,
  expectedMemberId: number,
): GymMasterMemberProfile {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid member");
  const member = value as Record<string, unknown>;
  function integer(v: unknown): number {
    if (typeof v === "string" && /^(0|[1-9][0-9]{0,15})$/.test(v))
      v = Number(v);
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)
      throw Error("Invalid integer");
    return v;
  }
  if (integer(member.id) !== expectedMemberId) throw Error("Member mismatch");
  if (
    typeof member.firstname !== "string" ||
    !member.firstname.trim() ||
    member.firstname.length > 200 ||
    typeof member.surname !== "string" ||
    member.surname.length > 200
  )
    throw Error("Invalid name");
  return {
    firstName: member.firstname.trim(),
    lastName: member.surname.trim(),
    totalVisits:
      member.totalvisits == null ? null : integer(member.totalvisits),
  };
}
