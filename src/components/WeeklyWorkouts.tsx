import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "./UI";
import { StationCarousel } from "./StationCarousel";
import { memberApi, MemberApiError } from "../member/api";
import {
  parsePublishedWorkout,
  workoutPlan,
  type PublishedWorkout,
} from "../domain/publishedWorkouts";
import { weeklyWorkoutPlan } from "../data/workoutPlan";
import { dateKey, formatDate, shiftDate } from "../domain/attendance";
export function WeeklyWorkouts({
  week,
  published = false,
}: {
  week: string;
  published?: boolean;
}) {
  const [feed, setFeed] = useState<
    Record<string, { workout?: PublishedWorkout; error?: string }>
  >({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!published) return;
    const controller = new AbortController();
    setFeed({});
    for (const [pair, plan] of weeklyWorkoutPlan.entries()) {
      const date = shiftDate(week, pair);
      void memberApi(`workouts?date=${date}`, undefined, controller.signal)
        .then((result) => {
          const workout = parsePublishedWorkout(result.workout, date);
          if (!controller.signal.aborted)
            setFeed((previous) => ({ ...previous, [plan.id]: { workout } }));
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          const dates = `${formatDate(date)} / ${formatDate(shiftDate(date, 3))}`;
          const message =
            error instanceof MemberApiError &&
            error.code === "workout_unpublished"
              ? `No published workout is available for ${dates}. Please ask your coach to publish and select the week beginning ${formatDate(week)} in the workout builder.`
              : error instanceof MemberApiError &&
                  error.code === "workout_overlap"
                ? `More than one published workout covers ${dates}. Please ask your coach to choose “Show in member app” in the workout builder.`
                : error instanceof MemberApiError && error.status === 401
                  ? "Please sign in again to view your workouts."
                  : `We couldn’t load the workout for ${dates}. Please try again. (${error instanceof MemberApiError && error.diagnostic ? error.diagnostic : "WORKOUT-CONNECTION"})`;
          setFeed((previous) => ({
            ...previous,
            [plan.id]: { error: message },
          }));
        });
    }
    return () => controller.abort();
  }, [week, published, retry]);
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
  const selectedPair = weeklyWorkoutPlan.findIndex((w) => w.id === selected);
  const entry = selected ? feed[selected] : undefined;
  const workout = published
    ? entry?.workout
      ? workoutPlan(entry.workout, selectedPair)
      : undefined
    : weeklyWorkoutPlan.find((w) => w.id === selected);
  return (
    <Card className="home-workouts">
      <div className="section-top">
        <h2>This week’s workout</h2>
        <span className="pill">{published ? "CLUB PLAN" : "DEMO PLAN"}</span>
      </div>
      {published && (
        <p className="small muted workout-week-label">
          Week beginning{" "}
          {formatDate(week, { day: "numeric", month: "long", year: "numeric" })}
        </p>
      )}
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
      {published && selected && !workout && (
        <div className="workout-feed-state" role="status">
          <p>{entry?.error ?? "Loading your club workout…"}</p>
          {entry?.error && (
            <button
              className="text-button"
              onClick={() => setRetry((v) => v + 1)}
            >
              Try again
            </button>
          )}
        </div>
      )}
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
          {published && entry?.workout && (
            <p className="small muted">
              {entry.workout.block} · Week {entry.workout.programWeek} ·
              Published workout
            </p>
          )}
          <StationCarousel key={workout.id} workout={workout} />
        </div>
      )}
      <p className="workout-plan-note">
        {published
          ? "Published by your HIIT Co. coaches. Repeated day pairs."
          : "Sample station workouts for preview. Your club’s published plan will appear here."}
      </p>
    </Card>
  );
}
