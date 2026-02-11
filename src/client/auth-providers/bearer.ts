import type { IAgentRuntime } from "@elizaos/core";
import { getSetting } from "../../utils/settings";
import type { TwitterAuthProvider } from "./types";

/**
 * Bearer-token auth provider for Twitter-compatible APIs.
 * Useful for local playgrounds/simulators that accept static bearer tokens.
 */
export class BearerAuthProvider implements TwitterAuthProvider {
  readonly mode = "bearer" as const;

  constructor(
    private readonly runtime?: IAgentRuntime,
    private readonly state?: any,
  ) {}

  async getAccessToken(): Promise<string> {
    const token =
      this.state?.TWITTER_BEARER_TOKEN ??
      getSetting(this.runtime, "TWITTER_BEARER_TOKEN");

    if (!token) {
      throw new Error(
        "TWITTER_AUTH_MODE=bearer requires TWITTER_BEARER_TOKEN.",
      );
    }

    return token;
  }

  getApiBaseUrl(): string | undefined {
    return (
      this.state?.TWITTER_API_BASE_URL ??
      getSetting(this.runtime, "TWITTER_API_BASE_URL") ??
      undefined
    );
  }
}
