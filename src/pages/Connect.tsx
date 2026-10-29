import { useEffect, useRef, useState } from "react";
import { Search, MessageCircle, Send, Plus, ArrowLeft } from "lucide-react";
import { Card } from "../components/UI";
import { memberApi, MemberApiError } from "../member/api";
import "./connect.css";
type Person = { id: string; name: string };
type Edge = Person & { status: "pending" | "accepted"; incoming: boolean };
type State = {
  groups: Group[];
  me: { id: string; public: boolean };
  people: Person[];
  edges: Edge[];
  blocked: Person[];
};
type Group = {
  id: string;
  name: string;
  owner: string;
  status: "active" | "invited";
  members: Person[];
};
type Target = Person & { kind: "person" | "group" };
type Message = {
  id: number;
  mine: boolean;
  name?: string;
  text: string;
  createdAt: string;
};
function errorText(error: unknown) {
  if (error instanceof MemberApiError) {
    if (error.status === 401)
      return "Your session has expired. Please sign in again.";
    if (error.status === 429)
      return "Please wait a minute before trying again.";
    if (error.code === "connection_required" || error.code === "not_available")
      return "This connection is no longer available. Refresh Connect to see the latest status.";
    if (error.code === "group_limit")
      return "A member has reached the 50-group limit. Leave an unused group before creating another.";
    if (error.code === "group_not_available")
      return "This group can’t be created or joined with these members. Check your connections or choose a different group.";
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
    [tab, setTab] = useState<
      "connections" | "groups" | "discover" | "requests"
    >("connections"),
    [selected, setSelected] = useState<Target | null>(null),
    [creating, setCreating] = useState(false),
    [groupName, setGroupName] = useState(""),
    [chosen, setChosen] = useState<string[]>([]);
  const mounted = useRef(true),
    loading = useRef<Promise<void> | null>(null),
    groupId = useRef(crypto.randomUUID());
  async function refresh(force = false) {
    if (loading.current) {
      await loading.current;
      if (!force) return;
    }
    const task = (async () => {
      try {
        const next = (await memberApi("connect")) as unknown as State;
        if (mounted.current) {
          setData(next);
          setError("");
          setSelected((current) =>
            current &&
            (current.kind === "group"
              ? next.groups.some(
                  (g) => g.id === current.id && g.status === "active",
                )
              : next.edges.some(
                  (e) => e.id === current.id && e.status === "accepted",
                ))
              ? current
              : null,
          );
        }
      } catch (e) {
        if (mounted.current) setError(errorText(e));
      }
    })();
    loading.current = task;
    await task;
    if (loading.current === task) loading.current = null;
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
      const result = await memberApi("connect", {
        action,
        ...(peer ? { peer } : {}),
        ...extra,
      });
      await refresh(true);
      return result;
    } catch (e) {
      if (mounted.current) setError(errorText(e));
      return null;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const incoming =
      data?.edges.filter((e) => e.status === "pending" && e.incoming) ?? [],
    outgoing =
      data?.edges.filter((e) => e.status === "pending" && !e.incoming) ?? [],
    friends = data?.edges.filter((e) => e.status === "accepted") ?? [];
  const selectedGroup = data?.groups.find((g) => g.id === selected?.id);
  function row(p: Person, children: React.ReactNode) {
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
  function block(p: Person) {
    if (
      confirm(
        `Block ${p.name}? Your direct conversation will be removed. You’ll leave shared groups; any shared groups you created will close.`,
      )
    )
      void act("block", p.id);
  }
  function groupAction(action: string, g: Group) {
    void act(action, undefined, { group: g.id });
  }
  return (
    <div className="connect-page">
      <div className="connect-title">
        <h1>Connect</h1>
        <label
          className="connect-toggle"
          title="Public lets app members find your name and request a connection."
        >
          <input
            type="checkbox"
            role="switch"
            aria-label="Public profile"
            checked={data?.me.public ?? false}
            disabled={!data || busy}
            onChange={(e) =>
              void act("privacy", undefined, { public: e.target.checked })
            }
          />
          <span className="connect-switch" aria-hidden="true" />
          <span>{data?.me.public ? "Public" : "Private"}</span>
        </label>
      </div>
      <p className="connect-status small muted">
        {data?.me.public
          ? "Your name is visible to app members. Requests need your approval."
          : "You’re hidden from discovery. Accepted connections can still message you."}
      </p>
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
        <Card className="connect-panel">
          {!selected && !creating && (
            <>
              <div className="connect-toolbar">
                <div
                  className="connect-tabs"
                  role="tablist"
                  aria-label="Connect sections"
                >
                  {(
                    [
                      ["connections", `Chats (${friends.length})`],
                      ["groups", `Groups (${data.groups.length})`],
                      ["discover", "Find"],
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
              </div>
              <div className="connect-section-top">
                <h2>
                  {tab === "connections"
                    ? "Your connections"
                    : tab === "groups"
                      ? "Group chats"
                      : tab === "discover"
                        ? "Find members"
                        : "Connection requests"}
                </h2>
                {(tab === "connections" || tab === "groups") && (
                  <button
                    className="secondary"
                    onClick={() => {
                      setCreating(true);
                      setChosen([]);
                      setGroupName("");
                      groupId.current = crypto.randomUUID();
                    }}
                  >
                    <Plus size={15} /> New group
                  </button>
                )}
              </div>
              {tab === "connections" && (
                <>
                  {friends.length === 0 ? (
                    <p>
                      No connections yet. Find public members and send your
                      first request.
                    </p>
                  ) : (
                    friends.map((p) =>
                      row(
                        p,
                        <>
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              setSelected({ ...p, kind: "person" })
                            }
                          >
                            <MessageCircle size={15} /> Message
                          </button>
                          <details className="connect-options">
                            <summary aria-label={`Options for ${p.name}`}>
                              •••
                            </summary>
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  confirm(
                                    `Disconnect from ${p.name}? This removes your direct conversation for both of you.`,
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
                              onClick={() => block(p)}
                            >
                              Block
                            </button>
                          </details>
                        </>,
                      ),
                    )
                  )}
                </>
              )}
              {tab === "discover" && (
                <>
                  <label className="connect-search">
                    <Search size={17} />
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
                      return row(
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
                      No public members found. Members appear once they opt in
                      to Connect.
                    </p>
                  )}
                </>
              )}
              {tab === "requests" && (
                <>
                  <h3>Received</h3>
                  {!incoming.length && <p>No new requests.</p>}
                  {incoming.map((p) =>
                    row(
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
                          onClick={() => block(p)}
                        >
                          Block
                        </button>
                      </>,
                    ),
                  )}
                  <h3>Sent</h3>
                  {!outgoing.length && <p>No pending requests.</p>}
                  {outgoing.map((p) =>
                    row(
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
              {tab === "groups" && (
                <>
                  {!data.groups.length && (
                    <p>Create a group with two or more of your connections.</p>
                  )}
                  {data.groups.map((g) => (
                    <div key={g.id} className="connect-group">
                      <div>
                        <h3>{g.name}</h3>
                        <p className="small muted">
                          {g.members
                            .map((p) => (p.id === data.me.id ? "You" : p.name))
                            .join(", ")}
                          {g.status === "invited" ? " · Invitation" : ""}
                        </p>
                      </div>
                      <div className="connect-actions">
                        {g.status === "invited" ? (
                          <>
                            <button
                              className="primary"
                              disabled={busy}
                              onClick={() => groupAction("join_group", g)}
                            >
                              Join group
                            </button>
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() => groupAction("decline_group", g)}
                            >
                              Decline
                            </button>
                          </>
                        ) : (
                          <button
                            className="primary"
                            onClick={() => setSelected({ ...g, kind: "group" })}
                          >
                            Open chat
                          </button>
                        )}
                      </div>
                      {g.status === "invited" && (
                        <p className="small muted">
                          Joining shares your name and messages with everyone in
                          this group.
                        </p>
                      )}
                    </div>
                  ))}
                </>
              )}
            </>
          )}
          {creating && !selected && (
            <form
              className="connect-group-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const result = await act("create_group", undefined, {
                  group: groupId.current,
                  groupName,
                  members: chosen,
                });
                if (result) {
                  setCreating(false);
                  setTab("groups");
                  setSelected({
                    id: String(result.id),
                    name: groupName.trim(),
                    kind: "group",
                  });
                }
              }}
            >
              <div className="connect-section-top">
                <h2>New group</h2>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </button>
              </div>
              <label>
                Group name
                <input
                  required
                  maxLength={60}
                  value={groupName}
                  onChange={(e) => {
                    setGroupName(e.target.value);
                    groupId.current = crypto.randomUUID();
                  }}
                  placeholder="e.g. Morning crew"
                />
              </label>
              <fieldset>
                <legend>Choose connections ({chosen.length}/19)</legend>
                <div className="connect-group-picker">
                  {friends.map((p) => (
                    <label key={p.id}>
                      <input
                        type="checkbox"
                        checked={chosen.includes(p.id)}
                        disabled={
                          busy ||
                          (!chosen.includes(p.id) && chosen.length >= 19)
                        }
                        onChange={(e) => {
                          setChosen((ids) =>
                            e.target.checked
                              ? [...ids, p.id]
                              : ids.filter((id) => id !== p.id),
                          );
                          groupId.current = crypto.randomUUID();
                        }}
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="small muted">
                Choose at least two connections. They’ll receive an invitation
                and can join or decline.
              </p>
              <button
                className="primary"
                disabled={busy || chosen.length < 2 || !groupName.trim()}
              >
                {busy ? "Creating…" : "Create group"}
              </button>
            </form>
          )}
          {selected && (
            <>
              {selectedGroup && (
                <details className="connect-group-details">
                  <summary>
                    {selectedGroup.members.length} group members
                  </summary>
                  {selectedGroup.members.map((p) => (
                    <div key={p.id} className="connect-roster">
                      <span>{p.id === data.me.id ? "You" : p.name}</span>
                      {p.id !== data.me.id && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => block(p)}
                        >
                          Block
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          selectedGroup.owner === data.me.id
                            ? "Close this group and remove its messages for everyone?"
                            : "Leave this group? You’ll lose access to its messages.",
                        )
                      )
                        groupAction(
                          selectedGroup.owner === data.me.id
                            ? "close_group"
                            : "leave_group",
                          selectedGroup,
                        );
                    }}
                  >
                    {selectedGroup.owner === data.me.id
                      ? "Close group"
                      : "Leave group"}
                  </button>
                </details>
              )}
              <Conversation
                key={selected.id}
                person={selected}
                close={() => setSelected(null)}
              />
            </>
          )}
          {!selected && !creating && !!data.blocked.length && (
            <details className="connect-blocked">
              <summary>Blocked members ({data.blocked.length})</summary>
              {data.blocked.map((p) =>
                row(
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
          )}
        </Card>
      )}
    </div>
  );
}
function Conversation({
  person,
  close,
}: {
  person: Target;
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
        `connect?${person.kind === "group" ? "group" : "peer"}=${person.id}${before ? `&before=${before}` : ""}`,
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
    <div className="connect-chat">
      <div className="section-top">
        <h2>{person.name}</h2>
        <button className="secondary" onClick={close}>
          <ArrowLeft size={15} /> Back
        </button>
      </div>
      <p className="small muted">
        {person.kind === "group"
          ? "Messages are shared with members who join this group."
          : "Only you and your connection can view these messages in the app."}
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
            <span className="small muted">
              {m.mine ? "You" : (m.name ?? person.name)}
            </span>
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
              action: person.kind === "group" ? "group_send" : "send",
              ...(person.kind === "group"
                ? { group: person.id }
                : { peer: person.id }),
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
    </div>
  );
}
