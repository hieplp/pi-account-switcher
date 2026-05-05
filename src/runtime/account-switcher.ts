import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { addAccount, loadConfig, removeAccount, replaceAccount } from "../storage/config.js";
import { addProvider, loadProviderCatalog, removeProvider, replaceProvider } from "../storage/providers.js";
import { normalizeProviderWithCustom, providerMatchesWithCustom } from "../providers/catalog.js";
import { loadState, removeSelectedAccount, replaceSelectedAccount, saveSelectedAccount } from "../storage/state.js";
import type { AccountConfig, AccountSwitcherConfig, ProviderCatalogConfig, ProviderConfig } from "../domain/types.js";
import type { AccountSwitcherContext } from "../shared/ui.js";
import { applyAccountCredentials } from "../accounts/credentials.js";
import { resolveSecret } from "../accounts/secrets.js";
import { registerCustomModelProvider } from "../providers/registration.js";
import { formatError } from "../shared/errors.js";

export class AccountSwitcherRuntime {
	constructor(private readonly pi?: Pick<ExtensionAPI, "registerProvider" | "setModel">) {}

	private config: AccountSwitcherConfig = { accounts: [], switchMode: "env" };
	private providerCatalog: ProviderCatalogConfig = { providers: [] };
	private currentProvider: string | undefined;
	private readonly activeAccountByProvider = new Map<string, AccountConfig>();

	get accounts(): AccountConfig[] {
		return this.config.accounts;
	}

	get accountCount(): number {
		return this.config.accounts.length;
	}

	get providers(): ProviderConfig[] {
		return this.providerCatalog.providers;
	}

	async reloadConfig(): Promise<void> {
		this.config = await loadConfig();
		this.providerCatalog = await loadProviderCatalog();
	}

	async addConfiguredAccount(account: AccountConfig): Promise<void> {
		this.config = await addAccount(account);
	}

	async replaceConfiguredAccount(original: AccountConfig, account: AccountConfig): Promise<string[]> {
		this.config = await replaceAccount(original.id, account);
		const originalProvider = getAccountModelProvider(original, normalizeProviderWithCustom(original.provider, this.providers));
		const nextProvider = getAccountModelProvider(account, normalizeProviderWithCustom(account.provider, this.providers));
		const changedProviders = await replaceSelectedAccount(original.id, account.id, originalProvider, nextProvider);
		for (const [provider, activeAccount] of Array.from(this.activeAccountByProvider.entries())) {
			if (activeAccount.id !== original.id) continue;
			this.activeAccountByProvider.delete(provider);
			this.activeAccountByProvider.set(provider === originalProvider ? nextProvider : provider, account);
		}
		if (this.currentProvider && normalizeProviderWithCustom(this.currentProvider, this.providers) === originalProvider) this.currentProvider = nextProvider;
		return changedProviders;
	}

	async removeConfiguredAccount(account: AccountConfig): Promise<string[]> {
		this.config = await removeAccount(account.id);
		const removedProviders = await removeSelectedAccount(account.id);
		for (const [provider, activeAccount] of this.activeAccountByProvider.entries()) {
			if (activeAccount.id === account.id) this.activeAccountByProvider.delete(provider);
		}
		return removedProviders;
	}

	async addConfiguredProvider(provider: ProviderConfig): Promise<void> {
		this.providerCatalog = await addProvider(provider);
	}

	async replaceConfiguredProvider(originalId: string, provider: ProviderConfig): Promise<void> {
		this.providerCatalog = await replaceProvider(originalId, provider);
	}

	async removeConfiguredProvider(provider: ProviderConfig): Promise<void> {
		this.providerCatalog = await removeProvider(provider.id);
	}

	async restoreSavedAccounts(ctx: AccountSwitcherContext): Promise<void> {
		const state = await loadState();
		this.activeAccountByProvider.clear();
		for (const [provider, accountId] of Object.entries(state.selected)) {
			const account = this.config.accounts.find((candidate) => {
				if (candidate.id !== accountId) return false;
				const candidateProvider = getAccountModelProvider(candidate, normalizeProviderWithCustom(candidate.provider, this.providers));
				return providerMatchesWithCustom(candidateProvider, provider, this.providers) || isLegacyCodexStateKey(provider, candidateProvider);
			});
			if (!account) continue;
			try {
				await applyAccountCredentials(account, ctx.modelRegistry);
				const accountProvider = normalizeProviderWithCustom(account.provider, this.providers);
				const modelProvider = getAccountModelProvider(account, accountProvider);
				const customProvider = this.providers.find((candidate) => normalizeProviderWithCustom(candidate.id, this.providers) === modelProvider);
				if (this.pi && customProvider) {
					const apiKey = await resolveCustomProviderApiKey(account, customProvider);
					registerCustomModelProvider(this.pi as ExtensionAPI, { ...customProvider, ...(apiKey ? { apiKey } : {}) });
				}
				this.activeAccountByProvider.set(modelProvider, account);
				if (provider !== modelProvider) await saveSelectedAccount(modelProvider, account.id);
			} catch (error) {
				ctx.ui.notify(`Failed to restore account ${account.label}: ${formatError(error)}`, "error");
			}
		}

		this.currentProvider = this.resolveStatusProvider(getProviderFromContext(ctx));
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
		const provider = this.getCurrentProvider(ctx) ?? "";
		return this.providers.some((customProvider) => providerMatchesWithCustom(customProvider.id, provider, this.providers))
			? normalizeProviderWithCustom(provider, this.providers)
			: provider;
	}

