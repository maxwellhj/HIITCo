import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "./UI";
import { StationCarousel } from "./StationCarousel";
import { weeklyWorkoutPlan } from "../data/workoutPlan";
import { formatDate, shiftDate } from "../domain/attendance";
export function WeeklyWorkouts({ week }: { week: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const workout = weeklyWorkoutPlan.find((w) => w.id === selected);
  return (
    <Card className="home-workouts">
      <div className="section-top">
        <h2>This week’s workout</h2>
        <span className="pill">DEMO PLAN</span>
      </div>
      <div
        className="workout-slate"
        role="group"
        aria-label="This week’s workouts"
      >
        {weeklyWorkoutPlan.map((w) => (
          <button
            key={w.id}
            aria-pressed={w.id === selected}
            aria-expanded={w.id === selected}
            aria-controls="selected-workout-plan"
            onClick={() => setSelected(w.id === selected ? null : w.id)}
          >
            <span>{w.day}</span>
            <small>{formatDate(shiftDate(week, w.dayOffset))}</small>
            <ChevronDown size={14} />
          </button>
        ))}
      </div>
      {workout && (
        <div className="workout-plan-detail" id="selected-workout-plan">
          <h3>
            {workout.day}{" "}
            <span>{formatDate(shiftDate(week, workout.dayOffset))}</span>
          </h3>
          <StationCarousel key={workout.id} workout={workout} />
        </div>
      )}
      <p className="workout-plan-note">
        Sample station workouts for preview. Your club’s published plan will
        appear here.
      </p>
    </Card>
  );
}
