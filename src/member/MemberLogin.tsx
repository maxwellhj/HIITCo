import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Brand, Card } from "../components/UI";
import { memberApi, memberError } from "./api";
export function MemberLogin({
  onLogin,
  onDemo,
  message,
}: {
  onLogin: () => void;
  onDemo: () => void;
  message: string;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [remember, setRemember] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <div className="member-login">
      <Brand />
      <Card>
        <div className="icon-tile">
          <LockKeyhole />
        </div>
        <h1>Welcome to HIIT Co. Hub</h1>
        <p>
          Sign in with your GymMaster member account to see your visits and
          progress.
        </p>
        {(error || message) && (
          <p role="alert" className="error">
            {error || message}
          </p>
        )}
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const credentials = { email, password, remember };
            setPassword("");
            try {
              const result = await memberApi("login", credentials);
              if (result.connected !== true) throw Error();
              onLogin();
            } catch (err) {
              setError(memberError(err, "login"));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            GymMaster member email
            <input
              type="email"
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
              autoComplete="current-password"
              required
              maxLength={1024}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <div>
            <label className="remember-login">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={busy}
                aria-describedby="remember-login-help"
              />
              Keep me logged in
            </label>
            <p id="remember-login-help" className="small muted">
              Remember this session when I reopen the app, until GymMaster
              requires another sign-in.
            </p>
          </div>
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="small muted">
          Use your member login, rather than a staff login. Your password isn’t
          saved. GymMaster sessions usually last one hour.
        </p>
        <button className="text-button" onClick={onDemo} disabled={busy}>
          Explore the fictional demo
        </button>
      </Card>
    </div>
  );
}
