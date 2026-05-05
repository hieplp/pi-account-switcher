import { describe, expect, it } from "vitest";
import { normalizeProvider, normalizeProviderWithCustom, providerMatches, providerMatchesWithCustom, requiredEnvKeysForProvider } from "./catalog.js";

describe("provider aliases", () => {
	it("keeps Pi's openai-codex provider separate from OpenAI", () => {
		expect(normalizeProvider("openai-codex")).toBe("openai-codex");
		expect(normalizeProvider("codex")).toBe("openai-codex");
		expect(providerMatches("openai", "openai-codex")).toBe(false);
		expect(providerMatches("codex", "openai-codex")).toBe(true);
	});

	it("uses OpenAI API-key env vars for openai-codex accounts", () => {
		expect(requiredEnvKeysForProvider("openai-codex")).toEqual(["OPENAI_API_KEY"]);
	});

	it("uses custom provider aliases and env key suggestions", () => {
		const customProviders = [{ id: "acme", envKeys: ["ACME_API_KEY"], aliases: ["acme-ai"] }];
		expect(normalizeProviderWithCustom("acme-ai", customProviders)).toBe("acme");
		expect(providerMatchesWithCustom("acme", "acme-ai", customProviders)).toBe(true);
		expect(requiredEnvKeysForProvider("acme-ai", customProviders)).toEqual(["ACME_API_KEY"]);
	});
});
