import { dateKey } from "../domain/attendance";
import {
  emptyTrainingLog,
  validateSession,
  type TrainingLogData,
} from "../domain/training";
export const trainingStorageKey = (memberId: string) =>
  `hiit-co.demo.training-log.v1.${memberId}`;

/** Local demo persistence only; a member-specific key is not access control. */
export function readTrainingLog(memberId: string): TrainingLogData {
  const raw = localStorage.getItem(trainingStorageKey(memberId));
  if (raw === null) return emptyTrainingLog();
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== "object")
    throw Error("Your saved log could not be read.");
  const log = data as TrainingLogData;
  if (
    log.version !== 1 ||
    !Array.isArray(log.exercises) ||
    !log.exercises.length ||
    !Array.isArray(log.sessions)
  )
    throw Error("Your saved log has an unsupported format.");
  const exerciseIds = new Set<string>();
  for (const exercise of log.exercises) {
    if (
      typeof exercise?.id !== "string" ||
      !exercise.id ||
      typeof exercise.name !== "string" ||
      !exercise.name.trim() ||
      exercise.name.length > 60 ||
      exerciseIds.has(exercise.id)
    )
      throw Error("A saved exercise could not be read.");
    exerciseIds.add(exercise.id);
  }
  const ids = new Set<string>();
  for (const session of log.sessions) {
    if (
      !session ||
      typeof session.id !== "string" ||
      typeof session.exerciseId !== "string" ||
      typeof session.date !== "string" ||
      typeof session.createdAt !== "string"
    )
      throw Error("A saved session could not be read.");
    validateSession(session, dateKey(new Date()));
    if (!exerciseIds.has(session.exerciseId) || ids.has(session.id))
      throw Error("A saved session has an invalid exercise or duplicate ID.");
    ids.add(session.id);
  }
  return log;
}
export function writeTrainingLog(memberId: string, data: TrainingLogData) {
  // Mutations are written before React state changes; a storage failure never reports success.
  localStorage.setItem(trainingStorageKey(memberId), JSON.stringify(data));
}
