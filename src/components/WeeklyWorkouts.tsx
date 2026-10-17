import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "./UI";
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
            onClick={() => setSelected(w.id === selected ? null : w.id)}
          >
            <span>{w.day}</span>
            <small>{formatDate(shiftDate(week, w.dayOffset))}</small>
            <strong>{w.title}</strong>
            <span className="workout-focus">{w.focus}</span>
            <ChevronDown size={13} />
          </button>
        ))}
      </div>
      {workout && (
        <div className="workout-plan-detail" aria-live="polite">
          <h3>
            {workout.day} · {workout.title}
          </h3>
          <ul>
            {workout.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="workout-plan-note">
        Sample workouts for preview. Your club’s published plan will appear
        here.
      </p>
    </Card>
  );
}
