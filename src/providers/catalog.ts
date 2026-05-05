import type { ProviderConfig } from "../domain/types.js";

export const BUILT_IN_PROVIDER_IDS = ["anthropic", "openai", "openai-codex", "google", "xai", "openrouter"] as const;
export const COMMON_PROVIDERS = [...BUILT_IN_PROVIDER_IDS, "custom"] as const;

export const PROVIDER_ENV_KEYS: Record<string, string[]> = {
	anthropic: ["ANTHROPIC_API_KEY"],
	claude: ["ANTHROPIC_API_KEY"],
	openai: ["OPENAI_API_KEY"],
	codex: ["OPENAI_API_KEY"],
	"openai-codex": ["OPENAI_API_KEY"],
	google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
	gemini: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
	xai: ["XAI_API_KEY"],
	openrouter: ["OPENROUTER_API_KEY"],
};

export function normalizeProvider(provider: string): string {
	const p = provider.toLowerCase().trim();
	if (p === "claude") return "anthropic";
	if (p === "codex") return "openai-codex";
	if (p === "gemini") return "google";
	return p;
}

export function normalizeProviderWithCustom(provider: string, customProviders: ProviderConfig[] = []): string {
	const normalized = normalizeProvider(provider);
	const custom = customProviders.find((candidate) => {
		const names = [candidate.id, ...(candidate.aliases ?? [])].map(normalizeProvider);
		return names.includes(normalized);
	});
	return custom ? normalizeProvider(custom.id) : normalized;
}

export function providerMatches(accountProvider: string, currentProvider: string): boolean {
	return normalizeProvider(accountProvider) === normalizeProvider(currentProvider);
}

export function providerMatchesWithCustom(accountProvider: string, currentProvider: string, customProviders: ProviderConfig[] = []): boolean {
	return normalizeProviderWithCustom(accountProvider, customProviders) === normalizeProviderWithCustom(currentProvider, customProviders);
}

export function requiredEnvKeysForProvider(provider: string, customProviders: ProviderConfig[] = []): string[] {
	const normalized = normalizeProviderWithCustom(provider, customProviders);
	const custom = customProviders.find((candidate) => normalizeProvider(candidate.id) === normalized);
	return custom?.envKeys ?? PROVIDER_ENV_KEYS[normalized] ?? [];
}

export function providerChoices(customProviders: ProviderConfig[] = [], includeCustom = true): string[] {
	const customIds = customProviders.map((provider) => normalizeProvider(provider.id)).sort();
	return includeCustom ? [...BUILT_IN_PROVIDER_IDS, ...customIds, "custom"] : [...BUILT_IN_PROVIDER_IDS, ...customIds];
}

export function isBuiltInProviderId(provider: string): boolean {
	return BUILT_IN_PROVIDER_IDS.includes(normalizeProvider(provider) as (typeof BUILT_IN_PROVIDER_IDS)[number]);
}
