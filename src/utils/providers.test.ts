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
