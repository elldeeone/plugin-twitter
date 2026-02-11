import {
  TwitterApi,
  type IClientSettings,
  type ITwitterApiClientPlugin,
} from "twitter-api-v2";
import { Profile } from "./profile";
import type {
  TwitterAuthProvider,
  TwitterOAuth1Provider,
} from "./auth-providers/types";

const TWITTER_HOST_SUFFIXES = [".twitter.com", ".x.com"];

function isTwitterHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "twitter.com" ||
    normalized === "x.com" ||
    TWITTER_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

function parseApiBaseUrl(rawValue: string | undefined): URL | undefined {
  const value = rawValue?.trim();
  if (!value) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `Invalid TWITTER_API_BASE_URL=${rawValue}. Expected absolute URL like http://localhost:8080`,
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Invalid TWITTER_API_BASE_URL=${rawValue}. Expected an http:// or https:// URL`,
    );
  }

  return parsed;
}

function joinPath(basePath: string, requestPath: string): string {
  const normalizedBase = basePath === "/" ? "" : basePath.replace(/\/+$/, "");
  const normalizedRequest = requestPath.startsWith("/")
    ? requestPath
    : `/${requestPath}`;
  return `${normalizedBase}${normalizedRequest}` || "/";
}

function rewriteTwitterApiUrl(rawUrl: string, baseUrl: URL): string {
  let requestUrl: URL;
  try {
    requestUrl = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  if (!isTwitterHost(requestUrl.hostname)) {
    return rawUrl;
  }

  requestUrl.protocol = baseUrl.protocol;
  requestUrl.hostname = baseUrl.hostname;
  requestUrl.port = baseUrl.port;
  requestUrl.username = baseUrl.username;
  requestUrl.password = baseUrl.password;
  requestUrl.pathname = joinPath(baseUrl.pathname, requestUrl.pathname);
  return requestUrl.toString();
}

/**
 * Twitter API v2 authentication using developer credentials
 */
export class TwitterAuth {
  private v2Client: TwitterApi | null = null;
  private authenticated = false;
  private profile?: Profile;
  private loggedOut = false;

  private lastAccessToken?: string;
  private lastClientSignature?: string;

  constructor(private readonly provider: TwitterAuthProvider) {
    // Backward-compatible behavior: legacy OAuth1 provider is considered authenticated immediately,
    // matching previous eager client initialization semantics.
    if (typeof (provider as any).getOAuth1Credentials === "function") {
      this.authenticated = true;
    }
  }

  private isOAuth1Provider(p: TwitterAuthProvider): p is TwitterOAuth1Provider {
    return typeof (p as any).getOAuth1Credentials === "function";
  }

  private buildClientSettings(
    apiBaseUrl: string | undefined,
  ): Partial<IClientSettings> | undefined {
    const parsedBaseUrl = parseApiBaseUrl(apiBaseUrl);
    if (!parsedBaseUrl) {
      return undefined;
    }

    const rewritePlugin: ITwitterApiClientPlugin = {
      onBeforeRequestConfig: ({ params }) => {
        params.url = rewriteTwitterApiUrl(params.url, parsedBaseUrl);
      },
      onBeforeStreamRequestConfig: ({ params }) => {
        params.url = rewriteTwitterApiUrl(params.url, parsedBaseUrl);
      },
    };

    return {
      plugins: [rewritePlugin],
    };
  }

  private buildClientSignature(
    mode: "oauth1" | "token",
    token: string,
    apiBaseUrl: string | undefined,
  ): string {
    return [mode, token, apiBaseUrl?.trim() || ""].join("|");
  }

  private async ensureClientInitialized(): Promise<void> {
    if (this.loggedOut) {
      throw new Error("Twitter API client not initialized");
    }
    if (this.isOAuth1Provider(this.provider)) {
      const creds = await this.provider.getOAuth1Credentials();
      const apiBaseUrl = this.provider.getApiBaseUrl?.();
      const signature = this.buildClientSignature(
        "oauth1",
        `${creds.appKey}:${creds.accessToken}`,
        apiBaseUrl,
      );

      if (!this.v2Client || this.lastClientSignature !== signature) {
        this.v2Client = new TwitterApi(
          {
            appKey: creds.appKey,
            appSecret: creds.appSecret,
            accessToken: creds.accessToken,
            accessSecret: creds.accessSecret,
          },
          this.buildClientSettings(apiBaseUrl),
        );
        this.lastClientSignature = signature;
      }

      this.authenticated = true;
      this.lastAccessToken = creds.accessToken;
      return;
    }

    const token = await this.provider.getAccessToken();
    const apiBaseUrl = this.provider.getApiBaseUrl?.();
    const signature = this.buildClientSignature("token", token, apiBaseUrl);

    if (!this.v2Client || this.lastClientSignature !== signature) {
      // OAuth2 user context token: Bearer token
      this.v2Client = new TwitterApi(
        token,
        this.buildClientSettings(apiBaseUrl),
      );
      this.authenticated = true;
      this.lastAccessToken = token;
      this.lastClientSignature = signature;
    }
  }

  /**
   * Get the Twitter API v2 client
   */
  async getV2Client(): Promise<TwitterApi> {
    await this.ensureClientInitialized();
    if (!this.v2Client) {
      throw new Error("Twitter API client not initialized");
    }
    return this.v2Client;
  }

  /**
   * Check if authenticated
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      await this.ensureClientInitialized();
    } catch {
      return false;
    }
    if (!this.authenticated || !this.v2Client) {
      return false;
    }

    try {
      // Verify credentials by getting current user
      const me = await this.v2Client.v2.me();
      return !!me.data;
    } catch (error: any) {
      console.error("Failed to verify authentication:", error?.message || error);
      if (error?.data) {
        console.error("Response body:", JSON.stringify(error.data, null, 2));
      }
      if (error?.code) {
        console.error("HTTP status:", error.code);
      }
      return false;
    }
  }

  /**
   * Get current user profile
   */
  async me(): Promise<Profile | undefined> {
    if (this.profile) {
      return this.profile;
    }

    await this.ensureClientInitialized();
    if (!this.v2Client) {
      throw new Error("Not authenticated");
    }

    try {
      const { data: user } = await this.v2Client.v2.me({
        "user.fields": [
          "id",
          "name",
          "username",
          "description",
          "profile_image_url",
          "public_metrics",
          "verified",
          "location",
          "created_at",
        ],
      });

      this.profile = {
        userId: user.id,
        username: user.username,
        name: user.name,
        biography: user.description,
        avatar: user.profile_image_url,
        followersCount: user.public_metrics?.followers_count,
        followingCount: user.public_metrics?.following_count,
        isVerified: user.verified,
        location: user.location || "",
        joined: user.created_at ? new Date(user.created_at) : undefined,
      };

      return this.profile;
    } catch (error) {
      console.error("Failed to get user profile:", error);
      return undefined;
    }
  }

  /**
   * Logout (clear credentials)
   */
  async logout(): Promise<void> {
    this.v2Client = null;
    this.authenticated = false;
    this.profile = undefined;
    this.lastAccessToken = undefined;
    this.lastClientSignature = undefined;
    this.loggedOut = true;
  }

  /**
   * For compatibility - always returns true since we use API keys
   */
  hasToken(): boolean {
    return this.authenticated && !this.loggedOut;
  }
}
