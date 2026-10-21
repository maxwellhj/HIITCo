import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Home,
  LogOut,
  MessageCircle,
  Pencil,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { Brand, Card } from "../components/UI";
import { Events } from "../pages/Events";
import { Skills } from "../pages/Skills";
import { Messages } from "../pages/Messages";
import { formatDate } from "../domain/attendance";
import { parseDailyVisits, type DailyVisits } from "../domain/gymmasterVisits";
import type { GymMasterMemberProfile } from "../domain/gymmasterProfile";
import { parseCheckinTimes, type MemberCheckin } from "../domain/checkinTimes";
import { MemberApiError, memberApi, memberError } from "./api";
import { MemberLogin } from "./MemberLogin";
import type { StreakSummary } from "./attendance";
import { MemberDashboard } from "./MemberDashboard";
type Page =
  "home" | "events" | "log" | "progress" | "messages" | "account" | "skills";
const navigation = [
  { id: "home", label: "Home", icon: Home },
  { id: "events", label: "Events", icon: CalendarDays },
  { id: "log", label: "Log", icon: Pencil },
  { id: "progress", label: "Progress", icon: TrendingUp },
  { id: "messages", label: "Messages", icon: MessageCircle },
] as const;
function route(): Page {
  const hash = location.hash.slice(1).split("/")[0];
  if (hash === "connect") return "account";
  return [
    "home",
    "events",
    "log",
    "progress",
    "messages",
    "account",
    "skills",
  ].includes(hash)
    ? (hash as Page)
    : "home";
}
export function MemberApp({ onDemo }: { onDemo: () => void }) {
  const [phase, setPhase] = useState<
    "checking" | "signedout" | "ready" | "error"
  >("checking");
  const [profile, setProfile] = useState<GymMasterMemberProfile | null>(null),
    [days, setDays] = useState<DailyVisits[] | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null),
    [error, setError] = useState(""),
    [attendanceError, setAttendanceError] = useState("");
  const [page, setPage] = useState<Page>(route),
    [busy, setBusy] = useState(false);
  const [streakSummary, setStreakSummary] = useState<StreakSummary | null>(
    null,
  );
  const [checkins, setCheckins] = useState<MemberCheckin[] | null>(null);
  const [checkinError, setCheckinError] = useState("");
  const loggingOut = useRef(false);
  const generation = useRef(0),
    controller = useRef<AbortController | null>(null),
    channel = useRef<BroadcastChannel | null>(null);
  function clear() {
    setProfile(null);
    setDays(null);
    setCheckins(null);
    setCheckinError("");
    setStreakSummary(null);
    setAttendanceError("");
    setExpiresAt(null);
  }
  async function load() {
    if (loggingOut.current) return;
    const current = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    clear();
    setError("");
    setPhase("checking");
    try {
      const session = await memberApi("session", undefined, abort.signal);
      if (current !== generation.current) return;
      if (session.connected === false) {
        setPhase("signedout");
        return;
      }
      if (
        session.connected !== true ||
        typeof session.expiresAt !== "number" ||
        session.expiresAt <= Date.now()
      )
        throw new MemberApiError("session_expired", 401);
      setExpiresAt(session.expiresAt);
      const [p, v, c] = await Promise.allSettled([
        memberApi("profile", undefined, abort.signal),
        memberApi("visits", undefined, abort.signal),
        memberApi("checkins", undefined, abort.signal),
      ]);
      if (current !== generation.current) return;
      if (
        (p.status === "rejected" &&
          p.reason instanceof MemberApiError &&
          p.reason.status === 401) ||
        (v.status === "rejected" &&
          v.reason instanceof MemberApiError &&
          v.reason.status === 401)
      )
        throw new MemberApiError("session_expired", 401);
      if (
        c.status === "rejected" &&
        c.reason instanceof MemberApiError &&
        c.reason.status === 401
      )
        throw c.reason;
      if (p.status === "rejected") throw p.reason;
      const value = p.value.profile as GymMasterMemberProfile | undefined;
      if (
        !value ||
        typeof value.firstName !== "string" ||
        !value.firstName.trim() ||
        typeof value.lastName !== "string" ||
        !(
          value.totalVisits === null ||
          (Number.isSafeInteger(value.totalVisits) && value.totalVisits >= 0)
        )
      )
        throw Error();
      if (v.status === "fulfilled") {
        try {
          setDays(parseDailyVisits(v.value.days));
          const summary = v.value.streak as StreakSummary | undefined;
          if (
            summary &&
            typeof summary.exact === "boolean" &&
            (summary.count === null ||
              (Number.isSafeInteger(summary.count) &&
                summary.count >= 0 &&
                summary.count <= 10000))
          )
            setStreakSummary(summary);
        } catch {
          setAttendanceError(
            memberError(new MemberApiError("visits_format", 502), "visits"),
          );
        }
      } else setAttendanceError(memberError(v.reason, "visits"));
      if (c.status === "fulfilled") {
        try {
          if (c.value.timeZone !== "Pacific/Auckland") throw Error();
          setCheckins(parseCheckinTimes(c.value.checkins));
          if (c.value.historyPending === true)
            setCheckinError(
              "Earlier received check-ins are being prepared. Please refresh shortly.",
            );
        } catch {
          setCheckinError(
            "Check-in times couldn’t be read. Please tell us GM-CHECKINS-FORMAT.",
          );
        }
      } else setCheckinError(memberError(c.reason, "checkins"));
      setProfile({
        firstName: value.firstName,
        lastName: value.lastName,
        totalVisits: value.totalVisits,
      });
      setPhase("ready");
    } catch (err) {
      if (current !== generation.current) return;
      clear();
      setError(memberError(err, "profile"));
      setPhase(
        err instanceof MemberApiError && err.status === 401
          ? "signedout"
          : "error",
      );
    }
  }
  useEffect(() => {
    void load();
    const hash = () => {
      setPage(route());
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("hashchange", hash);
    document.addEventListener("visibilitychange", visible);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("hiitco.member-session");
      channel.current.onmessage = () => void load();
    }
    return () => {
      generation.current++;
      controller.current?.abort();
      window.removeEventListener("hashchange", hash);
      document.removeEventListener("visibilitychange", visible);
      channel.current?.close();
    };
  }, []);
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(
      () => {
        generation.current++;
        controller.current?.abort();
        clear();
        setError("Your session has expired. Please sign in again.");
        setPhase("signedout");
      },
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);
  async function signOut() {
    if (loggingOut.current) return;
    loggingOut.current = true;
    generation.current++;
    controller.current?.abort();
    clear();
    setPhase("checking");
    setBusy(true);
    setError("");
    try {
      await memberApi("logout", {});
      setPhase("signedout");
      location.hash = "home";
      channel.current?.postMessage("changed");
    } catch {
      setPhase("error");
      setError("We couldn’t finish signing out. Please try signing out again.");
    } finally {
      loggingOut.current = false;
      setBusy(false);
    }
  }
  if (phase === "signedout")
    return (
      <MemberLogin
        onDemo={onDemo}
        message={error}
        onLogin={() => {
          location.hash = "home";
          channel.current?.postMessage("changed");
          void load();
        }}
      />
    );
  if (phase === "checking")
    return (
      <div className="member-login">
        <Brand />
        <Card>
          <p role="status">
            {busy ? "Signing out…" : "Loading your member account…"}
          </p>
        </Card>
      </div>
    );
  if (phase === "error" || !profile)
    return (
      <div className="member-login">
        <Brand />
        <Card>
          <h1>Your account is unavailable</h1>
          <p className="error" role="alert">
            {error}
          </p>
          <button className="primary" onClick={() => void load()}>
            Try again
          </button>
          <button className="text-button" onClick={onDemo}>
            Explore the fictional demo
          </button>
          <button
            className="secondary"
            onClick={() => void signOut()}
            disabled={busy}
          >
            Sign out
          </button>
        </Card>
      </div>
    );
  const initials = (
    profile.firstName[0] + (profile.lastName[0] ?? "")
  ).toUpperCase();
  const titles: Record<Page, string> = {
    home: `Hey, ${profile.firstName}`,
    progress: "Your progress",
    events: "What’s on at HIIT Co.",
    skills: "Skills Library",
    log: "Your training log",
    messages: "In your corner",
    account: "Your account",
  };
  return (
    <div className="app-shell member-shell">
      <aside className="sidebar">
        <a href="#home" className="brand-link" aria-label="HIIT Co. home">
          <Brand />
        </a>
        <div className="club-label">
          CHRISTCHURCH, NZ <span>MEMBER CLUB</span>
        </div>
        <div className="nav-label">YOUR SPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={20} />
              {label}
            </a>
          ))}
        </nav>
        <a className="staff-link" href="#account">
          <UserRound size={18} /> Your account
        </a>
        <button className="text-button" onClick={() => void signOut()}>
          <LogOut size={17} /> Sign out
        </button>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <a className="mobile-brand" href="#home" aria-label="HIIT Co. home">
            <Brand />
          </a>
          <div className="breadcrumb">Your club. Your pace. Your progress.</div>
          <div className="top-actions">
            <a href="#account" className="avatar" aria-label="Your account">
              {initials}
            </a>
            <button className="text-button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </header>
        <main id="main-content">
          <div
            className={`page-heading ${page === "home" ? "home-heading" : ""}`}
          >
            <div className="eyebrow">
              <span />
              {page === "home"
                ? "PROGRESS OVER PERFECTION."
                : "YOUR HIIT CO. HUB"}
            </div>
            <div className="heading-line">
              <h1>{titles[page]}</h1>
              <span className="date-label">
                {formatDate(new Date().toISOString(), {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </span>
            </div>
          </div>
          {page === "home" || page === "progress" ? (
            <MemberDashboard
              profile={profile}
              days={days}
              streakSummary={streakSummary}
              checkins={checkins}
              checkinError={checkinError}
              attendanceError={attendanceError}
              refresh={() => void load()}
              busy={false}
              progress={page === "progress"}
            />
          ) : page === "account" ? (
            <Card>
              <h2>
                {profile.firstName} {profile.lastName}
              </h2>
              <p>Signed in with GymMaster.</p>
              <p>
                Total visits:{" "}
                <strong>{profile.totalVisits ?? "Not supplied"}</strong>
              </p>
              <p>
                Your session expires at{" "}
                {formatDate(new Date(expiresAt!).toISOString(), {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}{" "}
                NZ time.
              </p>
              <button className="secondary" onClick={() => void load()}>
                Refresh account
              </button>
              <button className="primary" onClick={() => void signOut()}>
                Sign out
              </button>
            </Card>
          ) : page === "events" ? (
            <Events />
          ) : page === "skills" ? (
            <Skills />
          ) : page === "messages" ? (
            <Messages />
          ) : (
            <Card>
              <h2>Member training logs are being prepared</h2>
              <p>
                Saving training logs securely to your member account is the next
                step. Your account does not use the fictional demo’s exercise
                records.
              </p>
            </Card>
          )}
          <p className="member-source small muted">
            Your name and total visits come from GymMaster.{" "}
            {page === "home" || page === "events" || page === "messages"
              ? "Club workouts, events and messages are still demo content."
              : ""}
          </p>
        </main>
        <footer className="page-footer">
          <span>BUILT FOR YOUR EVERYDAY STRONGER.</span>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
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
    </div>
  );
}
