import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { normalizeProvider, providerMatchesWithCustom } from "../../providers/catalog.js";
import { registerCustomModelProvider, unregisterCustomModelProvider } from "../../providers/registration.js";
import type { AccountSwitcherRuntime } from "../../runtime/account-switcher.js";
import { formatError } from "../../shared/errors.js";
import { promptForProvider } from "./prompts.js";
import { removedProviderNames, selectCustomProvider } from "./select.js";
import type { AccountSwitcherContext } from "../../shared/ui.js";

export function registerProviderEditCommand(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("provider-edit", {
		description: "Edit a custom provider",
		handler: async (_args, ctx) => handleProviderEdit(pi, runtime, ctx),
	});
}

async function handleProviderEdit(pi: ExtensionAPI, runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	try {
		await runtime.reloadConfig();
		const original = await selectCustomProvider(ctx.ui, "Edit custom provider", runtime.providers);
		if (!original) return;
		const provider = await promptForProvider(ctx, original);
		if (!provider) return;
		const idChanged = normalizeProvider(original.id) !== normalizeProvider(provider.id);
		const accountsUsingProvider = runtime.accounts.filter((account) => providerMatchesWithCustom(account.provider, original.id, runtime.providers));
		if (idChanged && accountsUsingProvider.length > 0) {
			ctx.ui.notify(`Cannot rename ${original.id}; ${accountsUsingProvider.length} account(s) still use it: ${accountsUsingProvider.map((account) => account.label).join(", ")}. Edit those accounts first.`, "error");
			return;
		}
		const removedNames = removedProviderNames(original, provider);
		const accountsUsingRemovedNames = runtime.accounts.filter((account) => removedNames.includes(normalizeProvider(account.provider)));
		if (accountsUsingRemovedNames.length > 0) {
			ctx.ui.notify(`Cannot remove provider aliases used by account(s): ${accountsUsingRemovedNames.map((account) => account.label).join(", ")}. Edit those accounts first.`, "error");
			return;
		}
		await runtime.replaceConfiguredProvider(original.id, provider);
		unregisterCustomModelProvider(pi, original);
		registerCustomModelProvider(pi, provider);
		ctx.ui.notify(`Saved custom provider ${provider.label ?? provider.id}.`, "info");
	} catch (error) {
		ctx.ui.notify(`Failed to edit provider: ${formatError(error)}`, "error");
	}
}