	getAccountsForProvider(provider: string): AccountConfig[] {
		return this.config.accounts.filter((account) => {
			const accountProvider = getAccountModelProvider(account, normalizeProviderWithCustom(account.provider, this.providers));
			return providerMatchesWithCustom(accountProvider, provider, this.providers);
		});
	}

	getActiveAccount(provider: string | undefined): AccountConfig | undefined {
		return provider ? this.activeAccountByProvider.get(normalizeProviderWithCustom(provider, this.providers)) : undefined;
	}

	async activateAccount(account: AccountConfig, provider: string, ctx: AccountSwitcherContext): Promise<string> {
		const normalizedProvider = normalizeProviderWithCustom(provider, this.providers);
		const customProvider = this.providers.find((candidate) => normalizeProviderWithCustom(candidate.id, this.providers) === normalizedProvider);
		const applied = await applyAccountCredentials(account, ctx.modelRegistry);
		if (this.pi && customProvider) {
			const apiKey = await resolveCustomProviderApiKey(account, customProvider);
			registerCustomModelProvider(this.pi as ExtensionAPI, { ...customProvider, ...(apiKey ? { apiKey } : {}) });
		}
		const modelProvider = getAccountModelProvider(account, normalizedProvider);
		await this.switchToAccountProviderModel(account, modelProvider, ctx);
		this.activeAccountByProvider.set(modelProvider, account);
		this.currentProvider = modelProvider;
		await saveSelectedAccount(modelProvider, account.id);
		this.updateStatus(ctx);
		return applied;
	}

	private async switchToAccountProviderModel(account: AccountConfig, provider: string, ctx: AccountSwitcherContext): Promise<void> {
		if (!this.pi?.setModel) return;
		const targetModelId = account.model;
		const currentModel = ctx.model;
		const allModels = [...(ctx.modelRegistry?.getAvailable?.() ?? []), ...(ctx.modelRegistry?.getAll?.() ?? [])];
		const findProviderModel = (modelId?: string) => allModels.find((candidate) => this.modelProviderMatches(candidate.provider, provider) && (!modelId || candidate.id === modelId));
		const currentProviderModel = currentModel?.provider && this.modelProviderMatches(currentModel.provider, provider)
			? ctx.modelRegistry?.find?.(provider, currentModel.id ?? "") ?? findProviderModel(currentModel.id)
			: undefined;
		const requestedModel = targetModelId ? ctx.modelRegistry?.find?.(provider, targetModelId) ?? findProviderModel(targetModelId) : undefined;
		const fallbackModel = currentProviderModel ?? findProviderModel();
		const model = requestedModel ?? fallbackModel;
		if (!model) {
			ctx.ui.notify(`Account switched, but no ${provider}${targetModelId ? `/${targetModelId}` : ""} model was found. Use /model to select one.`, "warning");
			return;
		}
		const ok = await this.pi.setModel(model);
		if (!ok) ctx.ui.notify(`Account switched, but Pi refused model ${model.provider}/${model.id}. Check credentials.`, "warning");
	}

	private modelProviderMatches(modelProvider: string, targetProvider: string): boolean {
		if (this.providers.some((provider) => providerMatchesWithCustom(provider.id, targetProvider, this.providers))) {
			return providerMatchesWithCustom(modelProvider, targetProvider, this.providers);
		}
		return modelProvider === targetProvider;
	}

	updateStatus(ctx: Pick<AccountSwitcherContext, "ui">): void {
		const provider = this.resolveStatusProvider(this.currentProvider);
		const account = provider ? this.activeAccountByProvider.get(provider) : undefined;
		ctx.ui.setStatus("account", account ? `👤 ${account.label}` : "👤 no account");
	}

	private resolveStatusProvider(provider: string | undefined): string | undefined {
		const fallbackProvider = !provider && this.activeAccountByProvider.size === 1 ? this.activeAccountByProvider.keys().next().value : provider;
		if (!fallbackProvider) return undefined;
		return this.providers.some((customProvider) => providerMatchesWithCustom(customProvider.id, fallbackProvider, this.providers))
			? normalizeProviderWithCustom(fallbackProvider, this.providers)
			: fallbackProvider;
	}
}

async function resolveCustomProviderApiKey(account: AccountConfig, provider: ProviderConfig): Promise<string | undefined> {
	if (!account.providerApiKey) return provider.apiKey;
	const apiKey = await resolveSecret(account.providerApiKey);
	if (!apiKey) throw new Error(`Resolved empty providerApiKey for account ${account.id}`);
	return apiKey;
}

export function getAccountModelProvider(account: AccountConfig, fallbackProvider: string): string {
	return account.piAuth?.provider ?? fallbackProvider;
}

function isLegacyCodexStateKey(savedProvider: string, accountModelProvider: string): boolean {
	return savedProvider === "openai" && accountModelProvider === "openai-codex";
}

export function getProviderFromContext(ctx: unknown): string | undefined {
	const maybe = ctx as { model?: { provider?: string } };
	return maybe?.model?.provider;
}
