import { describe, expect, it } from "vitest";
import { providerUtil } from "./providers";

const customProviders = [{ id: "acme", aliases: ["acme-ai"], envKeys: ["ACME_API_KEY"] }];

describe("providerUtil.providerChoices", () => {
  it("returns built-in providers when no custom or pi providers given", () => {
    const choices = providerUtil.providerChoices();
    expect(choices).toContain("anthropic");
    expect(choices).toContain("openai");
    expect(choices).toContain("custom");
  });

  it("includes custom providers sorted", () => {
    const choices = providerUtil.providerChoices(customProviders);
    expect(choices).toContain("acme");
    const acmeIndex = choices.indexOf("acme");
    const customIndex = choices.indexOf("custom");
    expect(acmeIndex).toBeLessThan(customIndex);
  });

  it("includes pi provider IDs from model registry, sorted, deduplicated", () => {
    const piIds = ["XAI", "xai", "OpenAI", "opencode-go", "GITHUB-COPILOT"];
    const choices = providerUtil.providerChoices([], piIds);
    expect(choices.filter((c) => c === "xai").length).toBe(1);
    expect(choices.filter((c) => c === "openai").length).toBe(1);
    expect(choices).toContain("xai");
    expect(choices).toContain("openai");
    expect(choices).toContain("opencode-go");
    expect(choices).toContain("github-copilot");
  });

  it("merges built-in, pi, and custom without duplicates", () => {
    const piIds = ["anthropic", "opencode-go"];
    const custom = [{ id: "anthropic", aliases: [], envKeys: ["ANTHROPIC_API_KEY"] }];
    const choices = providerUtil.providerChoices(custom, piIds);
    expect(choices.filter((c) => c === "anthropic").length).toBe(1);
    expect(choices).toContain("opencode-go");
    expect(choices).toContain("anthropic");
    expect(choices).toContain("custom");
  });

  it("preserves built-in providers when piIds and custom are empty", () => {
    const choices = providerUtil.providerChoices([], []);
    expect(choices).toContain("anthropic");
    expect(choices).toContain("openai");
    expect(choices).toContain("google");
    expect(choices).toContain("xai");
    expect(choices).toContain("openrouter");
    expect(choices).toContain("openai-codex");
    expect(choices).toContain("custom");
  });
});

describe("providerUtil.normalizeProvider", () => {
  it("lowercases and trims", () => {
    expect(providerUtil.normalizeProvider("  OpenAI  ")).toBe("openai");
  });

  it("replaces spaces with hyphens", () => {
    expect(providerUtil.normalizeProvider("GitHub Copilot")).toBe("github-copilot");
  });

  it("resolves aliases (claude → anthropic)", () => {
    expect(providerUtil.normalizeProvider("claude")).toBe("anthropic");
  });

  it("resolves aliases (gemini → google)", () => {
    expect(providerUtil.normalizeProvider("gemini")).toBe("google");
  });

  it("passes through unknown providers", () => {
    expect(providerUtil.normalizeProvider("my-custom")).toBe("my-custom");
  });
});

describe("providerUtil.normalizeProviderWithCustom", () => {
  it("matches custom provider by id", () => {
    const result = providerUtil.normalizeProviderWithCustom("acme", customProviders);
    expect(result).toBe("acme");
  });

  it("matches custom provider by alias", () => {
    const result = providerUtil.normalizeProviderWithCustom("acme-ai", customProviders);
    expect(result).toBe("acme");
  });

  it("falls through to built-in normalization when no match", () => {
    const result = providerUtil.normalizeProviderWithCustom("claude", customProviders);
    expect(result).toBe("anthropic");
  });
});

describe("providerUtil.isBuiltInProviderId", () => {
  it("returns true for known built-in providers", () => {
    expect(providerUtil.isBuiltInProviderId("anthropic")).toBe(true);
    expect(providerUtil.isBuiltInProviderId("openai")).toBe(true);
    expect(providerUtil.isBuiltInProviderId("google")).toBe(true);
  });

  it("returns false for unknown providers", () => {
    expect(providerUtil.isBuiltInProviderId("my-custom")).toBe(false);
  });

  it("normalizes before checking", () => {
    expect(providerUtil.isBuiltInProviderId("Claude")).toBe(true);
  });
});

describe("providerUtil.hasProvider", () => {
  it("finds by id", () => {
    expect(providerUtil.hasProvider("acme", customProviders)).toBe(true);
  });

  it("finds by alias", () => {
    expect(providerUtil.hasProvider("acme-ai", customProviders)).toBe(true);
  });

  it("returns false when not found", () => {
    expect(providerUtil.hasProvider("nonexistent", customProviders)).toBe(false);
  });

  it("returns false for empty list", () => {
    expect(providerUtil.hasProvider("acme", [])).toBe(false);
  });
});

describe("providerUtil.findProvider", () => {
  it("finds by id", () => {
    expect(providerUtil.findProvider("acme", customProviders)?.id).toBe("acme");
  });

  it("finds by alias", () => {
    expect(providerUtil.findProvider("acme-ai", customProviders)?.id).toBe("acme");
  });

  it("returns undefined when not found", () => {
    expect(providerUtil.findProvider("nonexistent", customProviders)).toBeUndefined();
  });
});

describe("providerUtil.requiredEnvKeysForProvider", () => {
  it("returns env keys for built-in provider", () => {
    const keys = providerUtil.requiredEnvKeysForProvider("anthropic");
    expect(keys).toContain("ANTHROPIC_API_KEY");
    expect(keys).toContain("ANTHROPIC_OAUTH_TOKEN");
  });

  it("returns custom provider's env keys", () => {
    const keys = providerUtil.requiredEnvKeysForProvider("acme", customProviders);
    expect(keys).toEqual(["ACME_API_KEY"]);
  });

  it("returns custom provider keys when looked up by alias", () => {
    const keys = providerUtil.requiredEnvKeysForProvider("acme-ai", customProviders);
    expect(keys).toEqual(["ACME_API_KEY"]);
  });

  it("returns empty array for unknown provider", () => {
    expect(providerUtil.requiredEnvKeysForProvider("unknown-provider")).toEqual([]);
  });

  it("returns empty array for unknown provider even with custom list", () => {
    expect(providerUtil.requiredEnvKeysForProvider("unknown-provider", customProviders)).toEqual([]);
  });
});
