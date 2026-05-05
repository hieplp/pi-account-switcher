import { describe, expect, it } from "vitest";
import { normalizeProvider, providerMatches, requiredEnvKeysForProvider } from "./catalog.js";

describe("provider aliases", () => {
	it("treats Pi's openai-codex provider as OpenAI for account matching", () => {
		expect(normalizeProvider("openai-codex")).toBe("openai");
		expect(providerMatches("openai", "openai-codex")).toBe(true);
		expect(providerMatches("openai-codex", "openai")).toBe(true);
	});

	it("uses OpenAI API-key env vars for openai-codex accounts", () => {
		expect(requiredEnvKeysForProvider("openai-codex")).toEqual(["OPENAI_API_KEY"]);
	});
});
