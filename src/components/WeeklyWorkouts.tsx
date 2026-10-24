import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "./UI";
import { StationCarousel } from "./StationCarousel";
import { weeklyWorkoutPlan } from "../data/workoutPlan";
import { dateKey, formatDate, shiftDate } from "../domain/attendance";
export function WeeklyWorkouts({ week }: { week: string }) {
  const detailId = useId();
  const [selected, setSelected] = useState<string | null>(() => {
    const day = new Date(dateKey(new Date()) + "T12:00:00Z").getUTCDay();
    const offset = day === 0 ? 5 : day - 1;
    return (
      weeklyWorkoutPlan.find((plan) =>
        plan.dayOffsets.some((d) => d === offset),
      )?.id ?? null
    );
  });
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
            aria-controls={detailId}
            onClick={() => setSelected(w.id === selected ? null : w.id)}
          >
            <span>{w.day}</span>
            <small className="workout-paired-dates">
              {w.dayOffsets.map((offset) => (
                <span key={offset}>{formatDate(shiftDate(week, offset))}</span>
              ))}
            </small>
            <ChevronDown size={14} />
          </button>
        ))}
      </div>
      {workout && (
        <div className="workout-plan-detail" id={detailId}>
          <h3>
            {workout.day}{" "}
            <span>
              {workout.dayOffsets
                .map((offset) => formatDate(shiftDate(week, offset)))
                .join(" / ")}
            </span>
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
