import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { memberApi, MemberApiError } from "./api";
import "./profile.css";
type Profile = {
  id: string;
  displayName: string;
  defaultName: string;
  customName: boolean;
  photo: string | null;
  public: boolean;
};
type Photo = { mime: "image/jpeg"; image: string };
async function preparePhoto(file: File): Promise<Photo> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 15 * 1024 * 1024
  )
    throw Error("Choose a JPG, PNG or WebP photo up to 15 MB.");
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw Error("This photo couldn’t be read. Try a JPG, PNG or WebP image.");
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw Error("Couldn’t prepare your photo.");
    context.fillStyle = "#eef3f7";
    context.fillRect(0, 0, 512, 512);
    const side = Math.min(image.width, image.height);
    context.drawImage(
      image,
      (image.width - side) / 2,
      (image.height - side) / 2,
      side,
      side,
      0,
      0,
      512,
      512,
    );
    for (const quality of [0.85, 0.7, 0.5]) {
      const data = canvas.toDataURL("image/jpeg", quality).split(",")[1];
      if (data.length <= 349520) return { mime: "image/jpeg", image: data };
    }
    throw Error("This image is too detailed. Try another photo.");
  } finally {
    image.close();
  }
}
export function ProfileButton({ initials }: { initials: string }) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => {
      void memberApi("connect?profile=me")
        .then((data) => {
          if (active) setProfile(data as unknown as Profile);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("hiitco-connect-profile", load);
    return () => {
      active = false;
      window.removeEventListener("hiitco-connect-profile", load);
    };
  }, []);
  return (
    <>
      <button
        className="avatar member-profile-button"
        aria-label="Edit your profile"
        onClick={() => setOpen(true)}
      >
        {profile?.photo ? (
          <img
            src={profile.photo}
            alt="Your profile"
            onError={() =>
              setProfile((current) =>
                current ? { ...current, photo: null } : null,
              )
            }
          />
        ) : (
          initials
        )}
      </button>
      {open && (
        <ProfileEditor
          initials={initials}
          close={() => setOpen(false)}
          onSaved={(next) => {
            setProfile(next);
            window.dispatchEvent(new Event("hiitco-connect-profile"));
          }}
        />
      )}
    </>
  );
}
function ProfileEditor({
  initials,
  close,
  onSaved,
}: {
  initials: string;
  close: () => void;
  onSaved: (p: Profile) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null),
    [name, setName] = useState(""),
    [photo, setPhoto] = useState<Photo | null | undefined>(undefined),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [processing, setProcessing] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let active = true;
    void memberApi("connect?profile=me")
      .then((data) => {
        if (active) {
          const p = data as unknown as Profile;
          setProfile(p);
          setName(p.displayName);
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Couldn’t load your profile. Close this window and try again.",
          );
      });
    return () => {
      active = false;
      element?.close();
    };
  }, []);
  const preview =
    photo === undefined
      ? profile?.photo
      : photo
        ? `data:${photo.mime};base64,${photo.image}`
        : null;
  return createPortal(
    <dialog
      ref={dialog}
      className="member-profile-dialog"
      aria-labelledby="profile-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy && !processing) close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy && !processing) close();
      }}
    >
      <div className="member-profile-editor">
        <div className="section-top">
          <h2 id="profile-title">Your profile</h2>
          <button
            className="icon-button"
            aria-label="Close profile editor"
            disabled={busy || processing}
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        {!profile && !error && <p role="status">Loading profile…</p>}
        {profile && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || processing) return;
              setBusy(true);
              setError("");
              try {
                await memberApi("connect", {
                  action: "profile_save",
                  displayName:
                    name.trim() === profile.defaultName ? null : name.trim(),
                  ...(photo !== undefined ? { photo } : {}),
                });
                const next = (await memberApi(
                  "connect?profile=me",
                )) as unknown as Profile;
                onSaved(next);
                close();
              } catch (err) {
                setError(
                  err instanceof MemberApiError && err.status === 401
                    ? "Your session has expired. Please sign in again."
                    : err instanceof MemberApiError && err.status === 429
                      ? "Please wait a minute before saving again."
                      : "Couldn’t save your profile. Check your name and photo, then try again.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="member-profile-photo">
              <span className="avatar">
                {preview ? (
                  <img src={preview} alt="Profile photo preview" />
                ) : (
                  initials
                )}
              </span>
              <div>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || processing}
                  onClick={() => input.current?.click()}
                >
                  <Camera size={16} />
                  {processing ? "Preparing…" : "Choose photo"}
                </button>
                {preview && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy || processing}
                    onClick={() => setPhoto(null)}
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="profile-file-input"
              aria-label="Upload profile photo"
              disabled={busy || processing}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setProcessing(true);
                setError("");
                try {
                  setPhoto(await preparePhoto(file));
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Couldn’t read that photo.",
                  );
                } finally {
                  setProcessing(false);
                }
              }}
            />
            <label className="member-profile-name">
              Display name
              <input
                required
                maxLength={40}
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
                autoComplete="nickname"
              />
            </label>
            <button
              type="button"
              className="text-button profile-name-reset"
              disabled={busy}
              onClick={() => setName(profile.defaultName)}
            >
              Use default: {profile.defaultName}
            </button>
            <p className="small muted">
              {profile.public
                ? "Your profile is Public. App members can see your photo and display name."
                : "Your profile is Private. Only you can see your photo. Switch to Public in Connect to share it."}
            </p>
            <div className="member-profile-footer">
              <a href="#account" onClick={close}>
                Account details
              </a>
              <button
                className="primary"
                disabled={busy || processing || !name.trim()}
              >
                {busy ? "Saving…" : "Save profile"}
              </button>
            </div>
          </form>
        )}
        {error && (
          <p role="alert" className="connect-error">
            {error}
          </p>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
