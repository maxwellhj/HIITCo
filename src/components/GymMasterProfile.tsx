import { useEffect, useState } from "react";
import type { GymMasterMemberProfile } from "../domain/gymmasterProfile";
export function GymMasterProfile() {
  const [profile, setProfile] = useState<GymMasterMemberProfile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setProfile(null);
    setError("");
    setLoading(true);
    async function load() {
      try {
        const response = await fetch("/api/gymmaster/profile", {
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) {
          const messages: Record<string, string> = {
            session_expired:
              "Your session has expired. Disconnect and sign in again to load your profile.",
            too_many_attempts:
              "Please wait a minute before refreshing your profile again.",
            profile_format:
              "GymMaster’s profile reply differs from the documentation. Please tell us GM-PROFILE-FORMAT.",
            profile_not_available:
              "GymMaster couldn’t provide your profile. Please tell us GM-PROFILE-UNAVAILABLE.",
          };
          throw Error(
            messages[String(body?.error)] ??
              "Couldn’t load your GymMaster profile. Please try again shortly.",
          );
        }
        const p = body?.profile;
        if (
          !p ||
          typeof p.firstName !== "string" ||
          !p.firstName.trim() ||
          typeof p.lastName !== "string" ||
          !(
            p.totalVisits === null ||
            (Number.isSafeInteger(p.totalVisits) && p.totalVisits >= 0)
          )
        )
          throw Error(
            "Unexpected profile response. Please tell us GM-PROFILE-FORMAT.",
          );
        if (active) setProfile(p);
      } catch (err) {
        if (active)
          setError(
            err instanceof Error ? err.message : "Couldn’t load your profile.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [revision]);
  return (
    <section className="gymmaster-visits" aria-labelledby="live-profile-title">
      <h3 id="live-profile-title">Your GymMaster profile</h3>
      {loading ? (
        <p role="status">Loading your profile…</p>
      ) : error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : (
        profile && (
          <>
            <p className="live-member-name">
              <strong>
                {profile.firstName} {profile.lastName}
              </strong>
            </p>
            <p>
              Total visits recorded by GymMaster:{" "}
              <strong>
                {profile.totalVisits === null
                  ? "Not supplied"
                  : profile.totalVisits}
              </strong>
            </p>
          </>
        )
      )}
      <button
        className="secondary"
        disabled={loading}
        onClick={() => setRevision((v) => v + 1)}
      >
        Refresh profile
      </button>
    </section>
  );
}
