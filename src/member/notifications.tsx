import { useCallback, useEffect, useState } from "react";
import { Bell, MessageCircle, ArrowRight } from "lucide-react";
import { memberApi } from "./api";
import "./notifications.css";
export type UnreadThread = {
  id: string;
  kind: "person" | "group";
  name: string;
  count: number;
};
export function unreadChanged() {
  window.dispatchEvent(new Event("hiitco-connect-unread"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("hiitco-connect-unread");
    channel.postMessage("refresh");
    channel.close();
  }
}
export function useUnreadMessages(enabled: boolean) {
  const [data, setData] = useState<{ count: number; threads: UnreadThread[] }>({
    count: 0,
    threads: [],
  });
  useEffect(() => {
    if (!enabled) {
      setData({ count: 0, threads: [] });
      return;
    }
    let active = true,
      pending = false,
      queued = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (!active || document.visibilityState !== "visible") return;
      if (pending) {
        queued = true;
        return;
      }
      pending = true;
      try {
        const next = await memberApi(
          "connect?unread=1",
          undefined,
          controller.signal,
        );
        if (
          active &&
          Number.isInteger(next.count) &&
          Array.isArray(next.threads)
        )
          setData(next as unknown as typeof data);
      } catch {
      } finally {
        pending = false;
        if (queued && active) {
          queued = false;
          void refresh();
        }
      }
    };
    void refresh();
    const changed = () => void refresh();
    const pushed = (e: MessageEvent) => {
      if (e.data?.type === "HIITCO_MESSAGE_PUSH") {
        void refresh();
        window.dispatchEvent(new Event("hiitco-connect-message"));
      }
    };
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("hiitco-connect-unread")
        : null;
    if (channel) channel.onmessage = changed;
    const timer = setInterval(changed, 15000);
    window.addEventListener("hiitco-connect-unread", changed);
    window.addEventListener("focus", changed);
    document.addEventListener("visibilitychange", changed);
    navigator.serviceWorker?.addEventListener("message", pushed);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      channel?.close();
      window.removeEventListener("hiitco-connect-unread", changed);
      window.removeEventListener("focus", changed);
      document.removeEventListener("visibilitychange", changed);
      navigator.serviceWorker?.removeEventListener("message", pushed);
    };
  }, [enabled]);
  return data;
}
export function UnreadMessagesBanner({
  count,
  threads,
}: {
  count: number;
  threads: UnreadThread[];
}) {
  if (!count) return null;
  const first = threads[0];
  return (
    <section className="unread-home-banner" aria-label="Unread messages">
      <MessageCircle size={23} />
      <div>
        <strong>
          {count === 1
            ? "You have an unopened message"
            : `You have ${count} unopened messages`}
        </strong>
        <p>
          {threads
            .slice(0, 3)
            .map((t) => t.name)
            .join(", ")}
          {threads.length > 3 ? " and more" : ""}
        </p>
        <a
          href={
            first && threads.length === 1
              ? `#connect/${first.kind}/${encodeURIComponent(first.id)}`
              : "#connect"
          }
        >
          Open {threads.length === 1 ? "chat" : "Connect"}{" "}
          <ArrowRight size={15} />
        </a>
      </div>
    </section>
  );
}
type PushStatus =
  "checking" | "unsupported" | "install" | "off" | "on" | "denied";
export function useMessagePush(enabled: boolean) {
  const [status, setStatus] = useState<PushStatus>("checking"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const register = useCallback(async (subscription: PushSubscription) => {
    await memberApi("connect", {
      action: "push_subscribe",
      subscription: subscription.toJSON(),
    });
  }, []);
  useEffect(() => {
    if (!enabled) {
      setStatus("checking");
      setError("");
      return;
    }
    let active = true;
    const iOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone =
      matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone;
    if (iOS && !standalone) {
      setStatus("install");
      return;
    }
    if (
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    void navigator.serviceWorker
      .getRegistration()
      .then(async (reg) => {
        const subscription = await reg?.pushManager.getSubscription();
        if (subscription && Notification.permission === "granted") {
          await register(subscription);
          if (active) setStatus("on");
        } else if (active) setStatus("off");
      })
      .catch(() => {
        if (active) {
          setStatus("off");
          setError(
            "Couldn’t check notification settings. Try enabling them again.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [enabled, register]);
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      if (status === "on") {
        const reg = await navigator.serviceWorker.getRegistration(),
          subscription = await reg?.pushManager.getSubscription();
        if (subscription) {
          await memberApi("connect", {
            action: "push_unsubscribe",
            endpoint: subscription.endpoint,
          });
          await subscription.unsubscribe();
        }
        setStatus("off");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus(permission === "denied" ? "denied" : "off");
          return;
        }
        const registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(Error()), 10000),
          ),
        ]);
        const current = await new Promise<boolean>((resolve) => {
          const channel = new MessageChannel();
          const timeout = setTimeout(() => {
            channel.port1.close();
            resolve(false);
          }, 2000);
          channel.port1.onmessage = (e) => {
            clearTimeout(timeout);
            channel.port1.close();
            resolve(e.data?.ready === true);
          };
          registration.active?.postMessage({ type: "HIITCO_PUSH_READY" }, [
            channel.port2,
          ]);
        });
        if (!current) {
          setError("Tap Update app first, then enable notifications.");
          return;
        }
        const config = await memberApi("connect?push=1");
        const raw = atob(
          String(config.publicKey).replace(/-/g, "+").replace(/_/g, "/"),
        );
        const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription)
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          });
        await register(subscription);
        setStatus("on");
      }
    } catch {
      setError(
        "Couldn’t update notifications. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return { status, busy, error, toggle };
}
export function PushMessageControl({
  settings,
}: {
  settings: ReturnType<typeof useMessagePush>;
}) {
  const { status, busy, error, toggle } = settings;
  return (
    <div className="message-push-control">
      {status === "install" ? (
        <p>
          To enable push notifications on iPhone, add this app to your Home
          Screen and open it there.
        </p>
      ) : status === "unsupported" ? (
        <p>Push notifications aren’t supported in this browser.</p>
      ) : status === "denied" ? (
        <p>
          Notifications are blocked. You can allow them in your browser or
          device settings.
        </p>
      ) : (
        <button
          className="text-button"
          disabled={busy || status === "checking"}
          onClick={() => void toggle()}
        >
          <Bell size={14} />
          {busy
            ? "Updating…"
            : status === "on"
              ? "Notifications on · Turn off"
              : "Enable message notifications"}
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export async function stopDevicePush() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {
    /* Server logout also revokes this device's binding. */
  }
}
