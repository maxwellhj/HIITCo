import { MessageCircle } from "lucide-react";
import { Card } from "../components/UI";
export function Messages() {
  return (
    <>
      <Card className="message-card">
        <span className="avatar">HC</span>
        <div>
          <div className="section-top">
            <span className="small-caps blue">THE HIIT CO. TEAM</span>
            <span className="pill">DEMO ANNOUNCEMENT</span>
          </div>
          <h2>Good things start with showing up.</h2>
          <p>
            Some days you’ll feel ready to take on anything. Other days, walking
            through the door is the win. We’re here for both.
          </p>
          <p>
            No booking needed. Just drop in during our opening hours, and we’ll
            help you make your next 30 minutes count.
          </p>
          <span className="signature">
            See you on the floor,
            <br />
            <strong>Your HIIT Co. team</strong>
          </span>
        </div>
      </Card>
      <Card className="future-note">
        <MessageCircle />
        <div>
          <h3>A space to stay connected.</h3>
          <p>
            Direct messaging and club notifications are planned for a future
            version. This announcement is sample content.
          </p>
        </div>
      </Card>
    </>
  );
}
