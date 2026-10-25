import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import type { PlannedWorkout } from "../data/workoutPlan";

import {
  canLogStation,
  workoutExerciseMatches,
} from "../domain/workoutExercises";
const PER_PAGE = 3;
function StationText({ text, station }: { text: string; station: number }) {
  const matches = workoutExerciseMatches(text, station);
  const parts: (string | React.ReactElement)[] = [];
  let from = 0;
  for (const match of matches) {
    parts.push(text.slice(from, match.start));
    parts.push(
      <a
        key={match.start}
        className="station-inline-exercise"
        href={`#log/${match.exercise.id}`}
        aria-label={`Log ${match.exercise.name}`}
      >
        {text.slice(match.start, match.end)}
      </a>,
    );
    from = match.end;
  }
  parts.push(text.slice(from));
  return <p className="published-station-text">{parts}</p>;
}
export function StationCarousel({ workout }: { workout: PlannedWorkout }) {
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null),
    current = useRef(0);
  const count = workout.stations.length;
  const pages = Array.from({ length: Math.ceil(count / PER_PAGE) }, (_, i) =>
    workout.stations.slice(i * PER_PAGE, (i + 1) * PER_PAGE),
  );
  const range = (index: number) =>
    `${pages[index][0].number}–${pages[index].at(-1)!.number}`;
  function goTo(index: number) {
    const next = Math.max(0, Math.min(pages.length - 1, index));
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
        <div>
          <button
            type="button"
            className="icon-button"
            aria-label="Previous three stations"
            disabled={active === 0}
            onClick={() => goTo(active - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span aria-live="polite">
            {range(active)} / {count}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Next three stations"
            disabled={active === pages.length - 1}
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
          const el = event.currentTarget;
          if (!el.clientWidth) return;
          const index = Math.max(
            0,
            Math.min(
              pages.length - 1,
              Math.round(el.scrollLeft / el.clientWidth),
            ),
          );
          current.current = index;
          setActive(index);
        }}
      >
        {pages.map((stations, page) => (
          <div
            className="station-page"
            key={stations[0].number}
            role="group"
            aria-label={`Stations ${range(page)}`}
            aria-hidden={active !== page}
            inert={active !== page}
          >
            {stations.map((station) => (
              <article
                key={station.number}
                className="station-slide"
                aria-label={`Station ${station.number} of ${count}`}
              >
                <div className="station-slide-heading">
                  <h4>Station {station.number}</h4>
                </div>
                {station.chow && <span className="pill">CHOW</span>}
                {station.workoutText !== undefined && (
                  <StationText
                    text={station.workoutText || "Workout details coming soon."}
                    station={station.number}
                  />
                )}
                {station.workoutText === undefined && (
                  <ul>
                    {station.exercises.map((exercise, i) => (
                      <li key={`${exercise.name}-${i}`}>
                        {exercise.logExerciseId &&
                        canLogStation(station.number) ? (
                          <a
                            className="station-exercise-link"
                            href={`#log/${encodeURIComponent(exercise.logExerciseId)}`}
                            aria-label={`Log ${exercise.name}`}
                          >
                            <strong>{exercise.name}</strong>
                            <Pencil size={13} />
                          </a>
                        ) : (
                          <strong className="station-movement">
                            {exercise.name}
                          </strong>
                        )}
                        <p>{exercise.instruction}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        ))}
      </div>
      <div
        className="station-picker"
        role="group"
        aria-label="Choose station group"
      >
        {pages.map((stations, index) => (
          <button
            key={stations[0].number}
            type="button"
            aria-label={`Stations ${range(index)}`}
            aria-pressed={active === index}
            onClick={() => goTo(index)}
          >
            {range(index)}
          </button>
        ))}
      </div>
      <p className="station-swipe-hint">
        Swipe to see the next three stations. Tap underlined exercises to log
        your sets.
      </p>
    </div>
  );
}
