export type ProviderId = string;

export type SecretSource =
	| string
	| { type: "literal"; value: string }
	| { type: "env"; name: string }
	| { type: "file"; path: string }
	| { type: "command"; command: string }
	| { type: "op"; reference: string };

export type PiAuthEntry = Record<string, unknown>;

export interface AccountConfig {
	id: string;
	label: string;
	provider: ProviderId;
	/** API-key/env based account. */
	env?: Record<string, SecretSource>;
	/** Captured Pi /login credentials for built-in OAuth/subscription providers. */
	piAuth?: {
		provider: ProviderId;
		entry: PiAuthEntry;
	};
}

export interface AccountSwitcherConfig {
	accounts: AccountConfig[];
	switchMode?: "env";
}

export interface AccountSwitcherState {
	selected: Record<ProviderId, string>;
}
