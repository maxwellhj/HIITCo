import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  Bell,
  CalendarDays,
  ChevronRight,
  Home,
  LayoutDashboard,
  MessageCircle,
  Pencil,
  TrendingUp,
  X,
  Zap,
  Check,
} from "lucide-react";
import type { DemoData } from "./domain/models";
import { formatDate } from "./domain/attendance";
import { demoRepository, resetDemo } from "./data/mock";
import { Brand, Card } from "./components/UI";
import { containDialog } from "./components/dialog";
import { HomePage } from "./pages/HomePage";
import { Progress } from "./pages/Progress";
import { Staff } from "./pages/Staff";
import { Skills } from "./pages/Skills";
import { Events } from "./pages/Events";
import { TrainingLog } from "./pages/TrainingLog";
import { GymMasterConnection } from "./pages/GymMasterConnection";
import { MemberApp } from "./member/MemberApp";
import { Messages } from "./pages/Messages";
type Page =
  | "home"
  | "skills"
  | "events"
  | "log"
  | "progress"
  | "messages"
  | "staff"
  | "connect";
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const pages = [
  { id: "home", label: "Home", icon: Home },
  { id: "events", label: "Events", icon: CalendarDays },
  { id: "log", label: "Log", icon: Pencil },
  { id: "progress", label: "Progress", icon: TrendingUp },
  { id: "messages", label: "Messages", icon: MessageCircle },
] as const;
function App() {
  const [data, setData] = useState<DemoData | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState<Page>(() => getPage()),
    [logExerciseId, setLogExerciseId] = useState<string | null>(() =>
      getLogExerciseId(),
    ),
    [memberId, setMemberId] = useState("member-1"),
    [notice, setNotice] = useState(""),
    [install, setInstall] = useState<InstallPrompt | null>(null),
    [showInstall, setShowInstall] = useState(false);
  function getPage(): Page {
    const hash = window.location.hash.slice(1).split("/")[0];
    const route = hash === "workouts" ? "skills" : hash;
    return [
      "home",
      "skills",
      "events",
      "log",
      "progress",
      "messages",
      "staff",
      "connect",
    ].includes(route)
      ? (route as Page)
      : "home";
  }
  function getLogExerciseId(): string | null {
    const [route, id] = window.location.hash.slice(1).split("/");
    if (route !== "log" || !id) return null;
    try {
      return decodeURIComponent(id);
    } catch {
      return null;
    }
  }
  async function load() {
    setError("");
    try {
      setData(await demoRepository.load());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load demo data.");
    }
  }
  useEffect(() => {
    void load();
    const route = () => {
      setPage(getPage());
      setLogExerciseId(getLogExerciseId());
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", route);
    const handler = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      window.removeEventListener("hashchange", route);
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  function navigate(next: Page) {
    window.location.hash = next;
    setPage(next);
    setLogExerciseId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  useEffect(() => {
    if (!showInstall) return;
    return containDialog(() => setShowInstall(false));
  }, [showInstall]);
  const member =
    data?.members.find((m) => m.id === memberId) ?? data?.members[0];
  async function saveTarget(id: string, target: number) {
    await demoRepository.saveTarget(id, target);
    setData((current) =>
      current
        ? {
            ...current,
            members: current.members.map((m) =>
              m.id === id ? { ...m, weeklyTarget: target } : m,
            ),
          }
        : current,
    );
    setNotice("Weekly target saved. Member progress is up to date.");
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#home"
          className="brand-link"
          aria-label="HIIT Co. home"
          onClick={(event) => {
            event.preventDefault();
            navigate("home");
          }}
        >
          <Brand />
        </a>
        <div className="club-label">
          CHRISTCHURCH, NZ <span>MEMBER CLUB</span>
        </div>
        <div className="nav-label">YOUR SPACE</div>
        <nav aria-label="Main navigation">
          {pages.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={20} />
              {label}
              {page === id && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <Zap size={24} />
          <h3>
            30 minutes.
            <br />
            All you need.
          </h3>
          <p>
            Show up. Get stronger.
            <br />
            We'll take it from there.
          </p>
          <span>STRONGER, TOGETHER.</span>
        </div>
        <a
          href="#staff"
          className={`staff-link ${page === "staff" ? "selected" : ""}`}
        >
          <LayoutDashboard size={18} /> Staff demo <ChevronRight size={16} />
        </a>
        <div className="sidebar-footer">
          HIIT Co. Hub <span>DEMO v0.1</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <a
            href="#home"
            className="mobile-brand"
            aria-label="HIIT Co. home"
            onClick={(event) => {
              event.preventDefault();
              navigate("home");
            }}
          >
            <Brand />
          </a>
          <div className="breadcrumb">
            Your club. Your pace. <span>Your progress.</span>
          </div>
          <div className="top-actions">
            <span className="demo-badge">DEMO EXPERIENCE</span>
            <button
              className="icon-button club-messages"
              aria-label="View club messages"
              onClick={() => navigate("messages")}
            >
              <Bell size={20} />
              <i />
            </button>
            <a
              href="#staff"
              className="icon-button mobile-staff"
              aria-label="Open staff demo"
            >
              <LayoutDashboard size={20} />
            </a>
            <button
              className="avatar"
              aria-label="Go to member home"
              onClick={() => navigate("home")}
            >
              {member?.initials ?? "HC"}
            </button>
          </div>
        </header>
        <main id="main-content">
          {error ? (
            <Card className="state">
              <h1>Let’s get you back on track.</h1>
              <p role="alert">{error}</p>
              <button className="primary" onClick={() => void load()}>
                Try again
              </button>
              <button
                className="secondary"
                onClick={() => {
                  try {
                    resetDemo();
                    void load();
                  } catch {
                    setError(
                      "Browser storage is unavailable. Enable site storage to use the demo.",
                    );
                  }
                }}
              >
                Reset saved demo targets
              </button>
            </Card>
          ) : !data || !member ? (
            <div className="state" role="status">
              Getting your club ready…
            </div>
          ) : page === "staff" ? (
            <Staff
              data={data}
              onSave={saveTarget}
              onPreview={(id) => {
                setMemberId(id);
                navigate("home");
              }}
            />
          ) : (
            <>
              <div
                className={`page-heading ${page === "home" ? "home-heading" : ""}`}
              >
                <div className="eyebrow">
                  <span />
                  {page === "home"
                    ? "PROGRESS OVER PERFECTION."
                    : page === "progress"
                      ? "EVERY VISIT ADDS UP"
                      : page === "skills"
                        ? "LEARN. PRACTISE. PROGRESS."
                        : page === "events"
                          ? "YOUR CLUB CALENDAR"
                          : page === "log"
                            ? "A LITTLE STRONGER, EVERY SESSION"
                            : page === "connect"
                              ? "MEMBER CONNECTION TEST"
                              : "YOUR CLUB CONNECTION"}
                </div>
                <div className="heading-line">
                  <h1>
                    {page === "home" ? (
                      <>Hey, {member.firstName}</>
                    ) : page === "progress" ? (
                      "Look how far you’ve come."
                    ) : page === "skills" ? (
                      "Skills Library"
                    ) : page === "events" ? (
                      "What’s on at HIIT Co."
                    ) : page === "log" ? (
                      "Your training log."
                    ) : page === "connect" ? (
                      "Connect GymMaster"
                    ) : (
                      "In your corner."
                    )}
                  </h1>
                  <span className="date-label">
                    {formatDate(new Date().toISOString(), {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </span>
                </div>
                <p>
                  {page === "home"
                    ? "Your week, at a glance."
                    : page === "progress"
                      ? "Consistency looks good on you. Here’s your training story so far."
                      : page === "skills"
                        ? "Technique tips and how-to videos, all in one place."
                        : page === "events"
                          ? "Explore upcoming events and tap a date for the details."
                          : page === "log"
                            ? "Record your sets. Follow your progress. Build on your best."
                            : page === "connect"
                              ? "Verify your sign-in while we prepare your member connection."
                              : "Updates, encouragement and good things from the HIIT Co. team."}
                </p>
              </div>
              {page === "home" ? (
                <HomePage key={member.id} member={member} data={data} />
              ) : page === "progress" ? (
                <Progress member={member} data={data} />
              ) : page === "skills" ? (
                <Skills demo />
              ) : page === "events" ? (
                <Events />
              ) : page === "log" ? (
                <TrainingLog
                  key={`${member.id}:${logExerciseId ?? "list"}`}
                  member={member}
                  initialExerciseId={logExerciseId}
                />
              ) : page === "connect" ? (
                <GymMasterConnection />
              ) : (
                <Messages />
              )}
              <div className="demo-footer">
                <span>
                  <span className="status-dot" />{" "}
                  {page === "log"
                    ? "Demo mode · Log entries saved on this device"
                    : "Fictional demo data · New Zealand time"}
                </span>
                {page !== "connect" && (
                  <label>
                    Viewing as{" "}
                    <select
                      aria-label="Demo member"
                      value={memberId}
                      onChange={(e) => setMemberId(e.target.value)}
                    >
                      {data.members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.firstName} {m.lastName}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </>
          )}
        </main>
        <footer className="page-footer">
          <button onClick={() => setShowInstall(true)}>
            <ArrowDownToLine size={15} /> Add to your home screen
          </button>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {pages.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            className={page === id ? "active" : ""}
            aria-current={page === id ? "page" : undefined}
          >
            <Icon size={21} />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <Check size={19} />
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {showInstall && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-title"
            className="modal"
          >
            <button
              className="modal-close icon-button"
              onClick={() => setShowInstall(false)}
              aria-label="Close installation instructions"
              autoFocus
            >
              <X />
            </button>
            <div className="icon-tile">
              <ArrowDownToLine />
            </div>
            <h2 id="install-title">Your club, one tap away.</h2>
            <p>Install HIIT Co. Hub for a full-screen app experience.</p>
            {install ? (
              <button
                className="primary"
                onClick={async () => {
                  await install.prompt();
                  await install.userChoice;
                  setInstall(null);
                  setShowInstall(false);
                }}
              >
                Install HIIT Co. Hub
              </button>
            ) : (
              <p>
                On iPhone, open this app in Safari, tap <strong>Share</strong>,
                then <strong>Add to Home Screen</strong>. On Android, use your
                browser menu and choose <strong>Install app</strong> or{" "}
                <strong>Add to Home screen</strong>. Installation requires HTTPS
                or a local development connection.
              </p>
            )}
            <button className="secondary" onClick={() => setShowInstall(false)}>
              Got it
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
const ControlRoom = lazy(() => import("./control/ControlRoom"));
export default function RootApp() {
  const [demo, setDemo] = useState(false);
  if (location.pathname.replace(/\/+$/, "") === "/control-room")
    return (
      <Suspense fallback={<p role="status">Loading Control Room…</p>}>
        <ControlRoom />
      </Suspense>
    );
  return demo ? (
    <>
      <div className="demo-mode-banner">
        Fictional demo{" "}
        <button
          onClick={() => {
            setDemo(false);
            window.location.hash = "home";
          }}
        >
          Back to member sign-in
        </button>
      </div>
      <App />
    </>
  ) : (
    <MemberApp onDemo={() => setDemo(true)} />
  );
}
