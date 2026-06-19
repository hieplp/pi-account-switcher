import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PROVIDER_IDS,
  OAUTH_PROVIDER_IDS,
  PROVIDER_ALIASES,
  PROVIDER_ENV_KEYS,
} from "./providers";

// All KnownProvider values from @earendil-works/pi-ai
const ALL_KNOWN_PROVIDERS = [
  "amazon-bedrock",
  "anthropic",
  "google",
  "google-vertex",
  "openai",
  "azure-openai-responses",
  "openai-codex",
  "deepseek",
  "github-copilot",
  "xai",
  "groq",
  "cerebras",
  "openrouter",
  "vercel-ai-gateway",
  "zai",
  "mistral",
  "minimax",
  "minimax-cn",
  "moonshotai",
  "moonshotai-cn",
  "huggingface",
  "fireworks",
  "opencode",
  "opencode-go",
  "kimi-coding",
  "cloudflare-workers-ai",
  "cloudflare-ai-gateway",
  "xiaomi",
  "xiaomi-token-plan-cn",
  "xiaomi-token-plan-ams",
  "xiaomi-token-plan-sgp",
] as const;

describe("BUILT_IN_PROVIDER_IDS", () => {
  it("covers all known Pi providers", () => {
    for (const provider of ALL_KNOWN_PROVIDERS) {
      expect(BUILT_IN_PROVIDER_IDS).toContain(provider);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(BUILT_IN_PROVIDER_IDS).size).toBe(BUILT_IN_PROVIDER_IDS.length);
  });
});

describe("OAUTH_PROVIDER_IDS", () => {
  it("includes Pi's built-in OAuth providers", () => {
    expect(OAUTH_PROVIDER_IDS).toContain("anthropic");
    expect(OAUTH_PROVIDER_IDS).toContain("openai-codex");
    expect(OAUTH_PROVIDER_IDS).toContain("github-copilot");
  });

  it("has no duplicates", () => {
    expect(new Set(OAUTH_PROVIDER_IDS).size).toBe(OAUTH_PROVIDER_IDS.length);
  });
});

describe("PROVIDER_ALIASES", () => {
  it("all aliases resolve to valid built-in providers", () => {
    for (const [, target] of Object.entries(PROVIDER_ALIASES)) {
      expect(BUILT_IN_PROVIDER_IDS).toContain(target);
    }
  });
});

describe("PROVIDER_ENV_KEYS", () => {
  it("covers every built-in provider", () => {
    for (const provider of BUILT_IN_PROVIDER_IDS) {
      expect(PROVIDER_ENV_KEYS).toHaveProperty(provider);
    }
  });

  it("amazon-bedrock uses IAM (no env var)", () => {
    expect(PROVIDER_ENV_KEYS["amazon-bedrock"]).toEqual([]);
  });

  it("has no unknown providers in the map", () => {
    for (const provider of Object.keys(PROVIDER_ENV_KEYS)) {
      expect(BUILT_IN_PROVIDER_IDS).toContain(provider);
    }
  });

  it("includes multiple options for github-copilot", () => {
    const keys = PROVIDER_ENV_KEYS["github-copilot"];
    expect(keys).toContain("COPILOT_GITHUB_TOKEN");
    expect(keys).toContain("GH_TOKEN");
    expect(keys).toContain("GITHUB_TOKEN");
  });

  it("includes ANTHROPIC_OAUTH_TOKEN as primary (takes priority)", () => {
    const keys = PROVIDER_ENV_KEYS["anthropic"];
    expect(keys[0]).toBe("ANTHROPIC_OAUTH_TOKEN");
    expect(keys).toContain("ANTHROPIC_API_KEY");
  });
});
