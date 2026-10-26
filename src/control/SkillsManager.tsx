import { useEffect, useRef, useState } from "react";
import { Film, Upload, Trash2 } from "lucide-react";
import { Card } from "../components/UI";
import {
  MAX_SKILL_VIDEO_BYTES,
  type SkillVideo,
  type SkillCategory,
} from "../data/skills";
import { controlApi, ControlError } from "./api";
function encodeThumbnail(
  source: CanvasImageSource,
  width: number,
  height: number,
) {
  const scale = Math.min(1, 1280 / width, 720 / height),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw Error("Couldn’t prepare this thumbnail.");
  context.fillStyle = "#f0f2f4";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.7, 0.5, 0.35]) {
    const image = canvas.toDataURL("image/jpeg", quality).split(",")[1];
    if (image.length <= 349520) return image;
  }
  throw Error("This frame is too detailed. Try another frame.");
}
async function thumbnailImage(file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 15 * 1024 * 1024
  )
    throw Error("Choose a JPG, PNG or WebP image up to 15 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    return encodeThumbnail(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
type ManagedVideo = SkillVideo & { published: boolean; size: number };
export function SkillsManager({
  available,
  onAccessError,
}: {
  available: boolean;
  onAccessError: (error: unknown) => void;
}) {
  const [videos, setVideos] = useState<ManagedVideo[]>([]),
    [filter, setFilter] = useState<"All" | SkillCategory>("All"),
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
  const players = useRef<Record<string, HTMLVideoElement | null>>({});
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
      file.size > MAX_SKILL_VIDEO_BYTES
    ) {
      setError(
        "Choose an MP4 or WebM video up to 100 MB. Export phone videos as MP4 first.",
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
      setFilter(category);
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
  async function chooseThumbnail(video: ManagedVideo, file: File | null) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const image = file ? await thumbnailImage(file) : null;
      if (!alive.current) return;
      await controlApi("skills/thumbnail", {
        id: video.id,
        image,
        mime: "image/jpeg",
      });
      if (!alive.current) return;
      await load();
      setMessage(
        file
          ? "Thumbnail saved. Members will see it on this video."
          : "Thumbnail removed.",
      );
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error && !(e instanceof ControlError)
            ? e.message
            : "Couldn’t save the thumbnail. Please try again.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function captureFrame(video: ManagedVideo) {
    const player = players.current[video.id];
    if (
      !player ||
      player.readyState < 2 ||
      !player.videoWidth ||
      player.seeking
    ) {
      setError(
        "Play or scrub the video to your chosen frame, then pause it before saving.",
      );
      return;
    }
    player.pause();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const image = encodeThumbnail(
        player,
        player.videoWidth,
        player.videoHeight,
      );
      await controlApi("skills/thumbnail", {
        id: video.id,
        image,
        mime: "image/jpeg",
      });
      if (!alive.current) return;
      await load();
      setMessage("Video frame saved as the thumbnail.");
    } catch {
      if (alive.current)
        setError(
          "Couldn’t capture this frame. Play the video, pause on a frame and try again.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const filtered =
    filter === "All"
      ? videos
      : videos.filter((video) => video.category === filter);
  return (
    <div className="control-skills-layout">
      <Card>
        <h2>
          <Upload size={20} /> Upload a skill video
        </h2>
        <p className="small muted">
          Add your coaching videos here, then choose a thumbnail and preview the
          draft before publishing.
        </p>
        {!available && (
          <p className="small" role="status">
            Video storage is not ready yet. You can fill in the details; uploads
            will be enabled when the app’s video storage connection is ready.
            Try Refresh after deployment finishes.
          </p>
        )}
        <form className="control-form" onSubmit={(e) => void upload(e)}>
          <label>
            Video title
            <input
              required
              maxLength={100}
              value={title}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Back squat technique"
            />
          </label>
          <label>
            Category
            <select
              value={category}
              disabled={busy}
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
              disabled={busy}
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
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <p className="small muted">
            MP4 or WebM, up to 100 MB. MP4 with H.264 video and AAC audio gives
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
        <div
          className="control-skills-subtabs"
          role="group"
          aria-label="Skill video categories"
        >
          {(["All", "Box", "Lift", "Sweat"] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={filter === c}
              onClick={() => setFilter(c)}
            >
              {c}
              <span>
                {c === "All"
                  ? videos.length
                  : videos.filter((v) => v.category === c).length}
              </span>
            </button>
          ))}
        </div>
        {loading && !videos.length ? (
          <p role="status">Loading videos…</p>
        ) : !filtered.length ? (
          <div className="control-empty">
            <Film size={32} />
            <h3>
              {filter === "All"
                ? "No videos uploaded yet"
                : `No ${filter} videos yet`}
            </h3>
            <p>Your coaching library starts here.</p>
          </div>
        ) : (
          <div className="control-skill-list">
            {filtered.map((v) => (
              <article key={v.id} className="control-skill-video">
                <div className="section-top">
                  <h3>{v.title}</h3>
                  <span className="control-video-status">
                    {v.published ? "Published" : "Draft"}
                  </span>
                </div>
                <video
                  ref={(player) => {
                    players.current[v.id] = player;
                  }}
                  controls
                  playsInline
                  preload="none"
                  aria-label={v.title}
                  src={"/api/control/skills/video/" + v.id}
                  poster={v.posterUrl?.replace(
                    "/api/gymmaster/",
                    "/api/control/",
                  )}
                />
                <p className="small muted">
                  Play or scrub the video, pause on the frame you want, then
                  save it as the thumbnail.
                </p>
                <div className="control-thumbnail-actions">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void captureFrame(v)}
                  >
                    Use this frame as thumbnail
                  </button>
                  <label className="secondary control-thumbnail-picker">
                    Upload image instead
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-label={"Choose thumbnail for " + v.title}
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void chooseThumbnail(v, file);
                      }}
                    />
                  </label>
                  {v.posterUrl && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void chooseThumbnail(v, null)}
                    >
                      Remove thumbnail
                    </button>
                  )}
                  <small className="muted">
                    JPG, PNG or WebP. Images are resized automatically.
                  </small>
                </div>
                <p className="small muted">
                  {v.category} · {(v.size / 1024 / 1024).toFixed(1)} MB
                </p>
                <p>{v.description}</p>
                <div className="control-video-actions">
                  <button
                    className={v.published ? "secondary" : "primary"}
                    disabled={busy}
                    onClick={() => void change(v)}
                  >
                    {v.published ? "Unpublish" : "Publish video"}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
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
