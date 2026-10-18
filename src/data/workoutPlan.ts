export interface StationExercise {
  name: string;
  instruction: string;
  /** Stable ID of an exercise already supported by the training log. */
  logExerciseId?: string;
}
export interface WorkoutStation {
  number: number;
  durationMinutes: 3;
  exercises: readonly StationExercise[];
}
export interface PlannedWorkout {
  id: string;
  dayOffsets: readonly [0 | 1 | 2, 3 | 4 | 5];
  day: string;
  stations: readonly WorkoutStation[];
}
const exercise = (
  name: string,
  instruction: string,
  logExerciseId?: string,
): StationExercise => ({ name, instruction, logExerciseId });
const station = (
  number: number,
  ...exercises: StationExercise[]
): WorkoutStation => ({ number, durationMinutes: 3, exercises });
/** Fictional station plans for preview; these are not the club's published workouts. */
export const weeklyWorkoutPlan: readonly PlannedWorkout[] = [
  {
    id: "monday",
    dayOffsets: [0, 3],
    day: "Mon/Thurs",
    stations: [
      station(
        1,
        exercise(
          "Back squat",
          "Controlled reps with a trainer-selected load.",
          "back-squat",
        ),
      ),
      station(
        2,
        exercise(
          "Jab–cross",
          "Practise clean combinations and reset your stance.",
        ),
      ),
      station(
        3,
        exercise("Rower", "Steady efforts with recovery between rounds."),
      ),
      station(
        4,
        exercise(
          "Bench press",
          "Focus on a smooth, controlled movement.",
          "bench-press",
        ),
      ),
      station(
        5,
        exercise(
          "Boxing footwork",
          "Move forwards, backwards and reset your guard.",
        ),
      ),
      station(
        6,
        exercise(
          "Bike intervals",
          "Alternate your working pace with an easy recovery.",
        ),
      ),
      station(
        7,
        exercise("Barbell row", "Keep each rep controlled.", "barbell-row"),
      ),
      station(
        8,
        exercise(
          "Pad combinations",
          "Work through combinations with your trainer.",
        ),
      ),
      station(
        9,
        exercise(
          "Core circuit",
          "Alternate dead bugs and a comfortable plank hold.",
        ),
      ),
    ],
  },
  {
    id: "tuesday",
    dayOffsets: [1, 4],
    day: "Tues/Fri",
    stations: [
      station(
        1,
        exercise(
          "Deadlift",
          "Practise a controlled hinge and reset each rep.",
          "deadlift",
        ),
      ),
      station(
        2,
        exercise(
          "Jab–cross–hook",
          "Build the combination slowly, then find your rhythm.",
        ),
      ),
      station(
        3,
        exercise("Step-ups", "Alternate legs on a suitable step height."),
      ),
      station(
        4,
        exercise(
          "Shoulder press",
          "Use a controlled press and lower.",
          "shoulder-press",
        ),
      ),
      station(
        5,
        exercise(
          "Defence & movement",
          "Practise slips and resets with trainer guidance.",
        ),
      ),
      station(
        6,
        exercise("Ski erg", "Work at your own pace and recover as needed."),
      ),
      station(
        7,
        exercise(
          "Front squat",
          "Keep your movement steady and controlled.",
          "front-squat",
        ),
      ),
      station(
        8,
        exercise(
          "Bag combinations",
          "Alternate short combinations and footwork.",
        ),
      ),
      station(
        9,
        exercise(
          "Core control",
          "Alternate side planks and controlled bird dogs.",
        ),
      ),
    ],
  },
  {
    id: "wednesday",
    dayOffsets: [2, 5],
    day: "Wed/Sat",
    stations: [
      station(
        1,
        exercise(
          "Back squat",
          "Choose your working reps with your trainer. Record each set in Log.",
          "back-squat",
        ),
      ),
      station(
        2,
        exercise(
          "Jab–cross & footwork",
          "Throw the combination, move and reset.",
        ),
      ),
      station(
        3,
        exercise(
          "Bike & recovery",
          "Alternate a comfortable effort with easy pedalling.",
        ),
      ),
      station(
        4,
        exercise(
          "Barbell row",
          "Focus on consistent technique across your sets.",
          "barbell-row",
        ),
      ),
      station(5, exercise("Pad work", "Follow the trainer’s combinations.")),
      station(
        6,
        exercise(
          "Rower intervals",
          "Keep your stroke controlled and recover as needed.",
        ),
      ),
      station(
        7,
        exercise(
          "Bench press",
          "Record the reps and weight for each set.",
          "bench-press",
        ),
      ),
      station(
        8,
        exercise(
          "Boxing combinations",
          "Combine punches and movement at your own pace.",
        ),
      ),
      station(
        9,
        exercise(
          "Core finish",
          "Alternate a plank variation and slow dead bugs.",
        ),
      ),
    ],
  },
];
