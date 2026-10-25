import {
  defaultExercises,
  type Exercise,
  type TrainingLogData,
} from "./training";

export const canLogStation = (station: number) =>
  [2, 3, 7, 8].includes(station);
// Stable movement identities keep progression independent of changing reps/instructions.
const movements: [string, string, string][] = [
  ["db-box-step-up", "DB box step ups", "DB\\s+Box\\s+Step[ -]*ups?"],
  ["kb-box-step-up", "KB box step ups", "KB\\s+(?:Box\\s+)?Step[ -]*ups?"],
  ["sb-step-up", "SB step ups", "SB\\s+(?:Box\\s+)?Step[ -]*ups?"],
  ["step-up", "Step ups", "(?:Box\\s+)?Step[ -]*ups?"],
  [
    "single-arm-row",
    "Single-arm row",
    "(?:SA\\s+Rows?|Single[ -]*arm\\s+(?:DB\\s+)?Rows?)",
  ],
  [
    "chest-supported-row",
    "Chest supported row",
    "Chest\\s+(?:Supported|Supp)\\s+Rows?",
  ],
  ["renegade-row", "Renegade row", "(?:DB\\s+)?Renegade\\s+Rows?"],
  ["landmine-row", "Landmine row", "(?:LM|Landmine)\\s+Rows?"],
  ["trx-row", "TRX row", "TRX\\s+Rows?"],
  ["pendlay-row", "Pendlay row", "Pendlay\\s+Rows?"],
  ["db-bench-press", "DB bench press", "(?:DB|Dumbbell)\\s+Bench\\s+Press"],
  [
    "incline-chest-press",
    "Incline chest press",
    "Incline\\s+(?:DB\\s+)?(?:Chest|Bench)\\s+Press",
  ],
  ["db-chest-press", "DB chest press", "DB\\s+Chest\\s+Press"],
  [
    "standing-shoulder-press",
    "Standing shoulder press",
    "Standing\\s+Shoulder\\s+Press",
  ],
  [
    "seated-shoulder-press",
    "Seated shoulder press",
    "Seated\\s+Shoulder\\s+Press",
  ],
  [
    "half-kneeling-press",
    "Half kneeling press",
    "Half\\s+Kneeling\\s+(?:Shoulder|KB)\\s+Press",
  ],
  ["arnold-press", "Arnold press", "(?:Seated\\s+)?Arnold\\s+Press"],
  ["military-press", "Military press", "(?:BB\\s+)?Military\\s+Press"],
  ["db-front-squat", "DB front squat", "DB\\s+Front\\s+Squats?"],
  [
    "landmine-front-squat",
    "Landmine front squat",
    "(?:LM|Landmine)\\s+Front\\s+Squats?",
  ],
  ["goblet-tempo-squat", "Goblet tempo squat", "Goblet\\s+Tempo\\s+Squats?"],
  ["goblet-squat", "Goblet squat", "Goblet\\s+Squats?"],
  [
    "goblet-one-and-half-squat",
    "Goblet 1.5 squat",
    "Goblet\\s+1[.]5\\s+Squats?",
  ],
  ["landmine-hack-squat", "Landmine hack squat", "LM\\s+Hack\\s+Squats?"],
  ["box-squat", "Box squat", "Box\\s+Squats?"],
  ["hack-squat", "Hack squat", "Hack\\s+Squats?"],
  [
    "db-bulgarian-split-squat",
    "DB Bulgarian split squat",
    "DB\\s+Bulgarian\\s+(?:SS|Split\\s+Squats?)",
  ],
  ["db-static-lunge", "DB static lunge", "DB\\s+Static\\s+Lunges?"],
  [
    "trap-bar-deadlift",
    "Trap bar deadlift",
    "(?:Trap\\s*Bar|TB)\\s+Deadlifts?",
  ],
  ["db-rdl", "DB Romanian deadlift", "DB\\s+RDL(?:['’]?s)?"],
  ["barbell-rdl", "Barbell Romanian deadlift", "BB\\s+RDL(?:['’]?s)?"],
  [
    "b-stance-rdl",
    "B-stance Romanian deadlift",
    "B[ -]?stance\\s+RDL(?:['’]?s)?",
  ],
  [
    "romanian-deadlift",
    "Romanian deadlift",
    "(?:Romanian\\s+Deadlifts?|RDL(?:['’]?s)?)",
  ],
  [
    "landmine-clean-press",
    "Landmine clean & press",
    "(?:LM|Landmine)\\s+Clean\\s*(?:&|and)\\s*Press",
  ],
  ["kb-clean-press", "KB clean & press", "KB\\s+Clean\\s*(?:&|and)\\s*Press"],
  ["kb-single-arm-swing", "KB single-arm swing", "KB\\s+SA\\s+Swings?"],
  ["kb-squat-press", "KB squat press", "KB\\s+Squats?\\s+Press"],
  ["kb-swing", "KB swing", "KB\\s+Swings?"],
  ["kb-high-pull", "KB high pull", "KB\\s+High\\s+Pulls?"],
  ["kb-push-press", "KB push press", "KB\\s+Push\\s+Press"],
  ["db-push-press", "DB push press", "DB\\s+Push\\s+Press"],
  ["sb-clean", "SB clean", "SB\\s+Cleans?"],
  ["plate-ground-to-overhead", "Plate ground to overhead", "Plate\\s+G2OH"],
  ["sled-push-pull", "Sled push/pull", "Sled\\s+Push\\s*(?:/|and)?\\s*Pull"],
  ["sled-push", "Sled push", "(?:Heavy\\s+)?Sled\\s+Push"],
  ["chest-fly", "Chest fly", "Chest\\s+Fl(?:ies|y|ys)"],
  [
    "lying-tricep-extension",
    "Lying tricep extension",
    "Lying\\s+Tricep\\s+Ext(?:ensions?)?",
  ],
  [
    "overhead-tricep-extension",
    "Overhead tricep extension",
    "(?:OH|Overhead)\\s+Tricep\\s+Ext(?:ensions?)?",
  ],
  [
    "trx-tricep-extension",
    "TRX tricep extension",
    "TRX\\s+(?:Tricep\\s+)?Ext(?:ensions?)?",
  ],
  ["band-face-pull", "Band face pull", "Band\\s+Face\\s+Pulls?"],
  ["kb-press", "KB press", "KB\\s+Press"],
  ["landmine-press", "Landmine press", "LM\\s+Press"],
  ["landmine-squat-press", "Landmine squat press", "LM\\s+Squat\\s+Press"],
  [
    "sb-reverse-lunge",
    "SB reverse lunge from step",
    "SB\\s+Reverse\\s+Lunge(?:\\s+from\\s+step)?",
  ],
  ["back-squat", "Back squat", "Back\\s+Squats?"],
  ["front-squat", "Front squat", "Front\\s+Squats?"],
  ["deadlift", "Deadlift", "(?:BB\\s+)?Deadlifts?"],
  ["bench-press", "Bench press", "Bench\\s+Press"],
  ["shoulder-press", "Shoulder press", "Shoulder\\s+Press"],
  ["barbell-row", "Barbell row", "(?:Barbell|BB)\\s+Rows?"],
];
export interface WorkoutExerciseMatch {
  start: number;
  end: number;
  exercise: Exercise;
}
export function workoutExerciseMatches(
  text: string,
  station: number,
): WorkoutExerciseMatch[] {
  if (!canLogStation(station)) return [];
  const candidates: WorkoutExerciseMatch[] = [];
  for (const [id, name, pattern] of movements) {
    for (const match of text.matchAll(
      new RegExp(`\\b(?:${pattern})(?=$|[^A-Za-z])`, "gi"),
    )) {
      candidates.push({
        start: match.index!,
        end: match.index! + match[0].length,
        exercise: { id, name },
      });
    }
  }
  candidates.sort((a, b) => a.start - b.start || b.end - a.end);
  const result: WorkoutExerciseMatch[] = [];
  for (const candidate of candidates)
    if (!result.length || candidate.start >= result.at(-1)!.end)
      result.push(candidate);
  return result;
}
export function prepareWorkoutExercise(
  log: TrainingLogData,
  id: string,
): { log: TrainingLogData; exerciseId: string } {
  const catalog = movements.find((m) => m[0] === id);
  const known = catalog
    ? { id: catalog[0], name: catalog[1] }
    : defaultExercises.find((e) => e.id === id);
  if (!known) return { log, exerciseId: id };
  const existing =
    log.exercises.find((e) => e.id === id) ??
    log.exercises.find((e) => {
      const name = e.name.trim();
      if (name.toLowerCase() === known.name.toLowerCase()) return true;
      const matches = workoutExerciseMatches(name, 2);
      return (
        matches.length === 1 &&
        matches[0].start === 0 &&
        matches[0].end === name.length &&
        matches[0].exercise.id === id
      );
    });
  if (existing) return { log, exerciseId: existing.id };
  // Opening a link prepares a form only. It is persisted with the first saved sets.
  return {
    log: { ...log, exercises: [...log.exercises, known] },
    exerciseId: id,
  };
}
