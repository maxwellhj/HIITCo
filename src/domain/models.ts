/** Internal contracts; these are not assertions about GymMaster API fields. */
export interface MemberProfile {
  id: string;
  firstName: string;
  lastName: string;
  initials: string;
  weeklyTarget: number;
  historyComplete: boolean;
}
export interface MembershipRecord {
  memberId: string;
  status: "active" | "paused" | "cancelled";
  planName: string;
}
export interface AttendanceEvent {
  id: string;
  memberId: string;
  occurredAt: string;
}
export interface MemberRepository {
  load(): Promise<DemoData>;
  saveTarget(memberId: string, target: number): Promise<void>;
}
export interface DemoData {
  members: MemberProfile[];
  memberships: MembershipRecord[];
  attendance: AttendanceEvent[];
}
