import { useEffect, useState } from "react";
import { ArrowLeft, Check, Link2, LockKeyhole } from "lucide-react";
import { GymMasterProfile } from "../components/GymMasterProfile";
import { GymMasterVisits } from "../components/GymMasterVisits";
import { Card } from "../components/UI";
import { formatDate } from "../domain/attendance";
interface ConnectionStatus {
  connected: boolean;
  expiresAt?: number;
}
const messages: Record<string, string> = {
  connection_unavailable:
    "The connection isn’t ready yet. Please check the Cloudflare deployment and runtime secret setup.",
  sign_in_not_accepted:
    "GymMaster didn’t accept this sign-in. Check your member email and password. If they’re correct, ask the club to check the integration setup.",
  too_many_attempts:
    "Too many sign-in attempts. Please wait a minute before trying again.",
  provider_unavailable:
    "GymMaster couldn’t be reached or didn’t complete the request. Please try again shortly.",
  provider_redirect:
    "GymMaster redirected the connection to another address. Please send us this message so we can check the correct address. (GM-REDIRECT)",
  provider_timeout:
    "GymMaster took too long to respond. Please try once more in a minute. If it happens again, send us this message. (GM-TIMEOUT)",
  provider_network_error:
    "Our server couldn’t establish a connection to GymMaster. Please send us this message. (GM-NETWORK)",
  session_unavailable:
    "GymMaster accepted your sign-in, but the app couldn’t create a secure session. Please send us this message. (GM-SESSION)",
  unexpected_response:
    "GymMaster returned a format we couldn’t verify. Please send us this message. (GM-FORMAT)",
  invalid_request: "Please enter your GymMaster member email and password.",
};
async function request(
  path: string,
  body?: unknown,
): Promise<ConnectionStatus> {
  const response = await fetch(`/api/gymmaster/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.headers.get("Content-Type")?.includes("application/json"))
    throw Error(
      "The connection-test backend isn’t available yet. Please wait for the Cloudflare deployment to finish.",
    );
  const data: unknown = await response.json();
  if (!data || typeof data !== "object")
    throw Error("The connection test returned an unexpected response.");
  const result = data as Record<string, unknown>;
  if (!response.ok)
    throw Error(
      (result.error === "provider_http_error" &&
      Number.isInteger(result.providerStatus) &&
      Number(result.providerStatus) >= 400 &&
      Number(result.providerStatus) <= 599
        ? `GymMaster returned an error. Please send us this message. (GM-HTTP-${result.providerStatus})`
        : result.error === "unexpected_response" &&
            [
              "ENVELOPE",
              "RESULT",
              "TOKEN",
              "EXPIRY",
              "MEMBER",
              "BODY",
            ].includes(String(result.detail))
          ? `GymMaster’s reply didn’t match the expected format. Please send us this code: GM-FORMAT-${result.detail}.`
          : messages[String(result.error)]) ??
        "We couldn’t complete the connection test. Please try again.",
    );
  if (
    typeof result.connected !== "boolean" ||
    (result.connected &&
      (typeof result.expiresAt !== "number" ||
        !Number.isFinite(result.expiresAt)))
  )
    throw Error("The connection test returned an unexpected response.");
  return result as unknown as ConnectionStatus;
}
export function GymMasterConnection() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function check() {
    setError("");
    setBusy(true);
    request("session")
      .then(setStatus)
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Couldn’t check the connection.",
        ),
      )
      .finally(() => setBusy(false));
  }
  useEffect(() => {
    let active = true;
    request("session")
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "Couldn’t check the connection.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!status?.connected || !status.expiresAt) return;
    const timer = setTimeout(
      () => {
        setStatus({ connected: false });
        setError(
          "Your connection session has expired. Sign in again to verify it.",
        );
      },
      Math.max(0, status.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [status]);
  return (
    <div className="gymmaster-connection">
      <a className="text-button" href="#home">
        <ArrowLeft size={16} />
        Back to Home
      </a>
      <Card className="connection-card">
        <div className="icon-tile">
          <Link2 size={24} />
        </div>
        <h2>
          {status?.connected
            ? "GymMaster sign-in verified"
            : "Connect your GymMaster account"}
        </h2>
        <p>
          Connection preview. Your real profile and attendance appear here after
          sign-in. The homepage and other tabs still show fictional demo data.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {status === null ? (
          <div className="connection-loading">
            {error ? (
              <button className="secondary" disabled={busy} onClick={check}>
                {busy ? "Checking…" : "Try again"}
              </button>
            ) : (
              <p role="status">Checking your connection…</p>
            )}
          </div>
        ) : status.connected ? (
          <div className="connection-success">
            <p role="status">
              <Check size={18} />
              Your member sign-in worked.
            </p>
            <p>
              This connection expires at{" "}
              {formatDate(new Date(status.expiresAt!).toISOString(), {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}{" "}
              NZ time.
            </p>
            <p>
              Your profile and visits below belong to your signed-in GymMaster
              account.
            </p>
            <GymMasterProfile />
            <GymMasterVisits />
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  setStatus(await request("logout", {}));
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Couldn’t disconnect.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Disconnecting…" : "Disconnect GymMaster"}
            </button>
          </div>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              setBusy(true);
              const credentials = { email, password };
              setPassword("");
              try {
                setStatus(await request("login", credentials));
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Couldn’t sign in. Please try again.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              GymMaster member email
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              GymMaster member password
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                maxLength={1024}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </label>
            <button className="primary" disabled={busy}>
              <LockKeyhole size={17} />
              {busy ? "Checking with GymMaster…" : "Verify my connection"}
            </button>
            <p className="connection-privacy">
              Use your own authorised member account. We send your credentials
              to GymMaster over HTTPS to check the sign-in; we don’t save your
              password.
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}
