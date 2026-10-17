import { Play } from "lucide-react";
import { Card } from "../components/UI";
import { BoxingGloves } from "../components/BoxingGloves";

export function Skills() {
  return (
    <Card className="skills-library">
      <div className="skills-preview" aria-hidden="true">
        <BoxingGloves size={56} />
        <span className="skills-play">
          <Play size={18} />
        </span>
      </div>
      <h2>Your skills library is coming.</h2>
      <p>
        A space for technique videos and step-by-step how-tos from your HIIT Co.
        trainers.
      </p>
      <div className="skills-topics" aria-label="Planned video topics">
        <span className="pill">BOXING</span>
        <span className="pill">STRENGTH</span>
        <span className="pill">HOW-TOS</span>
      </div>
      <p className="small">
        No videos added yet. In the meantime, ask your trainer on the floor.
      </p>
    </Card>
  );
}
