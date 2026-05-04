export const COMMON_PROVIDERS = ["anthropic", "openai", "google", "xai", "openrouter", "custom"] as const;

export const PROVIDER_ENV_KEYS: Record<string, string[]> = {
	anthropic: ["ANTHROPIC_API_KEY"],
	claude: ["ANTHROPIC_API_KEY"],
	openai: ["OPENAI_API_KEY"],
	codex: ["OPENAI_API_KEY"],
	google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
	gemini: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
	xai: ["XAI_API_KEY"],
	openrouter: ["OPENROUTER_API_KEY"],
};

export function normalizeProvider(provider: string): string {
	const p = provider.toLowerCase().trim();
	if (p === "claude") return "anthropic";
	if (p === "codex") return "openai";
	if (p === "gemini") return "google";
	return p;
}

export function providerMatches(accountProvider: string, currentProvider: string): boolean {
	return normalizeProvider(accountProvider) === normalizeProvider(currentProvider);
}

export function requiredEnvKeysForProvider(provider: string): string[] {
	return PROVIDER_ENV_KEYS[normalizeProvider(provider)] ?? [];
}
