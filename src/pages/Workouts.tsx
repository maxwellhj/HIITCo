import { useState } from "react";
import { ArrowRight, Dumbbell, Flame, Sparkles, Zap } from "lucide-react";
import { Card } from "../components/UI";
export function Workouts() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const workouts = [
    {
      title: "Strength foundations",
      tag: "STRENGTH",
      time: "10 MIN",
      icon: Dumbbell,
      description: "Move well. Build strength.",
      moves: [
        "2 minutes of easy bodyweight squats and shoulder circles to warm up.",
        "3 rounds: 8 controlled squats, 8 incline press-ups and 10 alternating reverse lunges.",
        "Rest as needed. Ask your trainer to help with technique and suitable variations.",
      ],
    },
    {
      title: "Find your fighting rhythm",
      tag: "BOXING",
      time: "10 MIN",
      icon: Zap,
      description: "A clear head. A stronger you.",
      moves: [
        "Start with 2 minutes of light footwork and gentle shadowboxing.",
        "Alternate 45 seconds of jab–cross shadowboxing with 45 seconds of easy movement for 6 rounds.",
        "Keep your shoulders relaxed. Ask your trainer before moving to bags or pads.",
      ],
    },
    {
      title: "The feel-good finisher",
      tag: "HIIT",
      time: "10 MIN",
      icon: Flame,
      description: "Your pace. Your best effort.",
      moves: [
        "Warm up with 2 minutes of marching and gentle step-ups.",
        "Complete 6 rounds of 30 seconds brisk step-ups followed by 30 seconds easy marching.",
        "Cool down for 2 minutes. Choose a comfortable pace and stop if something hurts.",
      ],
    },
  ];
  return (
    <>
      <div className="workout-intro">
        <Zap size={28} />
        <div>
          <h2>No bookings. Just show up.</h2>
          <p>
            Our trainers guide your 30-minute session when you arrive during
            club opening hours.
          </p>
        </div>
      </div>
      <p className="small muted">
        Demo training examples · These are sample content, not your personalised
        training programme.
      </p>
      <div className="workout-list">
        {workouts.map(
          ({ title, tag, time, icon: Icon, description, moves }) => (
            <Card key={title}>
              <div className="workout-icon">
                <Icon size={36} />
              </div>
              <div className="workout-content">
                <span className="small-caps blue">
                  {tag} <span className="muted"> / {time}</span>
                </span>
                <h2>{title}</h2>
                <p>{description}</p>
                <button
                  className="text-button"
                  onClick={() => setExpanded(expanded === title ? null : title)}
                  aria-expanded={expanded === title}
                >
                  {expanded === title ? "Close session" : "Explore session"}{" "}
                  <ArrowRight size={17} />
                </button>
                {expanded === title && (
                  <ol className="session-steps">
                    {moves.map((move) => (
                      <li key={move}>{move}</li>
                    ))}
                  </ol>
                )}
              </div>
            </Card>
          ),
        )}
      </div>
      <Card className="future-note">
        <Sparkles />
        <div>
          <h3>Your trainer’s library is coming.</h3>
          <p>
            Personalised programmes and video guidance will live here. For now,
            talk to your trainer on the floor.
          </p>
        </div>
      </Card>
    </>
  );
}
