import { useEffect, useRef, useState } from "react";
import { Card } from "../components/UI";
import { TrainingLog } from "../pages/TrainingLog";
import { parseTrainingLog, type TrainingLogData } from "../domain/training";
import { dateKey } from "../domain/attendance";
import { memberApi, MemberApiError } from "./api";
export function MemberTraining({
  firstName,
  route,
}: {
  firstName: string;
  route: string;
}) {
  const [data, setData] = useState<TrainingLogData | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const revision = useRef(0),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    setData(null);
    setError("");
    void memberApi("training", undefined, abort.signal)
      .then((result) => {
        const log = parseTrainingLog(result.log, dateKey(new Date()));
        if (
          !Number.isSafeInteger(result.revision) ||
          Number(result.revision) < 0
        )
          throw Error();
        if (!abort.signal.aborted) {
          revision.current = Number(result.revision);
          setData(log);
        }
      })
      .catch((err) => {
        if (!abort.signal.aborted)
          setError(
            err instanceof MemberApiError && err.status === 401
              ? "Please sign in again to open your log."
              : "Your training log is temporarily unavailable. Your saved records have not been changed.",
          );
      });
    return () => abort.abort();
  }, [attempt]);
  async function save(log: TrainingLogData) {
    try {
      const result = await memberApi(
        "training",
        { log, revision: revision.current },
        controller.current?.signal,
      );
      if (
        !Number.isSafeInteger(result.revision) ||
        Number(result.revision) !== revision.current + 1
      )
        throw Error();
      revision.current = Number(result.revision);
    } catch (err) {
      throw Error(
        err instanceof MemberApiError && err.status === 409
          ? "Your log changed in another window. Go to Home and reopen Log to load the latest version before saving again."
          : err instanceof MemberApiError && err.status === 401
            ? "Your session expired. Please sign in again before saving."
            : err instanceof MemberApiError && err.status === 429
              ? "Please wait a minute before saving again. Your entries are still here."
              : "Couldn’t save your log. Your entries are still here; please try again.",
      );
    }
  }
  if (!data)
    return (
      <Card className="state">
        <h2>
          {error ? "Your log is unavailable" : "Loading your training log…"}
        </h2>
        {error && (
          <>
            <p role="alert">{error}</p>
            <button
              className="primary"
              onClick={() => setAttempt((v) => v + 1)}
            >
              Try again
            </button>
          </>
        )}
      </Card>
    );
  let initial: string | null = null;
  try {
    initial = decodeURIComponent(route.split("/")[1] ?? "") || null;
  } catch {
    /* malformed link opens the exercise list */
  }
  return (
    <TrainingLog
      member={{ id: "authenticated-member", firstName }}
      initialExerciseId={initial}
      accountStorage={{ initial: data, save }}
    />
  );
}
