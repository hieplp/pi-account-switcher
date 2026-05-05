import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { providerMatchesWithCustom } from "../../providers/catalog.js";
import { unregisterCustomModelProvider } from "../../providers/registration.js";
import { PROVIDERS_PATH } from "../../storage/paths.js";
import type { AccountSwitcherRuntime } from "../../runtime/account-switcher.js";
import { formatError } from "../../shared/errors.js";
import { selectCustomProvider } from "./select.js";
import type { AccountSwitcherContext } from "../../shared/ui.js";

export function registerProviderRemoveCommand(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("provider-remove", {
		description: "Remove a custom provider when no accounts use it",
		handler: async (_args, ctx) => handleProviderRemove(pi, runtime, ctx),
	});
}

async function handleProviderRemove(pi: ExtensionAPI, runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	try {
		await runtime.reloadConfig();
		const provider = await selectCustomProvider(ctx.ui, "Remove custom provider", runtime.providers);
		if (!provider) return;
		const accountsUsingProvider = runtime.accounts.filter((account) => providerMatchesWithCustom(account.provider, provider.id, runtime.providers));
		if (accountsUsingProvider.length > 0) {
			ctx.ui.notify(`Cannot remove ${provider.id}; ${accountsUsingProvider.length} account(s) still use it: ${accountsUsingProvider.map((account) => account.label).join(", ")}. Edit or remove those accounts first.`, "error");
			return;
		}
		const confirmed = await ctx.ui.confirm("Delete custom provider?", `Delete ${provider.label ?? provider.id} from ${PROVIDERS_PATH}?`);
		if (!confirmed) return;
		await runtime.removeConfiguredProvider(provider);
		unregisterCustomModelProvider(pi, provider);
		ctx.ui.notify(`Removed custom provider ${provider.label ?? provider.id}.`, "info");
	} catch (error) {
		ctx.ui.notify(`Failed to remove provider: ${formatError(error)}`, "error");
	}
}
