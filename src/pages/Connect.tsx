import { useEffect, useRef, useState } from "react";
import { LockKeyhole, Search, Users, MessageCircle, Send } from "lucide-react";
import { Card } from "../components/UI";
import { memberApi, MemberApiError } from "../member/api";
import "./connect.css";
type Person = { id: string; name: string };
type Edge = Person & { status: "pending" | "accepted"; incoming: boolean };
type State = {
  me: { id: string; public: boolean };
  people: Person[];
  edges: Edge[];
  blocked: Person[];
};
type Message = { id: number; mine: boolean; text: string; createdAt: string };
function errorText(error: unknown) {
  if (error instanceof MemberApiError) {
    if (error.status === 401)
      return "Your session has expired. Please sign in again.";
    if (error.status === 429)
      return "Please wait a minute before trying again.";
    if (error.code === "connection_required" || error.code === "not_available")
      return "This connection is no longer available. Refresh Connect to see the latest status.";
    if (error.code === "profile_required")
      return "Please refresh the app to load your member profile first.";
  }
  return "Connect couldn’t load. Please try again.";
}
export function Connect() {
  const [data, setData] = useState<State | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [tab, setTab] = useState<"connections" | "discover" | "requests">(
      "connections",
    ),
    [selected, setSelected] = useState<Person | null>(null);
  const mounted = useRef(true),
    loading = useRef(false);
  async function refresh() {
    if (loading.current) return;
    loading.current = true;
    try {
      const next = (await memberApi("connect")) as unknown as State;
      if (mounted.current) {
        setData(next);
        setError("");
        setSelected((current) =>
          current &&
          next.edges.some((e) => e.id === current.id && e.status === "accepted")
            ? current
            : null,
        );
      }
    } catch (e) {
      if (mounted.current) setError(errorText(e));
    } finally {
      loading.current = false;
    }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const update = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(update, 15000);
    document.addEventListener("visibilitychange", update);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  async function act(action: string, peer?: string, extra = {}) {
    setBusy(true);
    setError("");
    try {
      await memberApi("connect", {
        action,
        ...(peer ? { peer } : {}),
        ...extra,
      });
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const incoming =
    data?.edges.filter((e) => e.status === "pending" && e.incoming) ?? [];
  const outgoing =
    data?.edges.filter((e) => e.status === "pending" && !e.incoming) ?? [];
  const friends = data?.edges.filter((e) => e.status === "accepted") ?? [];
  function personRow(p: Person, children: React.ReactNode) {
    return (
      <div className="connect-person" key={p.id}>
        <span className="avatar" aria-hidden="true">
          {p.name.slice(0, 1).toUpperCase()}
        </span>
        <strong>{p.name}</strong>
        <div className="connect-actions">{children}</div>
      </div>
    );
  }
  return (
    <div className="connect-page">
      <Card className="connect-privacy">
        <div className="section-top">
          <div>
            <span className="small-caps blue">YOUR CLUB COMMUNITY</span>
            <h2>
              <Users size={24} /> Connect
            </h2>
          </div>
          <span className="pill">
            <LockKeyhole size={14} />
            {data?.me.public ? "Public" : "Private"}
          </span>
        </div>
        <p>Find your training crew. Connect by request, then keep in touch.</p>
        <label className="connect-toggle">
          <input
            type="checkbox"
            checked={data?.me.public ?? false}
            disabled={!data || busy}
            onChange={(e) =>
              void act("privacy", undefined, { public: e.target.checked })
            }
          />
          <span>
            <strong>Make my profile public</strong>
            <small>
              Let signed-in app members find your name and send a connection
              request. Private by default.
            </small>
          </span>
        </label>
        <p className="small muted">
          Public shares your name within Connect. Your visits, strength metrics
          and contact details stay private. Going private hides you from
          discovery; accepted connections can still message you.
        </p>
      </Card>
      {error && (
        <p role="alert" className="connect-error">
          {error}{" "}
          <button className="text-button" onClick={() => void refresh()}>
            Refresh Connect
          </button>
        </p>
      )}
      {!data && !error && <p role="status">Loading Connect…</p>}
      {data && (
        <>
          <div
            className="connect-tabs"
            role="tablist"
            aria-label="Connect sections"
          >
            {(
              [
                ["connections", `Connections (${friends.length})`],
                ["discover", "Find members"],
                ["requests", `Requests (${incoming.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "primary" : "secondary"}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <Card>
            {tab === "connections" && (
              <>
                <h2>Your connections</h2>
                {friends.length === 0 ? (
                  <p>
                    No connections yet. Find public members and send your first
                    request.
                  </p>
                ) : (
                  friends.map((p) =>
                    personRow(
                      p,
                      <>
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => setSelected(p)}
                        >
                          <MessageCircle size={16} /> Message
                        </button>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                `Disconnect from ${p.name}? This removes your conversation for both of you.`,
                              )
                            )
                              void act("disconnect", p.id);
                          }}
                        >
                          Disconnect
                        </button>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                `Block ${p.name}? They won’t be able to find or message you. Your conversation will be removed.`,
                              )
                            )
                              void act("block", p.id);
                          }}
                        >
                          Block
                        </button>
                      </>,
                    ),
                  )
                )}
              </>
            )}
            {tab === "discover" && (
              <>
                <h2>Find members</h2>
                <label className="connect-search">
                  <Search size={18} />
                  <input
                    aria-label="Search public members"
                    placeholder="Search by name"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <p className="small muted">
                  Only members who choose Public appear here.
                </p>
                {data.people
                  .filter((p) =>
                    p.name
                      .toLocaleLowerCase()
                      .includes(search.toLocaleLowerCase()),
                  )
                  .map((p) => {
                    const edge = data.edges.find((e) => e.id === p.id);
                    return personRow(
                      p,
                      edge ? (
                        <span className="pill">
                          {edge.status === "accepted"
                            ? "Connected"
                            : edge.incoming
                              ? "Request received"
                              : "Request sent"}
                        </span>
                      ) : (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void act("request", p.id)}
                        >
                          Connect
                        </button>
                      ),
                    );
                  })}
                {!data.people.some((p) =>
                  p.name
                    .toLocaleLowerCase()
                    .includes(search.toLocaleLowerCase()),
                ) && (
                  <p>
                    No public members found. Members appear once they opt in to
                    Connect.
                  </p>
                )}
              </>
            )}
            {tab === "requests" && (
              <>
                <h2>Received requests</h2>
                {!incoming.length && <p>No new requests.</p>}
                {incoming.map((p) =>
                  personRow(
                    p,
                    <>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => void act("accept", p.id)}
                      >
                        Accept
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void act("decline", p.id)}
                      >
                        Decline
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => void act("block", p.id)}
                      >
                        Block
                      </button>
                    </>,
                  ),
                )}
                <h3>Sent requests</h3>
                {!outgoing.length && <p>No pending requests.</p>}
                {outgoing.map((p) =>
                  personRow(
                    p,
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void act("cancel", p.id)}
                    >
                      Cancel request
                    </button>,
                  ),
                )}
              </>
            )}
          </Card>
          {selected && (
            <Conversation
              key={selected.id}
              person={selected}
              close={() => setSelected(null)}
            />
          )}
          {!!data.blocked.length && (
            <Card>
              <details>
                <summary>Blocked members ({data.blocked.length})</summary>
                {data.blocked.map((p) =>
                  personRow(
                    p,
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void act("unblock", p.id)}
                    >
                      Unblock
                    </button>,
                  ),
                )}
                <p className="small muted">
                  Unblocking doesn’t restore a connection or conversation.
                </p>
              </details>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
function Conversation({
  person,
  close,
}: {
  person: Person;
  close: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [hasMore, setHasMore] = useState(false),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const alive = useRef(true),
    draftId = useRef(crypto.randomUUID()),
    loading = useRef(false),
    loaded = useRef(false),
    bottom = useRef<HTMLDivElement>(null),
    messageList = useRef<HTMLDivElement>(null);
  async function load(before?: number) {
    if (loading.current) return;
    loading.current = true;
    try {
      const result = (await memberApi(
        `connect?peer=${person.id}${before ? `&before=${before}` : ""}`,
      )) as unknown as { messages: Message[]; hasMore: boolean };
      if (alive.current) {
        setMessages((current) => {
          const all = new Map(current.map((m) => [m.id, m]));
          for (const m of result.messages) all.set(m.id, m);
          return [...all.values()].sort((a, b) => a.id - b.id);
        });
        if (before || !loaded.current) setHasMore(result.hasMore);
        loaded.current = true;
        setReady(true);
        setError("");
      }
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally {
      loading.current = false;
    }
  }
  useEffect(() => {
    alive.current = true;
    void load();
    const update = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(update, 10000);
    document.addEventListener("visibilitychange", update);
    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [person.id]);
  const newest = messages.at(-1)?.id;
  useEffect(() => {
    if (messageList.current)
      messageList.current.scrollTop = messageList.current.scrollHeight;
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [newest]);
  return (
    <Card className="connect-chat">
      <div className="section-top">
        <h2>{person.name}</h2>
        <button className="secondary" onClick={close}>
          Close chat
        </button>
      </div>
      <p className="small muted">
        Only you and {person.name} can view this conversation in the app.
        Messages refresh automatically while Connect is open.
      </p>
      {hasMore && (
        <button
          className="secondary"
          onClick={() => void load(messages[0]?.id)}
        >
          Load earlier messages
        </button>
      )}
      <div
        ref={messageList}
        className="connect-messages"
        aria-label={`Messages with ${person.name}`}
      >
        {!ready && !error && <p>Loading messages…</p>}
        {ready && !messages.length && <p>Say hello to {person.name}.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`connect-bubble ${m.mine ? "mine" : ""}`}>
            <span className="small muted">{m.mine ? "You" : person.name}</span>
            <p>{m.text}</p>
            <time dateTime={m.createdAt}>
              {new Date(m.createdAt).toLocaleString("en-NZ", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: "Pacific/Auckland",
              })}
            </time>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="connect-error">
          {error}
        </p>
      )}
      <div ref={bottom} />
      <form
        className="connect-compose"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim() || busy) return;
          setBusy(true);
          setError("");
          try {
            await memberApi("connect", {
              action: "send",
              peer: person.id,
              text,
              messageId: draftId.current,
            });
            if (alive.current) {
              setText("");
              draftId.current = crypto.randomUUID();
              await load();
            }
          } catch (err) {
            if (alive.current) setError(errorText(err));
          } finally {
            if (alive.current) setBusy(false);
          }
        }}
      >
        <label htmlFor="connect-message">Your message</label>
        <textarea
          id="connect-message"
          maxLength={2000}
          rows={3}
          value={text}
          disabled={busy}
          placeholder="Write a message…"
          onChange={(e) => {
            setText(e.target.value);
            draftId.current = crypto.randomUUID();
          }}
        />
        <div className="section-top">
          <small>{text.length}/2000</small>
          <button className="primary" disabled={busy || !text.trim()}>
            <Send size={16} />
            {busy ? "Sending…" : "Send message"}
          </button>
        </div>
      </form>
    </Card>
  );
}
