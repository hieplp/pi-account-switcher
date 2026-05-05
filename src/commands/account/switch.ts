import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { reloadAfterOAuthSwitch } from "../../accounts/credentials.js";
import { promptForAccountModel } from "../../accounts/models.js";
import { formatAccountItem } from "../../accounts/format.js";
import { CONFIG_PATH } from "../../storage/paths.js";
import { normalizeProviderWithCustom } from "../../providers/catalog.js";
import { formatError } from "../../shared/errors.js";
import { getAccountModelProvider, type AccountSwitcherRuntime } from "../../runtime/account-switcher.js";
import type { AccountSwitcherContext } from "../../shared/ui.js";

export function registerAccountSwitchCommand(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("account", {
		description: "Pick and activate an account/API key for the current provider",
		handler: async (args, ctx) => handleAccountSwitch(args, runtime, ctx),
	});
}

async function handleAccountSwitch(args: string, runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	await runtime.reloadConfig();

	const requestedProvider = args.trim() || runtime.getCurrentProvider(ctx);
	if (!requestedProvider) {
		ctx.ui.notify("No active provider detected. Try /account anthropic or /account openai.", "error");
		return;
	}

	const provider = normalizeProviderWithCustom(requestedProvider, runtime.providers);
	const accounts = runtime.getAccountsForProvider(provider);
	if (accounts.length === 0) {
		ctx.ui.notify(`No accounts configured for ${provider}. Edit ${CONFIG_PATH}.`, "error");
		return;
	}

	const items = accounts.map((account) => formatAccountItem(account, runtime.getActiveAccount(provider)?.id === account.id));
	const selected = await ctx.ui.select(`Pick account for ${provider}`, items);
	if (!selected) return;

	const account = accounts[items.indexOf(selected)];
	if (!account) return;

	try {
		const modelProvider = getAccountModelProvider(account, provider);
		const model = await promptForAccountModel(account, modelProvider, runtime.providers, ctx);
		if (model === null) return;
		const accountToActivate = model === undefined ? account : { ...account, model };
		const applied = await runtime.activateAccount(accountToActivate, provider, ctx);
		ctx.ui.notify(`Switched ${provider} to ${account.label} (${applied}).`, "info");
		if (await reloadAfterOAuthSwitch(account, ctx)) return;
	} catch (error) {
		ctx.ui.notify(`Failed to switch account: ${formatError(error)}`, "error");
	}
}
