import type {
  AttendanceEvent,
  MemberProfile,
  MembershipRecord,
} from "../domain/models";
/** Implement in authenticated backend functions after verifying GymMaster documentation.
 * Never call GymMaster with private credentials from the browser. */
export interface GymMasterGateway {
  getMember(internalMemberId: string): Promise<MemberProfile>;
  getMemberships(internalMemberId: string): Promise<MembershipRecord[]>;
  getAttendance(internalMemberId: string): Promise<AttendanceEvent[]>;
}
export const integrationStatus = {
  gymMaster: "connection-test-only",
  supabase: "not-connected",
} as const;
