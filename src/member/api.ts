export class MemberApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public providerStatus?: number,
    public diagnostic?: string,
  ) {
    super(code);
  }
}
export async function memberApi(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`/api/gymmaster/${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new MemberApiError("network", 0);
  }
  if (!response.headers.get("Content-Type")?.includes("application/json"))
    throw new MemberApiError("response", response.status);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new MemberApiError("response", response.status);
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new MemberApiError("response", response.status);
  const result = data as Record<string, unknown>;
  if (!response.ok)
    throw new MemberApiError(
      typeof result.error === "string" ? result.error : "response",
      response.status,
      typeof result.providerStatus === "number"
        ? result.providerStatus
        : undefined,
      typeof result.code === "string" &&
        /^GM-CHECKINS-(?:CONFIG|LIMITER|LOOKUP|DECRYPT|FORMAT)$/.test(
          result.code,
        )
        ? result.code
        : undefined,
    );
  return result;
}
export function memberError(
  error: unknown,
  area: "login" | "profile" | "visits" | "session" | "checkins",
): string {
  if (!(error instanceof MemberApiError))
    return "We couldn’t read your member information. Please try again.";
  if (error.status === 401)
    return area === "login"
      ? "GymMaster didn’t accept that sign-in. Check your member email and password."
      : "Your session has expired. Please sign in again.";
  if (error.code === "too_many_attempts")
    return "Please wait a minute before trying again.";
  if (error.code === "connection_unavailable")
    return "The member connection isn’t ready. Please contact the club.";
  if (area === "checkins")
    return `Check-in times are temporarily unavailable. Please tell us ${error.diagnostic ?? "GM-CHECKINS-CONNECTION"}.`;
  if (area === "visits") {
    const prefix = "Weekly attendance and streaks are temporarily unavailable.";
    const suffix =
      error.code === "provider_http_error" &&
      Number.isInteger(error.providerStatus) &&
      error.providerStatus! >= 400 &&
      error.providerStatus! <= 599
        ? `HTTP-${error.providerStatus}`
        : ((
            {
              provider_redirect: "REDIRECT",
              provider_network_error: "NETWORK",
              provider_timeout: "TIMEOUT",
              visits_format: "FORMAT",
              visits_not_available: "UNAVAILABLE",
            } as Record<string, string>
          )[error.code] ?? "RESPONSE");
    return `${prefix} (GM-VISITS-${suffix})`;
  }
  return error.code === "provider_timeout"
    ? "GymMaster took too long to respond. Please try again shortly."
    : "We couldn’t complete the member connection. Please try again shortly.";
}
