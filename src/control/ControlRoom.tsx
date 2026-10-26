import { ClubManager } from "./ClubManager";
import { SkillsManager } from "./SkillsManager";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  CalendarDays,
  Film,
  Check,
  ChevronRight,
  Download,
  RefreshCw,
  Search,
  TrendingUp,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { Brand, Card } from "../components/UI";
import { TrainingChart } from "../components/TrainingChart";
import { dateKey, formatDate, shiftDate } from "../domain/attendance";
import {
  exerciseProgress,
  parseTrainingLog,
  type TrainingLogData,
} from "../domain/training";
import { parseChowLog, type ChowLogData } from "../domain/chow";
import type { ActivityItem, AppMember, ClubSticker } from "../domain/control";
import { controlApi, ControlError } from "./api";
const name = (member: AppMember) =>
  `${member.firstName} ${member.lastName}`.trim();
const number = (value: number) =>
  value.toLocaleString("en-NZ", { maximumFractionDigits: 2 });
type Detail = {
  weeklyTarget: number;
  weeklyTargetOverride: number | null;
  clubWeeklyTarget: number;
  member: AppMember;
  training: TrainingLogData;
  chow: ChowLogData;
  earnedStickerIds: string[];
};
export default function ControlRoom() {
  const [tab, setTab] = useState<
      "members" | "stickers" | "activity" | "reports" | "skills" | "club"
    >("members"),
    [members, setMembers] = useState<AppMember[]>([]),
    [stickers, setStickers] = useState<ClubSticker[]>([]),
    [activity, setActivity] = useState<ActivityItem[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [access, setAccess] = useState<{
      available: boolean;
      configured: boolean;
      skillsAvailable?: boolean;
      reportsReady?: boolean;
    } | null>(null);
  const initialized = useRef(false);
  const generation = useRef(0),
    controller = useRef<AbortController | null>(null);
  function handle(err: unknown) {
    if (
      err instanceof ControlError &&
      err.status === 403 &&
      err.code === "control_access_restricted"
    ) {
      setMembers([]);
      setSelected(null);
      setStickers([]);
      setActivity([]);
      setAccess((old) => ({ ...old, available: false, configured: true }));
      setError("This connection does not have Control Room access.");
    } else setError("Couldn’t refresh the Control Room. Please try again.");
  }
  async function load() {
    const current = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    try {
      const status = await controlApi("status", undefined, abort.signal);
      if (current !== generation.current) return;
      setAccess(status);
      if (!initialized.current) {
        initialized.current = true;
        if (!status.available && status.skillsAvailable) setTab("skills");
      }
      if (!status.available) {
        setMembers([]);
        setStickers([]);
        setActivity([]);
        setSelected(null);
        return;
      }
      const [catalog, feed] = await Promise.all([
        controlApi("stickers", undefined, abort.signal),
        controlApi("activity", undefined, abort.signal),
      ]);
      let all: AppMember[] = [],
        after: string | null = null;
      do {
        const page = await controlApi(
          "members" + (after ? "?after=" + after : ""),
          undefined,
          abort.signal,
        );
        all = all.concat(page.members);
        after = page.next;
        if (all.length >= 10000 && after) throw Error();
      } while (after);
      if (current !== generation.current) return;
      setMembers(all);
      setStickers(catalog.stickers);
      setActivity(feed.items);
    } catch (err) {
      if (!abort.signal.aborted) handle(err);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => {
      generation.current++;
      controller.current?.abort();
      clearInterval(timer);
    };
  }, []);
  const unread = activity.filter((a) => !a.read).length,
    filtered = members.filter((m) =>
      `${name(m)} ${m.memberId}`.toLowerCase().includes(search.toLowerCase()),
    );
  async function markRead(ids: string[]) {
    try {
      await controlApi("activity/read", { ids });
      setActivity((old) =>
        old.map((a) => (ids.includes(a.id) ? { ...a, read: true } : a)),
      );
    } catch (err) {
      handle(err);
    }
  }
  return (
    <div className="control-room">
      <header className="control-header">
        <a href="/control-room" aria-label="Control Room home">
          <Brand />
        </a>
        <div>
          <span className="eyebrow">HIIT CO. HUB</span>
          <h1>Control Room</h1>
        </div>
        <div className="control-header-actions">
          <a href="/" target="_blank" rel="noreferrer">
            Open member app
          </a>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void load()}
          >
            <RefreshCw size={15} />
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>
      <main className="control-main">
        <div className="control-summary">
          <Card>
            <Users size={21} />
            <span>
              App members
              <strong>{access?.available ? members.length : "—"}</strong>
            </span>
          </Card>
          <Card>
            <Trophy size={21} />
            <span>
              Club stickers
              <strong>{access?.available ? stickers.length : "—"}</strong>
            </span>
          </Card>
          <Card>
            <Bell size={21} />
            <span>
              Unread activity<strong>{access?.available ? unread : "—"}</strong>
            </span>
          </Card>
        </div>
        {access && !access.available && !["skills", "club"].includes(tab) && (
          <Card className="control-access-notice">
            <h2>Allow your staff connection to get started</h2>
            <p>
              {access.configured
                ? "This internet connection hasn’t been allowed. Open the Control Room from your configured staff connection."
                : "There’s no staff login. Instead, the Control Room checks your internet connection’s public IP address before showing member records or allowing changes."}
            </p>
            <p className="small muted">
              In Cloudflare → hiitco → Settings → Variables and Secrets, add a
              Text variable named CONTROL_ROOM_ALLOWED_IPS with your staff
              connection’s public IP address, then deploy. Anyone sharing that
              address can access these controls, so use a staff-only connection.
            </p>
          </Card>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <nav className="control-tabs" aria-label="Control Room sections">
          {(
            [
              { id: "members", label: "Members", icon: Users },
              { id: "stickers", label: "Stickers", icon: Trophy },
              { id: "skills", label: "Skills Library", icon: Film },
              { id: "club", label: "Club settings", icon: CalendarDays },
              { id: "activity", label: "Activity", icon: Bell },
              { id: "reports", label: "GymMaster reports", icon: Download },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              <Icon size={17} />
              {label}
              {id === "activity" && unread > 0 && (
                <span className="control-count">{unread}</span>
              )}
            </button>
          ))}
        </nav>
        {tab === "members" ? (
          <div
            className={
              "control-member-layout" + (selected ? " has-selection" : "")
            }
          >
            <Card className="control-member-list">
              <div className="section-top">
                <h2>App members</h2>
                <span className="small muted">{filtered.length}</span>
              </div>
              <label className="control-search">
                <Search size={16} />
                <input
                  aria-label="Search app members"
                  type="search"
                  placeholder="Search name or member ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {filtered.length ? (
                filtered.map((m) => (
                  <button
                    key={m.memberKey}
                    className={
                      "control-member-row" +
                      (selected === m.memberKey ? " selected" : "")
                    }
                    onClick={() => setSelected(m.memberKey)}
                  >
                    <span className="avatar">
                      {(m.firstName[0] ?? "") + (m.lastName[0] ?? "")}
                    </span>
                    <span>
                      <strong>{name(m)}</strong>
                      <small>
                        GymMaster #{m.memberId} · {m.totalVisits ?? "—"} visits
                      </small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))
              ) : (
                <div className="control-empty">
                  <Users size={30} />
                  <h3>
                    {search
                      ? "No matching members"
                      : "Your app members will appear here"}
                  </h3>
                  <p>
                    Members are added when they open or refresh HIIT Co. Hub.
                    This list is separate from the full GymMaster club roster.
                  </p>
                </div>
              )}
            </Card>
            {selected && access?.available ? (
              <MemberInspector
                key={selected}
                memberKey={selected}
                stickers={stickers}
                refreshKey={members}
                onClose={() => setSelected(null)}
                onChanged={() => void load()}
                onAccessError={handle}
              />
            ) : (
              <Card className="control-detail-placeholder">
                <TrendingUp size={36} />
                <h2>A clearer picture of every member</h2>
                <p>
                  Select a member to see strength metrics, CHOW records and
                  digital stickers.
                </p>
              </Card>
            )}
          </div>
        ) : tab === "stickers" ? (
          <StickerManager
            stickers={stickers}
            available={!!access?.available}
            onChanged={() => void load()}
            onError={handle}
          />
        ) : tab === "skills" ? (
          <SkillsManager
            available={!!access?.skillsAvailable}
            onAccessError={handle}
          />
        ) : tab === "club" ? (
          <ClubManager />
        ) : tab === "activity" ? (
          <Card>
            <div className="section-top">
              <h2>Member activity</h2>
              <button
                className="text-button"
                disabled={!unread}
                onClick={() =>
                  void markRead(
                    activity.filter((a) => !a.read).map((a) => a.id),
                  )
                }
              >
                Mark all read
              </button>
            </div>
            <p className="small muted">
              Personal bests, CHOW progress and sticker updates.
            </p>
            {activity.length ? (
              activity.map((item) => (
                <div
                  key={item.id}
                  className={
                    "control-activity-row" + (!item.read ? " unread" : "")
                  }
                >
                  <span className="icon-tile">
                    {item.kind.startsWith("sticker") ? (
                      <Trophy size={20} />
                    ) : (
                      <TrendingUp size={20} />
                    )}
                  </span>
                  <div>
                    <button
                      className="text-button"
                      onClick={() => {
                        setSelected(item.memberKey);
                        setTab("members");
                      }}
                    >
                      {members.find((m) => m.memberKey === item.memberKey)
                        ? name(
                            members.find(
                              (m) => m.memberKey === item.memberKey,
                            )!,
                          )
                        : "Member awaiting profile refresh"}
                    </button>
                    <strong>
                      {item.kind === "weight_pb"
                        ? "New weight PB"
                        : item.kind === "volume_pb"
                          ? "New volume PB"
                          : item.kind === "chow_pb"
                            ? "New CHOW PB"
                            : item.kind === "sticker_unlocked"
                              ? "Sticker unlocked"
                              : "Sticker removed"}{" "}
                      · {item.title}
                      {item.value !== undefined
                        ? ` · ${number(item.value)} ${item.unit}`
                        : ""}
                    </strong>
                    <small>
                      {formatDate(item.createdAt, {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </small>
                  </div>
                  {!item.read && (
                    <button
                      className="icon-button"
                      aria-label={"Mark read " + item.title}
                      onClick={() => void markRead([item.id])}
                    >
                      <Check size={16} />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="control-empty">
                <Bell size={30} />
                <h3>No activity yet</h3>
                <p>
                  New personal bests and sticker changes will appear here. A
                  first training session establishes a baseline.
                </p>
              </div>
            )}
          </Card>
        ) : (
          <Reports
            available={!!access?.available}
            ready={!!access?.reportsReady}
            onConnected={() => void load()}
          />
        )}
      </main>
    </div>
  );
}
function MemberGoal({
  detail,
  onSaved,
  onAccessError,
}: {
  detail: Detail;
  onSaved: () => void;
  onAccessError: (error: unknown) => void;
}) {
  const [value, setValue] = useState(
      detail.weeklyTargetOverride === null
        ? "default"
        : String(detail.weeklyTargetOverride),
    ),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    setValue(
      detail.weeklyTargetOverride === null
        ? "default"
        : String(detail.weeklyTargetOverride),
    );
  }, [detail.weeklyTargetOverride]);
  return (
    <Card>
      <h2>Your weekly goal</h2>
      <p className="small muted">
        Set {detail.member.firstName}’s training-days goal. Multiple visits on
        the same day count once.
      </p>
      <form
        className="control-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setMessage("");
          try {
            await controlApi("member-goal", {
              memberKey: detail.member.memberKey,
              weeklyTarget: value === "default" ? null : Number(value),
            });
            setMessage(
              "Weekly goal saved for " + detail.member.firstName + ".",
            );
            onSaved();
          } catch (err) {
            setError("Couldn’t save the weekly goal. Please try again.");
            if (err instanceof ControlError && err.status === 403)
              onAccessError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Member weekly training goal
          <select
            aria-label="Member weekly training goal"
            value={value}
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="default">
              Use club default ({detail.clubWeeklyTarget} days)
            </option>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "day" : "days"} per week
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save member goal"}
        </button>
      </form>
      <p className="small muted">
        Current goal: {detail.weeklyTarget} training{" "}
        {detail.weeklyTarget === 1 ? "day" : "days"} per week.
      </p>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </Card>
  );
}
function MemberInspector({
  memberKey,
  stickers,
  refreshKey,
  onClose,
  onChanged,
  onAccessError,
}: {
  memberKey: string;
  stickers: ClubSticker[];
  refreshKey: unknown;
  onClose: () => void;
  onChanged: () => void;
  onAccessError: (error: unknown) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [exerciseId, setExerciseId] = useState(""),
    [pending, setPending] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const id = ++generation.current,
      abort = new AbortController();
    setDetail((old) => (old?.member.memberKey === memberKey ? old : null));
    setError("");
    void controlApi("member?id=" + memberKey, undefined, abort.signal)
      .then(async (result) => {
        const training = parseTrainingLog(result.training, dateKey(new Date())),
          chow = await parseChowLog(result.chow, dateKey(new Date()));
        if (id !== generation.current) return;
        setDetail({ ...result, training, chow });
        setExerciseId((old) =>
          training.sessions.some((s) => s.exerciseId === old)
            ? old
            : (training.sessions.at(-1)?.exerciseId ?? ""),
        );
      })
      .catch((err) => {
        if (!abort.signal.aborted) {
          setError("Couldn’t load this member. Please refresh.");
          if (err instanceof ControlError && err.status === 403)
            onAccessError(err);
        }
      });
    return () => abort.abort();
  }, [memberKey, refreshKey]);
  if (!detail || detail.member.memberKey !== memberKey)
    return (
      <Card>
        <p role="status">{error || "Loading member records…"}</p>
      </Card>
    );
  const exercises = detail.training.exercises.filter((e) =>
      detail.training.sessions.some((s) => s.exerciseId === e.id),
    ),
    stats = exerciseId
      ? exerciseProgress(detail.training.sessions, exerciseId)
      : null;
  async function toggle(stickerId: string, unlocked: boolean) {
    setPending(stickerId);
    setError("");
    try {
      await controlApi("awards", {
        memberKey,
        stickerId,
        unlocked,
        requestId: crypto.randomUUID(),
      });
      setDetail((old) =>
        old
          ? {
              ...old,
              earnedStickerIds: unlocked
                ? [...new Set([...old.earnedStickerIds, stickerId])]
                : old.earnedStickerIds.filter((id) => id !== stickerId),
            }
          : old,
      );
      onChanged();
    } catch (err) {
      setError("Couldn’t update this sticker. Please refresh and try again.");
      onAccessError(err);
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="control-member-detail">
      <Card>
        <div className="section-top">
          <div>
            <h2>{name(detail.member)}</h2>
            <p className="small muted">
              GymMaster #{detail.member.memberId} · Last seen{" "}
              {formatDate(detail.member.lastSeen, {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Close member"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="control-member-totals">
          <span>
            Total visits<strong>{detail.member.totalVisits ?? "—"}</strong>
          </span>
          <span>
            Training sessions<strong>{detail.training.sessions.length}</strong>
          </span>
          <span>
            CHOW attempts<strong>{detail.chow.scores.length}</strong>
          </span>
        </div>
      </Card>
      <MemberGoal
        key={memberKey}
        detail={detail}
        onSaved={onChanged}
        onAccessError={onAccessError}
      />
      <Card>
        <h2>Strength Metrics</h2>
        {stats && stats.history.length ? (
          <>
            <label className="strength-picker">
              Exercise
              <select
                aria-label="Member strength exercise"
                value={exerciseId}
                onChange={(e) => setExerciseId(e.target.value)}
              >
                {exercises.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="strength-metrics">
              <div>
                <span>Heaviest set</span>
                <strong>
                  {number(stats.bestWeight)}
                  <small> kg</small>
                </strong>
              </div>
              <div>
                <span>Since first session</span>
                <strong>
                  {stats.weightChange === null
                    ? "—"
                    : `${stats.weightChange > 0 ? "+" : ""}${number(stats.weightChange)}`}
                  <small> kg</small>
                </strong>
              </div>
              <div>
                <span>Latest volume</span>
                <strong>
                  {number(stats.latestVolume)}
                  <small> kg</small>
                </strong>
              </div>
            </div>
            <TrainingChart key={exerciseId} points={stats.points} />
          </>
        ) : (
          <p className="small muted">
            This member hasn’t recorded a training session yet.
          </p>
        )}
      </Card>
      <Card>
        <h2>Trophy Room controls</h2>
        <p className="small muted">
          Switch a sticker on to unlock it in this member’s app, or off to
          remove it.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {stickers.length ? (
          <div className="control-award-list">
            {stickers.map((s) => (
              <label className="control-award" key={s.id}>
                <img src={"/api/control/art/" + s.id} alt="" />
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.description}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={"Unlock " + s.name}
                  checked={detail.earnedStickerIds.includes(s.id)}
                  disabled={pending !== null}
                  onChange={(e) => void toggle(s.id, e.target.checked)}
                />
              </label>
            ))}
          </div>
        ) : (
          <p className="small muted">
            Upload your club’s actual stickers in the Stickers section first.
          </p>
        )}
      </Card>
      <Card>
        <h2>CHOW records</h2>
        {detail.chow.challenges.length ? (
          detail.chow.challenges.map((c) => {
            const scores = detail.chow.scores
              .filter((s) => s.challengeId === c.id && s.unit === "sets")
              .sort(
                (a, b) =>
                  b.date.localeCompare(a.date) ||
                  b.createdAt.localeCompare(a.createdAt),
              );
            return (
              <div className="control-chow-record" key={c.id}>
                <span>
                  <strong>
                    Station {c.station} · {c.block}
                  </strong>
                  <small>{c.workout}</small>
                </span>
                <strong>
                  {scores.length
                    ? `${number(Math.max(...scores.map((s) => s.score)))} sets best`
                    : "No sets recorded"}
                </strong>
              </div>
            );
          })
        ) : (
          <p className="small muted">No CHOW attempts recorded yet.</p>
        )}
      </Card>
    </div>
  );
}
function StickerManager({
  stickers,
  available,
  onChanged,
  onError,
}: {
  stickers: ClubSticker[];
  available: boolean;
  onChanged: () => void;
  onError: (err: unknown) => void;
}) {
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const uploadId = useRef(crypto.randomUUID()),
    form = useRef<HTMLFormElement>(null);
  return (
    <div className="control-sticker-layout">
      <Card>
        <h2>Add a club sticker</h2>
        <p className="small muted">
          Use the digital artwork from your physical water-bottle stickers.
        </p>
        <form
          ref={form}
          className="control-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!available || !file) return;
            setError("");
            setNotice("");
            if (
              file.size > 262144 ||
              !["image/png", "image/jpeg", "image/webp"].includes(file.type)
            ) {
              setError("Choose a PNG, WebP or JPG image up to 256 KB.");
              return;
            }
            setBusy(true);
            try {
              const bytes = new Uint8Array(await file.arrayBuffer());
              let binary = "";
              for (const b of bytes) binary += String.fromCharCode(b);
              await controlApi("stickers", {
                id: uploadId.current,
                name,
                description,
                mime: file.type,
                image: btoa(binary),
              });
              setNotice("Sticker added. You can now unlock it for members.");
              setName("");
              setDescription("");
              setFile(null);
              uploadId.current = crypto.randomUUID();
              form.current?.reset();
              onChanged();
            } catch (err) {
              setError(
                "Couldn’t upload this sticker. Check the image and try again.",
              );
              onError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={!available || busy}>
            <label>
              Sticker name
              <input
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 100 Club"
              />
            </label>
            <label>
              Description
              <input
                maxLength={200}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this sticker celebrate?"
              />
            </label>
            <label>
              Sticker artwork
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  uploadId.current = crypto.randomUUID();
                }}
              />
            </label>
            <span className="small muted">
              PNG, WebP or JPG · up to 256 KB. Transparent PNG is ideal.
            </span>
            <button className="primary" disabled={!file}>
              {busy ? "Uploading…" : "Add sticker"}
            </button>
          </fieldset>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
        </form>
      </Card>
      <Card>
        <h2>Sticker collection</h2>
        {stickers.length ? (
          <div className="sticker-grid">
            {stickers.map((s) => (
              <div className="collectable-sticker" key={s.id}>
                <img src={"/api/control/art/" + s.id} alt={s.name} />
                <strong>{s.name}</strong>
                <p>{s.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="control-empty">
            <Trophy size={32} />
            <h3>Your club’s digital stickers</h3>
            <p>
              Your uploaded sticker artwork will appear here. No sample awards
              have been added.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
function Reports({
  available,
  ready,
  onConnected,
}: {
  available: boolean;
  ready: boolean;
  onConnected: () => void;
}) {
  const [key, setKey] = useState(""),
    [reports, setReports] = useState<
      { id: number; name: string; category: string }[]
    >([]),
    [reportId, setReportId] = useState(""),
    [start, setStart] = useState(shiftDate(dateKey(new Date()), -30)),
    [end, setEnd] = useState(dateKey(new Date())),
    [members, setMembers] = useState<{ memberId: number; name: string }[]>([]),
    [cached, setCached] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function list() {
    setBusy(true);
    setError("");
    try {
      const data = await controlApi("reports");
      setReports(data.reports);
      setReportId((old) => old || String(data.reports[0]?.id ?? ""));
    } catch {
      setError(
        "Couldn’t load reports. Check the report connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (available && ready) void list();
  }, [available, ready]);
  return (
    <div className="control-reports">
      <Card>
        <h2>GymMaster report connection</h2>
        <p className="small muted">
          Connect the reporting API supplied by GymMaster support. This key is
          separate from member sign-in and is stored encrypted on the server.
        </p>
        <form
          className="control-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const secret = key;
            setKey("");
            setBusy(true);
            setError("");
            setNotice("");
            try {
              await controlApi("reports/connect", { key: secret });
              setNotice("GymMaster reports connected.");
              onConnected();
              await list();
            } catch {
              setError(
                "Connection failed. Check the reporting API key with GymMaster support.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            GymMaster Reports API key
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              minLength={16}
              maxLength={1000}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={!available || busy}
            />
          </label>
          <button className="primary" disabled={!available || busy || !key}>
            {busy
              ? "Checking…"
              : ready
                ? "Update connection"
                : "Connect reports"}
          </button>
        </form>
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </Card>
      <Card>
        <div className="section-top">
          <h2>Available reports</h2>
          <button
            className="text-button"
            disabled={!available || !ready || busy}
            onClick={() => void list()}
          >
            Refresh list
          </button>
        </div>
        {reports.length ? (
          <>
            <form
              className="control-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const data = await controlApi("reports/run", {
                    reportId: Number(reportId),
                    startDate: start,
                    endDate: end,
                  });
                  setMembers(data.members);
                  setCached(data.cached);
                } catch {
                  setError(
                    "Couldn’t read this report as a member list. It must include Member ID and Member Name.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Report
                <select
                  aria-label="GymMaster report"
                  value={reportId}
                  onChange={(e) => setReportId(e.target.value)}
                >
                  {reports.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · #{r.id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="control-date-range">
                <label>
                  Start date
                  <input
                    type="date"
                    required
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  End date
                  <input
                    type="date"
                    required
                    value={end}
                    min={start}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
              </div>
              <button className="secondary" disabled={busy}>
                Preview member report
              </button>
            </form>
            <p className="small muted">
              Report members are a separate preview and are not automatically
              labelled as app users. GymMaster may cache results for up to six
              hours.
            </p>
            {members.length > 0 && (
              <>
                <p>
                  {members.length} report members
                  {cached ? " · cached result" : ""}
                </p>
                <div className="control-report-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Member ID</th>
                        <th>Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m, i) => (
                        <tr key={m.memberId + "-" + i}>
                          <td>{m.memberId}</td>
                          <td>{m.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="control-empty">
            <Download size={30} />
            <h3>Reports will appear after connection</h3>
            <p>
              The available-report endpoint provides the actual report IDs and
              names. No IDs have been guessed.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
