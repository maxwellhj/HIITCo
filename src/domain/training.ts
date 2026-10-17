export interface Exercise {
  id: string;
  name: string;
}
export interface TrainingSet {
  reps: number;
  weight: number;
}
export interface TrainingSession {
  id: string;
  exerciseId: string;
  date: string;
  sets: TrainingSet[];
  createdAt: string;
}
export interface TrainingLogData {
  version: 1;
  exercises: Exercise[];
  sessions: TrainingSession[];
}
export const defaultExercises: Exercise[] = [
  { id: "back-squat", name: "Back squat" },
  { id: "deadlift", name: "Deadlift" },
  { id: "bench-press", name: "Bench press" },
  { id: "front-squat", name: "Front squat" },
  { id: "shoulder-press", name: "Shoulder press" },
  { id: "barbell-row", name: "Barbell row" },
];
export function emptyTrainingLog(): TrainingLogData {
  return {
    version: 1,
    exercises: defaultExercises.map((e) => ({ ...e })),
    sessions: [],
  };
}
export function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date + "T12:00:00Z").toISOString().slice(0, 10) === date
  );
}
export function validateSession(session: TrainingSession, today: string) {
  if (
    !session.id ||
    !session.exerciseId ||
    !Number.isFinite(Date.parse(session.createdAt))
  )
    throw Error("This session could not be read.");
  if (!validDate(session.date) || session.date > today)
    throw Error("Choose a valid workout date, today or earlier.");
  if (
    !Array.isArray(session.sets) ||
    session.sets.length < 1 ||
    session.sets.length > 50
  )
    throw Error("Record between 1 and 50 sets.");
  for (const set of session.sets) {
    if (!Number.isInteger(set.reps) || set.reps < 1 || set.reps > 200)
      throw Error("Reps must be a whole number from 1 to 200.");
    if (!Number.isFinite(set.weight) || set.weight < 0 || set.weight > 1000)
      throw Error("Weight must be from 0 to 1,000 kg.");
  }
}
export function sessionVolume(sets: readonly TrainingSet[]) {
  return (
    Math.round(
      sets.reduce((total, set) => total + set.reps * set.weight, 0) * 100,
    ) / 100
  );
}
export function heaviestSet(sets: readonly TrainingSet[]) {
  return Math.max(0, ...sets.map((set) => set.weight));
}
export function exerciseProgress(
  sessions: readonly TrainingSession[],
  exerciseId: string,
) {
  const history = sessions
    .filter((s) => s.exerciseId === exerciseId)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  const points = history.map((s) => ({
    id: s.id,
    date: s.date,
    weight: heaviestSet(s.sets),
    volume: sessionVolume(s.sets),
  }));
  return {
    history,
    points,
    bestWeight: Math.max(0, ...points.map((p) => p.weight)),
    bestVolume: Math.max(0, ...points.map((p) => p.volume)),
    latestVolume: points.at(-1)?.volume ?? 0,
    weightChange:
      points.length > 1 ? points.at(-1)!.weight - points[0].weight : null,
    volumeChange:
      points.length > 1
        ? Math.round((points.at(-1)!.volume - points[0].volume) * 100) / 100
        : null,
  };
}
