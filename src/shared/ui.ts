export type NotifyKind = "error" | "info" | "warning";

export interface AccountSwitcherUi {
	setStatus: (key: string, value: string) => void;
	notify: (message: string, kind?: NotifyKind) => void;
	select: (title: string, items: string[]) => Promise<string | undefined>;
	input: (title: string, placeholder?: string) => Promise<string | undefined>;
	confirm: (title: string, message: string) => Promise<boolean>;
}

export interface AccountSwitcherModelRegistry {
	authStorage?: {
		set?: (provider: string, credential: any) => void;
		reload?: () => void;
	};
}

export interface AccountSwitcherContext {
	ui: AccountSwitcherUi;
	modelRegistry?: AccountSwitcherModelRegistry;
	model?: { provider?: string };
}
