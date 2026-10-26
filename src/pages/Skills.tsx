import { useEffect, useState } from "react";
import { Dumbbell, Flame } from "lucide-react";
import { Card } from "../components/UI";
import { BoxingGlove } from "../components/BoxingGlove";
import { type SkillVideo, type SkillCategory } from "../data/skills";

const categories = [
  {
    name: "Box",
    icon: BoxingGlove,
    description: "Boxing technique, footwork and combinations.",
  },
  {
    name: "Lift",
    icon: Dumbbell,
    description: "Strength technique and lifting how-tos.",
  },
  {
    name: "Sweat",
    icon: Flame,
    description: "Conditioning movements and HIIT how-tos.",
  },
] as const;

export function Skills({ demo = false }: { demo?: boolean }) {
  const [library, setLibrary] = useState<SkillVideo[]>([]),
    [loading, setLoading] = useState(!demo),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (demo) return;
    const abort = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/gymmaster/skills", {
          credentials: "same-origin",
          cache: "no-store",
          signal: abort.signal,
        });
        if (!response.ok) throw Error();
        const data = await response.json();
        if (!Array.isArray(data.videos)) throw Error();
        if (!abort.signal.aborted) {
          setLibrary(data.videos);
          setError("");
        }
      } catch {
        if (!abort.signal.aborted)
          setError("Couldn’t load the Skills Library. Please try again.");
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    }
    setLoading(true);
    void load();
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(visible, 30000);
    document.addEventListener("visibilitychange", visible);
    return () => {
      abort.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [demo, attempt]);
  const [selected, setSelected] = useState<SkillCategory>("Box");
  const category = categories.find((item) => item.name === selected)!;
  const Icon = category.icon;
  const videos = library.filter((video) => video.category === selected);

  return (
    <div className="skills-space">
      <div
        className="skills-categories"
        role="group"
        aria-label="Video categories"
      >
        {categories.map(({ name, icon: CategoryIcon }) => (
          <button
            key={name}
            type="button"
            aria-pressed={selected === name}
            onClick={() => setSelected(name)}
          >
            <CategoryIcon size={22} />
            {name}
          </button>
        ))}
      </div>
      <section
        className="skills-results"
        aria-labelledby="skills-category-title"
      >
        <div className="skills-category-heading">
          <h2 id="skills-category-title">{selected}</h2>
          <p>{category.description}</p>
        </div>
        {error ? (
          <Card>
            <p className="error" role="alert">
              {error}
            </p>
            <button
              className="secondary"
              onClick={() => setAttempt((v) => v + 1)}
            >
              Try again
            </button>
          </Card>
        ) : loading ? (
          <Card>
            <p role="status">Loading your Skills Library…</p>
          </Card>
        ) : videos.length ? (
          <div className="skills-video-list">
            {videos.map((video) => (
              <Card key={video.id} className="skill-video">
                <h3>{video.title}</h3>
                <video
                  key={video.videoUrl}
                  controls
                  playsInline
                  preload="none"
                  poster={video.posterUrl}
                  aria-label={video.title}
                >
                  <source src={video.videoUrl} />
                  {video.captionsUrl && (
                    <track
                      kind="captions"
                      src={video.captionsUrl}
                      srcLang="en"
                      label="English"
                      default
                    />
                  )}
                  Your browser does not support video playback.
                </video>
                <p>{video.description}</p>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="skills-library">
            <div className="skills-preview" aria-hidden="true">
              <Icon size={64} />
            </div>
            <h3>No {selected} videos yet.</h3>
            <p>Your trainer’s technique videos and how-tos will appear here.</p>
            <p className="small">
              In the meantime, ask your trainer on the floor.
            </p>
          </Card>
        )}
      </section>
    </div>
  );
}
