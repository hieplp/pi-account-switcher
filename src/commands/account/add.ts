import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { reloadAfterOAuthSwitch } from "../../accounts/credentials.js";
import { promptForAccount } from "../../accounts/prompts.js";
import { CONFIG_PATH } from "../../storage/paths.js";
import { isBuiltInProviderId, normalizeProvider } from "../../providers/catalog.js";
import { formatError } from "../../shared/errors.js";
import type { AccountSwitcherRuntime } from "../../runtime/account-switcher.js";
import type { AccountConfig } from "../../domain/types.js";
import type { AccountSwitcherContext } from "../../shared/ui.js";

export function registerAccountAddCommands(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("account-add", {
		description: "Add a new provider account from inside Pi",
		handler: async (_args, ctx) => handleAccountAdd(runtime, ctx),
	});

	pi.registerCommand("account-login", {
		description: "Login by adding an account/API key from inside Pi",
		handler: async (_args, ctx) => handleAccountLogin(runtime, ctx),
	});
}

async function handleAccountAdd(runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	await createAccountFromPrompt(runtime, ctx, {
		errorPrefix: "Failed to add account",
		afterSave: async (saved) => {
			ctx.ui.notify(`Added account ${saved.label} to ${CONFIG_PATH}.`, "info");
			const activate = await ctx.ui.confirm("Activate now?", `Switch ${normalizeProvider(saved.provider)} to ${saved.label} now?`);
			if (!activate) return;
			await activateSavedAccount(saved, runtime, ctx, "Activated");
		},
	});
}

async function handleAccountLogin(runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	await createAccountFromPrompt(runtime, ctx, {
		errorPrefix: "Login failed",
		afterSave: (saved) => activateSavedAccount(saved, runtime, ctx, "Logged in as"),
	});
}

async function createAccountFromPrompt(
	runtime: AccountSwitcherRuntime,
	ctx: AccountSwitcherContext,
	options: { errorPrefix: string; afterSave: (account: AccountConfig) => Promise<void> },
): Promise<void> {
	try {
		await runtime.reloadConfig();
		const account = await promptForAccount(ctx, runtime.providers);
		if (!account) return;
		await offerToSaveCustomProvider(account, runtime, ctx);
		const saved = await saveDuplicateSafe(account, runtime, ctx);
		if (!saved) return;
		await options.afterSave(saved);
	} catch (error) {
		ctx.ui.notify(`${options.errorPrefix}: ${formatError(error)}`, "error");
	}
}

async function activateSavedAccount(account: AccountConfig, runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext, action: string): Promise<void> {
	const provider = normalizeProvider(account.provider);
	const applied = await runtime.activateAccount(account, provider, ctx);
	ctx.ui.notify(`${action} ${account.label} (${applied}).`, "info");
	if (await reloadAfterOAuthSwitch(account, ctx)) return;
}

async function offerToSaveCustomProvider(
	account: AccountConfig,
	runtime: AccountSwitcherRuntime,
	ctx: AccountSwitcherContext,
): Promise<void> {
	const provider = normalizeProvider(account.provider);
	if (isBuiltInProviderId(provider)) return;
	if (runtime.providers.some((candidate) => normalizeProvider(candidate.id) === provider || (candidate.aliases ?? []).map(normalizeProvider).includes(provider))) return;
	const save = await ctx.ui.confirm("Save custom provider?", `Save ${provider} as a reusable custom provider for future account setup?`);
	if (!save) return;
	await runtime.addConfiguredProvider({
		id: provider,
		label: provider,
		envKeys: Object.keys(account.env ?? {}),
	});
	ctx.ui.notify(`Saved custom provider ${provider}.`, "info");
}

export async function saveDuplicateSafe(
	account: AccountConfig,
	runtime: AccountSwitcherRuntime,
	ctx: AccountSwitcherContext,
): Promise<AccountConfig | undefined> {
	let candidate = account;
	while (true) {
		const existing = runtime.accounts.find((entry) => entry.id === candidate.id);
		if (!existing) {
			await runtime.addConfiguredAccount(candidate);
			return candidate;
		}

		const action = await ctx.ui.select(`Account id already exists: ${candidate.id}`, ["Replace existing account", "Enter a new id", "Cancel"]);
		if (action === "Replace existing account") {
			await runtime.replaceConfiguredAccount(existing, candidate);
			return candidate;
		}
		if (action === "Enter a new id") {
			const nextId = (await ctx.ui.input("New account id", `${candidate.id}-2`))?.trim();
			if (!nextId) return undefined;
			candidate = { ...candidate, id: nextId };
			continue;
		}
		return undefined;
	}
}
