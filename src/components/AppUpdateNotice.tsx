import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
export function AppUpdateNotice() {
  const registration = useRef<ServiceWorkerRegistration | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const {
    needRefresh: [needed, setNeeded],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, value) {
      registration.current = value ?? null;
    },
  });
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void registration.current?.update().catch(() => {});
    };
    const timer = setInterval(check, 15 * 60 * 1000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  if (!needed) return null;
  return (
    <aside className="app-update-notice" role="status">
      <strong>App update available</strong>
      <p>Save any changes, then update to get the latest features.</p>
      <div>
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await updateServiceWorker(true);
            } catch {
              setError("Couldn’t update. Please try again.");
              setBusy(false);
            }
          }}
        >
          {busy ? "Updating…" : "Update app"}
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => setNeeded(false)}
        >
          Later
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}
