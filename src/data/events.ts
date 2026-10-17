import { dateKey, shiftDate } from "../domain/attendance";
import type { ClubEvent } from "../domain/events";

/** Fictional events for this prototype. Replace through a club event repository later. */
export const eventsAreDemo = true;
export function createDemoEvents(today = dateKey(new Date())): ClubEvent[] {
  return [
    {
      id: "boxing-workshop",
      title: "Boxing foundations",
      date: shiftDate(today, 3),
      time: "9:00 am – 10:00 am",
      location: "HIIT Co. Christchurch",
      description:
        "A relaxed technique workshop covering your stance, footwork and the jab–cross. Work with a trainer to build confidence and sharpen the basics. All experience levels welcome.",
      bring: "Bring your gloves, wraps, water bottle and a towel.",
    },
    {
      id: "lift-workshop",
      title: "Lift with confidence",
      date: shiftDate(today, 10),
      time: "10:00 am – 11:00 am",
      location: "HIIT Co. Christchurch",
      description:
        "Get comfortable with the foundations of lifting. Our trainers will walk through squat and hinge technique, with time for questions and individual guidance.",
      bring: "Wear comfortable training gear and bring water and a towel.",
    },
    {
      id: "club-catchup",
      title: "Club coffee catch-up",
      date: shiftDate(today, 10),
      time: "11:15 am – 12:00 pm",
      location: "HIIT Co. Christchurch · club lounge",
      description:
        "Stay for a relaxed catch-up with your trainers and fellow members after the workshop. A chance to connect away from the workout floor.",
      bring: "Just yourself. All members welcome.",
    },
    {
      id: "sweat-social",
      title: "Saturday Sweat & Social",
      date: shiftDate(today, 24),
      time: "9:00 am – 10:00 am",
      location: "HIIT Co. Christchurch",
      description:
        "A fun team session followed by a club catch-up. Move at your own pace, meet other members and enjoy a little extra encouragement from the team.",
      bring: "Bring training shoes, water and a towel.",
    },
  ];
}
export const clubEvents = createDemoEvents();
