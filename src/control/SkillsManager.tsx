import { useEffect, useRef, useState } from "react";
import { Film, Upload, Trash2 } from "lucide-react";
import { Card } from "../components/UI";
import type { SkillVideo, SkillCategory } from "../data/skills";
import { controlApi, ControlError } from "./api";
type ManagedVideo = SkillVideo & { published: boolean; size: number };
export function SkillsManager({
  available,
  onAccessError,
}: {
  available: boolean;
  onAccessError: (error: unknown) => void;
}) {
  const [videos, setVideos] = useState<ManagedVideo[]>([]),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [category, setCategory] = useState<SkillCategory>("Box"),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [removing, setRemoving] = useState<string | null>(null),
    [loading, setLoading] = useState(false);
  const xhr = useRef<XMLHttpRequest | null>(null),
    input = useRef<HTMLInputElement | null>(null),
    alive = useRef(true);
  async function load(signal?: AbortSignal) {
    if (!available) return;
    setLoading(true);
    try {
      const data = await controlApi("skills", undefined, signal);
      if (!signal?.aborted && alive.current) setVideos(data.videos);
    } catch (e) {
      if (!signal?.aborted && alive.current) {
        setError("Couldn’t load the Skills Library. Please refresh.");
        if (e instanceof ControlError && e.status === 403) onAccessError(e);
      }
    } finally {
      if (!signal?.aborted && alive.current) setLoading(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    if (available) void load(abort.signal);
    else setVideos([]);
    return () => {
      alive.current = false;
      abort.abort();
      xhr.current?.abort();
    };
  }, [available]);
  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || busy || !available) return;
    const mime =
      file.type ||
      (file.name.toLowerCase().endsWith(".mp4")
        ? "video/mp4"
        : file.name.toLowerCase().endsWith(".webm")
          ? "video/webm"
          : "");
    if (
      !["video/mp4", "video/webm"].includes(mime) ||
      file.size < 16 ||
      file.size > 50 * 1024 * 1024
    ) {
      setError(
        "Choose an MP4 or WebM video up to 50 MB. Export phone videos as MP4 first.",
      );
      return;
    }
    setBusy(true);
    setProgress(0);
    setError("");
    setMessage("");
    try {
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        xhr.current = request;
        const params = new URLSearchParams({
          title: title.trim(),
          description: description.trim(),
          category,
        });
        request.open("POST", "/api/control/skills/upload?" + params);
        request.responseType = "json";
        request.timeout = 15 * 60 * 1000;
        request.setRequestHeader("Content-Type", mime);
        request.setRequestHeader("X-Video-Size", String(file.size));
        request.upload.onprogress = (e) => {
          if (e.lengthComputable && alive.current)
            setProgress(Math.round((e.loaded / e.total) * 100));
        };
        request.onload = () =>
          request.status >= 200 && request.status < 300
            ? resolve()
            : reject(
                new ControlError(
                  request.status,
                  request.response?.error ?? "upload_failed",
                ),
              );
        request.onerror = () => reject(Error());
        request.onabort = () => reject(Error());
        request.ontimeout = () => reject(Error());
        request.send(file);
      });
      if (!alive.current) return;
      setTitle("");
      setDescription("");
      setFile(null);
      if (input.current) input.current.value = "";
      setMessage(
        "Video uploaded as a draft. Preview it, then publish when it’s ready.",
      );
      await load();
    } catch (e) {
      if (alive.current) {
        setError(
          "Upload didn’t complete. Check the file and connection, then try again.",
        );
        if (e instanceof ControlError && e.status === 403) onAccessError(e);
      }
    } finally {
      if (alive.current) setBusy(false);
      xhr.current = null;
    }
  }
  async function change(video: ManagedVideo, remove = false) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await controlApi("skills/" + (remove ? "remove" : "publish"), {
        id: video.id,
        ...(!remove ? { published: !video.published } : {}),
      });
      if (!alive.current) return;
      setRemoving(null);
      await load();
      setMessage(
        remove
          ? "Video removed."
          : video.published
            ? "Video hidden from members."
            : "Video published to the member Skills Library.",
      );
    } catch (e) {
      if (alive.current) {
        setError("Couldn’t update this video. Please refresh and try again.");
        if (e instanceof ControlError && e.status === 403) onAccessError(e);
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="control-skills-layout">
      <Card>
        <h2>
          <Upload size={20} /> Upload a skill video
        </h2>
        <p className="small muted">
          Add your coaching videos here. Preview the draft, then publish it for
          members.
        </p>
        <form className="control-form" onSubmit={(e) => void upload(e)}>
          <label>
            Video title
            <input
              required
              maxLength={100}
              value={title}
              disabled={busy || !available}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Back squat technique"
            />
          </label>
          <label>
            Category
            <select
              value={category}
              disabled={busy || !available}
              onChange={(e) => setCategory(e.target.value as SkillCategory)}
            >
              {["Box", "Lift", "Sweat"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Coaching notes
            <textarea
              maxLength={500}
              rows={3}
              value={description}
              disabled={busy || !available}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Video file
            <input
              ref={input}
              type="file"
              accept="video/mp4,video/webm,.mp4,.webm"
              required
              disabled={busy || !available}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <p className="small muted">
            MP4 or WebM, up to 50 MB. MP4 with H.264 video and AAC audio gives
            the widest phone support.
          </p>
          {busy && xhr.current && (
            <div role="status">
              <progress max={100} value={progress} />
              <p className="small">
                {progress === 100
                  ? "Finishing upload…"
                  : `Uploading ${progress}%`}
              </p>
            </div>
          )}
          <button
            className="primary"
            disabled={busy || !available || !file || !title.trim()}
          >
            <Upload size={17} />
            {busy ? "Please wait…" : "Upload video"}
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </Card>
      <Card>
        <div className="section-top">
          <h2>Skills Library</h2>
          <button
            className="text-button"
            disabled={busy || !available || loading}
            onClick={() => void load()}
          >
            Refresh videos
          </button>
        </div>
        <p className="small muted">
          Published videos appear through the Skills Library button in the
          member app.
        </p>
        {loading && !videos.length ? (
          <p role="status">Loading videos…</p>
        ) : !videos.length ? (
          <div className="control-empty">
            <Film size={32} />
            <h3>No videos uploaded yet</h3>
            <p>Your coaching library starts here.</p>
          </div>
        ) : (
          <div className="control-skill-list">
            {videos.map((v) => (
              <article key={v.id} className="control-skill-video">
                <video
                  controls
                  playsInline
                  preload="none"
                  aria-label={v.title}
                  src={"/api/control/skills/video/" + v.id}
                />
                <div className="section-top">
                  <h3>{v.title}</h3>
                  <span className="control-video-status">
                    {v.published ? "Published" : "Draft"}
                  </span>
                </div>
                <p className="small muted">
                  {v.category} · {(v.size / 1024 / 1024).toFixed(1)} MB
                </p>
                <p>{v.description}</p>
                <div className="control-video-actions">
                  <button
                    className={v.published ? "secondary" : "primary"}
                    disabled={busy || !available}
                    onClick={() => void change(v)}
                  >
                    {v.published ? "Unpublish" : "Publish video"}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || !available}
                    onClick={() => setRemoving(v.id)}
                  >
                    <Trash2 size={15} /> Remove
                  </button>
                </div>
                {removing === v.id && (
                  <div className="control-video-confirm">
                    <p>Remove “{v.title}” and its video file?</p>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => setRemoving(null)}
                    >
                      Keep video
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void change(v, true)}
                    >
                      Remove permanently
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
