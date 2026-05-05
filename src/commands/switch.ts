import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { reloadAfterOAuthSwitch } from "../accounts/credentials.js";
import { formatAccountItem } from "../accounts/format.js";
import { CONFIG_PATH } from "../storage/paths.js";
import { normalizeProvider } from "../providers/catalog.js";
import { formatError } from "../shared/errors.js";
import type { AccountSwitcherRuntime } from "../runtime/account-switcher.js";

export function registerAccountSwitchCommand(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("account", {
		description: "Pick and activate an account/API key for the current provider",
		handler: async (args, ctx) => {
			await runtime.reloadConfig();

			const requestedProvider = args.trim() || runtime.getCurrentProvider(ctx);
			if (!requestedProvider) {
				ctx.ui.notify("No active provider detected. Try /account anthropic or /account openai.", "error");
				return;
			}

			const provider = normalizeProvider(requestedProvider);
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
				const applied = await runtime.activateAccount(account, provider, ctx);
				ctx.ui.notify(`Switched ${provider} to ${account.label} (${applied}).`, "info");
				if (await reloadAfterOAuthSwitch(account, ctx)) return;
			} catch (error) {
				ctx.ui.notify(`Failed to switch account: ${formatError(error)}`, "error");
			}
		},
	});
}
