import { describe, expect, it, vi } from "vitest";
import worker, { type Env } from "./index";
function environment() {
  const assets = vi.fn(
    async () =>
      new Response("app shell", { headers: { "Content-Type": "text/html" } }),
  );
  const env: Env = {
    ASSETS: { fetch: assets },
    GYMMASTER_API_KEY: "test-only-secret-marker",
  };
  return { env, assets };
}
describe("Cloudflare backend foundation", () => {
  it("serves a public health response without disclosing any secret", async () => {
    const { env, assets } = environment();
    const response = await worker.fetch(
      new Request("https://example.test/api/health"),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(assets).not.toHaveBeenCalled();
  });
  it("forwards app and asset requests to the existing static app", async () => {
    const { env, assets } = environment();
    for (const path of ["/", "/hub-icon-192.png", "/manifest.webmanifest"]) {
      const request = new Request(`https://example.test${path}`);
      const response = await worker.fetch(request, env);
      expect(await response.text()).toBe("app shell");
      expect(assets).toHaveBeenLastCalledWith(request);
    }
  });
  it("does not accept writes to health or let API paths become cached HTML", async () => {
    const { env, assets } = environment();
    const post = await worker.fetch(
      new Request("https://example.test/api/health", { method: "POST" }),
      env,
    );
    expect(post.status).toBe(405);
    expect(post.headers.get("Allow")).toBe("GET");
    for (const path of ["/api", "/api/unknown", "/api/login"]) {
      const response = await worker.fetch(
        new Request(`https://example.test${path}`),
        env,
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).toContain(
        "application/json",
      );
    }
    expect(assets).not.toHaveBeenCalled();
  });
  it("keeps GymMaster inaccessible and never forwards supplied tokens or returns keys", async () => {
    const { env, assets } = environment();
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network must not be used"));
    try {
      for (const method of ["GET", "POST"]) {
        const response = await worker.fetch(
          new Request(
            "https://example.test/api/gymmaster/member/profile?token=test-token",
            { method },
          ),
          env,
        );
        expect(response.status).toBe(501);
        const body = await response.text();
        expect(body).not.toContain(env.GYMMASTER_API_KEY);
        expect(body).not.toContain("test-token");
        expect(response.headers.get("Cache-Control")).toBe("no-store");
      }
      expect(network).not.toHaveBeenCalled();
      expect(assets).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });
});
