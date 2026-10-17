export interface PlannedWorkout {
  id: string;
  dayOffset: 0 | 1 | 2;
  day: string;
  title: string;
  focus: string;
  details: string[];
}
/** Sample content only, not a published HIIT Co. programme. */
export const weeklyWorkoutPlan: readonly PlannedWorkout[] = [
  {
    id: "monday-box",
    dayOffset: 0,
    day: "Monday",
    title: "Box",
    focus: "Technique & combinations",
    details: [
      "Boxing stance and footwork",
      "Jab–cross combinations with trainer guidance",
      "A conditioning finish at your pace",
    ],
  },
  {
    id: "tuesday-lift",
    dayOffset: 1,
    day: "Tuesday",
    title: "Lift",
    focus: "Lower-body strength",
    details: [
      "Squat technique and controlled strength work",
      "Hinge and core movement practice",
      "Trainer-supported adjustments for your level",
    ],
  },
  {
    id: "wednesday-sweat",
    dayOffset: 2,
    day: "Wednesday",
    title: "Sweat",
    focus: "Full-body conditioning",
    details: [
      "A mix of full-body conditioning movements",
      "Intervals with time to recover",
      "Options to work at your own pace",
    ],
  },
];
