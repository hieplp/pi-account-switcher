import { addAccount, loadConfig } from "../storage/config.js";
import { normalizeProvider, providerMatches } from "../providers/catalog.js";
import { loadState, saveSelectedAccount } from "../storage/state.js";
import type { AccountConfig, AccountSwitcherConfig } from "../domain/types.js";
import type { AccountSwitcherContext } from "../shared/ui.js";
import { applyAccountCredentials } from "../accounts/credentials.js";
import { formatError } from "../shared/errors.js";

export class AccountSwitcherRuntime {
	private config: AccountSwitcherConfig = { accounts: [], switchMode: "env" };
	private currentProvider: string | undefined;
	private readonly activeAccountByProvider = new Map<string, AccountConfig>();

	get accounts(): AccountConfig[] {
		return this.config.accounts;
	}

	get accountCount(): number {
		return this.config.accounts.length;
	}

	async reloadConfig(): Promise<void> {
		this.config = await loadConfig();
	}

	async addConfiguredAccount(account: AccountConfig): Promise<void> {
		this.config = await addAccount(account);
	}

	async restoreSavedAccounts(ctx: AccountSwitcherContext): Promise<void> {
		const state = await loadState();
		this.activeAccountByProvider.clear();
		for (const [provider, accountId] of Object.entries(state.selected)) {
			const account = this.config.accounts.find((candidate) => candidate.id === accountId && providerMatches(candidate.provider, provider));
			if (!account) continue;
			try {
				await applyAccountCredentials(account, ctx.modelRegistry);
				this.activeAccountByProvider.set(normalizeProvider(provider), account);
			} catch (error) {
				ctx.ui.notify(`Failed to restore account ${account.label}: ${formatError(error)}`, "error");
			}
		}

		this.currentProvider = this.currentProvider ?? getProviderFromContext(ctx);
		if (!this.currentProvider && this.activeAccountByProvider.size === 1) {
			this.currentProvider = this.activeAccountByProvider.keys().next().value;
		}
		this.updateStatus(ctx);
	}

	setCurrentProvider(provider: string | undefined, ctx?: Pick<AccountSwitcherContext, "ui">): void {
		this.currentProvider = provider;
		if (ctx) this.updateStatus(ctx);
	}

	getCurrentProvider(ctx?: unknown): string | undefined {
		return this.currentProvider ?? getProviderFromContext(ctx);
	}

	getProviderForContext(ctx?: unknown): string {
		return normalizeProvider(this.getCurrentProvider(ctx) ?? "");
	}

	getAccountsForProvider(provider: string): AccountConfig[] {
		return this.config.accounts.filter((account) => providerMatches(account.provider, provider));
	}

	getActiveAccount(provider: string | undefined): AccountConfig | undefined {
		return provider ? this.activeAccountByProvider.get(normalizeProvider(provider)) : undefined;
	}

	async activateAccount(account: AccountConfig, provider: string, ctx: AccountSwitcherContext): Promise<string> {
		const normalizedProvider = normalizeProvider(provider);
		const applied = await applyAccountCredentials(account, ctx.modelRegistry);
		this.activeAccountByProvider.set(normalizedProvider, account);
		this.currentProvider = normalizedProvider;
		await saveSelectedAccount(normalizedProvider, account.id);
		this.updateStatus(ctx);
		return applied;
	}

	updateStatus(ctx: Pick<AccountSwitcherContext, "ui">): void {
		let provider = this.currentProvider ? normalizeProvider(this.currentProvider) : undefined;
		if (!provider && this.activeAccountByProvider.size === 1) provider = this.activeAccountByProvider.keys().next().value;
		const account = provider ? this.activeAccountByProvider.get(provider) : undefined;
		ctx.ui.setStatus("account", account ? `👤 ${account.label}` : "👤 no account");
	}
}

export function getProviderFromContext(ctx: unknown): string | undefined {
	const maybe = ctx as { model?: { provider?: string } };
	return maybe?.model?.provider;
}
