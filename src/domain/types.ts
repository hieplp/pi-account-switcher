export type ProviderId = string;

export type SecretSource =
	| string
	| { type: "literal"; value: string }
	| { type: "env"; name: string }
	| { type: "file"; path: string }
	| { type: "command"; command: string }
	| { type: "op"; reference: string };

export type PiAuthEntry =
	| { type: "api_key"; key: string }
	| ({ type: "oauth"; refresh: string; access: string; expires: number } & Record<string, unknown>);

export interface AccountConfig {
	id: string;
	label: string;
	provider: ProviderId;
	/** API-key/env based account. */
	env?: Record<string, SecretSource>;
	/** Per-account override for a custom Pi model provider apiKey. */
	providerApiKey?: SecretSource;
	/** Uses apiKey from custom provider metadata. */
	usesProviderApiKey?: boolean;
	/** Optional model to switch to when this account is activated. */
	model?: string;
	/** Captured Pi /login credentials for built-in OAuth/subscription providers. */
	piAuth?: {
		provider: ProviderId;
		entry: PiAuthEntry;
	};
}

export type ProviderApi =
	| "anthropic-messages"
	| "openai-completions"
	| "openai-responses"
	| "azure-openai-responses"
	| "openai-codex-responses"
	| "mistral-conversations"
	| "google-generative-ai"
	| "google-vertex"
	| "bedrock-converse-stream"
	| string;

export interface ProviderModelConfig {
	id: string;
	name?: string;
	api?: ProviderApi;
	baseUrl?: string;
	reasoning?: boolean;
	input?: ("text" | "image")[];
	contextWindow?: number;
	maxTokens?: number;
	cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
	compat?: Record<string, unknown>;
	thinkingLevelMap?: Record<string, string | null>;
	headers?: Record<string, string>;
}

export interface ProviderConfig {
	id: ProviderId;
	label?: string;
	/** Alias for Pi provider display name when exported/registered. */
	name?: string;
	envKeys?: string[];
	aliases?: string[];
	/** Raw Pi auth provider id, when different from this provider's account id. */
	piAuthProvider?: ProviderId;
	/** Pi custom model provider config fields. */
	baseUrl?: string;
	api?: ProviderApi;
	apiKey?: string;
	headers?: Record<string, string>;
	authHeader?: boolean;
	compat?: Record<string, unknown>;
	models?: ProviderModelConfig[];
	modelOverrides?: Record<string, Partial<ProviderModelConfig>>;
}

export interface ProviderCatalogConfig {
	providers: ProviderConfig[];
}

export interface AccountSwitcherConfig {
	accounts: AccountConfig[];
	switchMode?: "env";
}

export interface AccountSwitcherState {
	selected: Record<ProviderId, string>;
}
