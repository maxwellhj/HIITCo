import { validDate } from "./training";
import { weekKey, shiftDate } from "./attendance";
export const chowUnits = [
  "sets",
  "reps",
  "rounds",
  "calories",
  "kg",
  "metres",
  "points",
] as const;
export type ChowUnit = (typeof chowUnits)[number];
export interface ChowChallenge {
  id: string;
  block: string;
  weekBeginning: string;
  programWeek: number;
  station: number;
  workout: string;
  blockScoped?: true;
  blockStart?: string;
}
export interface ChowScore {
  id: string;
  challengeId: string;
  date: string;
  score: number;
  unit: ChowUnit;
  createdAt: string;
}
export interface ChowLogData {
  version: 1;
  challenges: ChowChallenge[];
  scores: ChowScore[];
}
export const emptyChowLog = (): ChowLogData => ({
  version: 1,
  challenges: [],
  scores: [],
});
export async function chowChallenge(
  value: Omit<ChowChallenge, "id">,
): Promise<ChowChallenge> {
  if (value.blockScoped !== undefined && value.blockScoped !== true)
    throw Error("Invalid CHOW scope");
  const normalized = {
    block: value.block.trim(),
    weekBeginning: value.weekBeginning,
    programWeek: value.programWeek,
    station: value.station,
    workout: value.workout.replace(/\r\n/g, "\n").trim(),
    ...(value.blockScoped
      ? { blockScoped: true as const, blockStart: value.blockStart }
      : {}),
  };
  if (
    (normalized.blockScoped &&
      (!normalized.blockStart ||
        !validDate(normalized.blockStart) ||
        weekKey(normalized.blockStart) !== normalized.blockStart)) ||
    !normalized.block ||
    normalized.block.length > 100 ||
    !validDate(normalized.weekBeginning) ||
    weekKey(normalized.weekBeginning) !== normalized.weekBeginning ||
    !Number.isInteger(normalized.programWeek) ||
    normalized.programWeek < 1 ||
    normalized.programWeek > 999 ||
    !Number.isInteger(normalized.station) ||
    normalized.station < 1 ||
    normalized.station > 9 ||
    !normalized.workout ||
    normalized.workout.length > 6000
  )
    throw Error("Invalid CHOW challenge");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify(
        normalized.blockScoped
          ? [
              "hiitco.chow.block.v1",
              normalized.block,
              normalized.blockStart,
              normalized.station,
              normalized.workout,
            ]
          : [
              "hiitco.chow.v1",
              normalized.block,
              normalized.weekBeginning,
              normalized.programWeek,
              normalized.station,
              normalized.workout,
            ],
      ),
    ),
  );
  return {
    ...normalized,
    id: Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
export async function parseChowLog(
  value: unknown,
  today: string,
): Promise<ChowLogData> {
  if (!value || typeof value !== "object") throw Error("Invalid CHOW log");
  const log = value as ChowLogData;
  if (
    log.version !== 1 ||
    !Array.isArray(log.challenges) ||
    log.challenges.length > 100 ||
    !Array.isArray(log.scores) ||
    log.scores.length > 1000
  )
    throw Error("Invalid CHOW log");
  const challenges = await Promise.all(
    log.challenges.map(async (c) => {
      if (
        !c ||
        typeof c.id !== "string" ||
        typeof c.block !== "string" ||
        typeof c.weekBeginning !== "string" ||
        typeof c.workout !== "string"
      )
        throw Error("Invalid CHOW challenge");
      const normalized = await chowChallenge(c);
      if (c.id !== normalized.id) throw Error("Invalid CHOW identity");
      return normalized;
    }),
  );
  const byId = new Map(challenges.map((c) => [c.id, c]));
  if (byId.size !== challenges.length) throw Error("Duplicate CHOW challenge");
  const ids = new Set<string>();
  const scores = log.scores.map((s) => {
    const c = s && byId.get(s.challengeId);
    if (
      !s ||
      typeof s.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(s.id) ||
      ids.has(s.id) ||
      !c ||
      typeof s.date !== "string" ||
      !validDate(s.date) ||
      s.date > today ||
      s.date < (c.blockScoped ? c.blockStart! : c.weekBeginning) ||
      (!c.blockScoped && s.date > shiftDate(c.weekBeginning, 6)) ||
      !Number.isFinite(s.score) ||
      s.score < 0 ||
      s.score > 1000000 ||
      Math.abs(s.score * 100 - Math.round(s.score * 100)) > 0.000001 ||
      !chowUnits.includes(s.unit) ||
      typeof s.createdAt !== "string" ||
      !Number.isFinite(Date.parse(s.createdAt))
    )
      throw Error("Invalid CHOW score");
    ids.add(s.id);
    return {
      id: s.id,
      challengeId: s.challengeId,
      date: s.date,
      score: s.score,
      unit: s.unit,
      createdAt: s.createdAt,
    };
  });
  return { version: 1, challenges, scores };
}
export function bestChowScore(
  scores: readonly ChowScore[],
  challengeId: string,
  unit: ChowUnit,
) {
  const matching = scores.filter(
    (s) => s.challengeId === challengeId && s.unit === unit,
  );
  return matching.length ? Math.max(...matching.map((s) => s.score)) : null;
}
