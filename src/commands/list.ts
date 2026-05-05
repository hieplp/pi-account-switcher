import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CONFIG_PATH } from "../storage/paths.js";
import { normalizeProvider } from "../providers/catalog.js";
import type { AccountSwitcherRuntime } from "../runtime/account-switcher.js";

export function registerAccountListCommands(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("accounts", {
		description: "List configured account switcher accounts",
		handler: async (_args, ctx) => {
			await runtime.reloadConfig();
			if (runtime.accountCount === 0) {
				ctx.ui.notify(`No accounts configured. Create ${CONFIG_PATH}.`, "info");
				return;
			}

			const items = runtime.accounts.map((account) => {
				const provider = normalizeProvider(account.provider);
				const active = runtime.getActiveAccount(provider)?.id === account.id ? "✓ " : "";
				return `${active}${account.label} — ${provider} (${account.id})`;
			});
			await ctx.ui.select("Configured accounts", items);
		},
	});

	pi.registerCommand("account-current", {
		description: "Show the active account for the current provider",
		handler: async (_args, ctx) => {
			const provider = runtime.getProviderForContext(ctx);
			const account = runtime.getActiveAccount(provider);
			ctx.ui.notify(account ? `Current ${provider} account: ${account.label} (${account.id})` : "No active account selected.", "info");
		},
	});
}
