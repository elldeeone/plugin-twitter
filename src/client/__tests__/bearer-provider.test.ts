import { describe, it, expect, vi } from "vitest";
import { BearerAuthProvider } from "../auth-providers/bearer";

describe("BearerAuthProvider", () => {
  it("returns token from runtime settings", async () => {
    const runtime: any = {
      getSetting: vi.fn((key: string) => {
        if (key === "TWITTER_BEARER_TOKEN") return "runtime-token";
        return undefined;
      }),
    };

    const provider = new BearerAuthProvider(runtime);
    await expect(provider.getAccessToken()).resolves.toBe("runtime-token");
  });

  it("returns token from state when provided", async () => {
    const runtime: any = {
      getSetting: vi.fn(() => undefined),
    };

    const provider = new BearerAuthProvider(runtime, {
      TWITTER_BEARER_TOKEN: "state-token",
    });
    await expect(provider.getAccessToken()).resolves.toBe("state-token");
  });

  it("throws when token is missing", async () => {
    const runtime: any = {
      getSetting: vi.fn(() => undefined),
    };

    const provider = new BearerAuthProvider(runtime);
    await expect(provider.getAccessToken()).rejects.toThrow(
      "TWITTER_AUTH_MODE=bearer requires TWITTER_BEARER_TOKEN.",
    );
  });

  it("returns optional API base URL override", () => {
    const runtime: any = {
      getSetting: vi.fn((key: string) => {
        if (key === "TWITTER_API_BASE_URL") return "http://localhost:8080";
        return undefined;
      }),
    };

    const provider = new BearerAuthProvider(runtime);
    expect(provider.getApiBaseUrl()).toBe("http://localhost:8080");
  });
});
