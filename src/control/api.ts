export class ControlError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export async function controlApi(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<any> {
  const response = await fetch("/api/control/" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!response.headers.get("Content-Type")?.includes("application/json"))
    throw new ControlError(response.status, "response");
  const result = await response.json();
  if (!response.ok)
    throw new ControlError(response.status, result.error ?? "response");
  return result;
}
