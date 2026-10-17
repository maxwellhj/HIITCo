import { useState } from "react";
import { formatDate } from "../domain/attendance";
import type { exerciseProgress } from "../domain/training";
type Points = ReturnType<typeof exerciseProgress>["points"];
const number = (value: number) =>
  value.toLocaleString("en-NZ", { maximumFractionDigits: 2 });
export function TrainingChart({ points }: { points: Points }) {
  const [metric, setMetric] = useState<"weight" | "volume">("weight");
  const recent = points.slice(-12),
    max = Math.max(1, ...recent.map((p) => p[metric]));
  const x = (i: number) =>
    recent.length === 1 ? 260 : 52 + (i * 416) / (recent.length - 1);
  const y = (value: number) => 180 - (value / max) * 140;
  const label = metric === "weight" ? "Heaviest set" : "Total volume";
  return (
    <section className="training-chart" aria-labelledby="training-chart-title">
      <div className="section-top">
        <h2 id="training-chart-title">Your progress</h2>
        <div className="chart-toggle" role="group" aria-label="Chart metric">
          <button
            type="button"
            aria-pressed={metric === "weight"}
            onClick={() => setMetric("weight")}
          >
            Weight
          </button>
          <button
            type="button"
            aria-pressed={metric === "volume"}
            onClick={() => setMetric("volume")}
          >
            Volume
          </button>
        </div>
      </div>
      <p className="chart-explanation">
        {metric === "weight"
          ? "Heaviest weight used in a set each session (kg)."
          : "Total reps × weight across all sets each session (kg)."}
      </p>
      {!recent.length ? (
        <div className="training-chart-empty">
          <p>Your first session starts the chart.</p>
          <span>Record a workout below to see your progress.</span>
        </div>
      ) : (
        <>
          <svg
            viewBox="0 0 500 225"
            role="img"
            aria-label={`${label} over ${recent.length} session${recent.length === 1 ? "" : "s"}. Exact values are in session history below.`}
          >
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line
                  x1="52"
                  x2="468"
                  y1={y(max * f)}
                  y2={y(max * f)}
                  stroke="#e3e6e9"
                />
                <text
                  x="43"
                  y={y(max * f) + 4}
                  textAnchor="end"
                  fill="#63676d"
                  fontSize="10"
                >
                  {max * f >= 10000
                    ? new Intl.NumberFormat("en-NZ", {
                        notation: "compact",
                        maximumFractionDigits: 1,
                      }).format(max * f)
                    : number(max * f)}
                </text>
              </g>
            ))}
            {recent.length > 1 && (
              <polyline
                points={recent
                  .map((p, i) => `${x(i)},${y(p[metric])}`)
                  .join(" ")}
                fill="none"
                stroke="#567e9c"
                strokeWidth="3"
                strokeLinejoin="round"
              />
            )}
            {recent.map((p, i) => (
              <g key={p.id}>
                <circle
                  cx={x(i)}
                  cy={y(p[metric])}
                  r="5"
                  fill="#96bfe1"
                  stroke="#fff"
                  strokeWidth="2"
                >
                  <title>
                    {formatDate(p.date)}: {number(p[metric])} kg
                  </title>
                </circle>
                {(i === 0 || i === recent.length - 1) && (
                  <text
                    x={x(i)}
                    y="208"
                    textAnchor="middle"
                    fill="#63676d"
                    fontSize="11"
                  >
                    {formatDate(p.date)}
                  </text>
                )}
              </g>
            ))}
          </svg>
          <p className="small muted">
            {recent.length === 1
              ? "Add another session to see the trend."
              : "Latest 12 sessions · Points are spaced by session, not days."}
          </p>
        </>
      )}
    </section>
  );
}
