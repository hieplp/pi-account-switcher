import type { PiAuthEntry } from "../domain/types.js";

export type NotifyKind = "error" | "info" | "warning";

export interface AccountSwitcherUi {
	setStatus: (key: string, value: string) => void;
	notify: (message: string, kind?: NotifyKind) => void;
	select: (title: string, items: string[]) => Promise<string | undefined>;
	input: (title: string, placeholder?: string) => Promise<string | undefined>;
	confirm: (title: string, message: string) => Promise<boolean>;
	custom?: <T>(factory: (...args: any[]) => any, options?: any) => Promise<T>;
}

export interface AccountSwitcherModelRegistry {
	authStorage?: {
		set?: (provider: string, credential: PiAuthEntry) => void;
		setRuntimeApiKey?: (provider: string, apiKey: string) => void;
		removeRuntimeApiKey?: (provider: string) => void;
		reload?: () => void;
	};
	find?: (provider: string, modelId: string) => any | undefined;
	getAll?: () => any[];
	getAvailable?: () => any[];
}

export interface AccountSwitcherContext {
	ui: AccountSwitcherUi;
	modelRegistry?: AccountSwitcherModelRegistry;
	model?: { provider?: string; id?: string };
}
