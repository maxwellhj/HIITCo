import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Pencil } from "lucide-react";
import type { PlannedWorkout } from "../data/workoutPlan";

export function StationCarousel({ workout }: { workout: PlannedWorkout }) {
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null),
    current = useRef(0);
  const count = workout.stations.length;
  function goTo(index: number) {
    const next = Math.max(0, Math.min(count - 1, index));
    current.current = next;
    setActive(next);
    track.current?.scrollTo({
      left: next * track.current.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      element.scrollTo({
        left: current.current * element.clientWidth,
        behavior: "instant",
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="station-carousel">
      <div className="station-toolbar">
        <span>
          <Clock size={14} />
          3-minute rounds
        </span>
        <div>
          <button
            type="button"
            className="icon-button"
            aria-label="Previous station"
            disabled={active === 0}
            onClick={() => goTo(active - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span aria-live="polite">
            {active + 1} / {count}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Next station"
            disabled={active === count - 1}
            onClick={() => goTo(active + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div
        className="station-track"
        ref={track}
        role="region"
        aria-roledescription="carousel"
        aria-label={`${workout.day} workout stations`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            goTo(active + (event.key === "ArrowRight" ? 1 : -1));
          }
        }}
        onScroll={(event) => {
          const element = event.currentTarget;
          if (!element.clientWidth) return;
          const index = Math.max(
            0,
            Math.min(
              count - 1,
              Math.round(element.scrollLeft / element.clientWidth),
            ),
          );
          current.current = index;
          setActive(index);
        }}
      >
        {workout.stations.map((station, index) => (
          <article
            key={station.number}
            className="station-slide"
            aria-label={`Station ${station.number} of ${count}`}
            aria-hidden={active !== index}
            inert={active !== index}
          >
            <div className="station-slide-heading">
              <h4>Station {station.number}</h4>
              <span>{station.durationMinutes} min</span>
            </div>
            <ul>
              {station.exercises.map((exercise, i) => (
                <li key={`${exercise.name}-${i}`}>
                  {exercise.logExerciseId ? (
                    <a
                      className="station-exercise-link"
                      href={`#log/${encodeURIComponent(exercise.logExerciseId)}`}
                      aria-label={`Log ${exercise.name}`}
                    >
                      <strong>{exercise.name}</strong>
                      <Pencil size={16} />
                    </a>
                  ) : (
                    <strong>{exercise.name}</strong>
                  )}
                  <p>{exercise.instruction}</p>
                  {exercise.logExerciseId && (
                    <span className="station-log-hint">
                      Tap the exercise to log weight, reps & sets.
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <div className="station-picker" role="group" aria-label="Choose station">
        {workout.stations.map((station, index) => (
          <button
            key={station.number}
            type="button"
            aria-label={`Station ${station.number}`}
            aria-pressed={active === index}
            onClick={() => goTo(index)}
          >
            {station.number}
          </button>
        ))}
      </div>
      <p className="station-swipe-hint">
        Swipe left or right to explore all 9 stations.
      </p>
    </div>
  );
}
