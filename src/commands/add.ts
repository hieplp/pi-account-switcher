import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { reloadAfterOAuthSwitch } from "../accounts/credentials.js";
import { promptForAccount } from "../accounts/prompts.js";
import { CONFIG_PATH } from "../storage/paths.js";
import { normalizeProvider } from "../providers/catalog.js";
import { formatError } from "../shared/errors.js";
import type { AccountSwitcherRuntime } from "../runtime/account-switcher.js";

export function registerAccountAddCommands(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("account-add", {
		description: "Add a new provider account from inside Pi",
		handler: async (_args, ctx) => {
			try {
				const account = await promptForAccount(ctx);
				if (!account) return;

				await runtime.addConfiguredAccount(account);
				ctx.ui.notify(`Added account ${account.label} to ${CONFIG_PATH}.`, "info");

				const activate = await ctx.ui.confirm("Activate now?", `Switch ${normalizeProvider(account.provider)} to ${account.label} now?`);
				if (activate) {
					const provider = normalizeProvider(account.provider);
					const applied = await runtime.activateAccount(account, provider, ctx);
					ctx.ui.notify(`Activated ${account.label} (${applied}).`, "info");
					if (await reloadAfterOAuthSwitch(account, ctx)) return;
				}
			} catch (error) {
				ctx.ui.notify(`Failed to add account: ${formatError(error)}`, "error");
			}
		},
	});

	pi.registerCommand("account-login", {
		description: "Login by adding an account/API key from inside Pi",
		handler: async (_args, ctx) => {
			// Same UX as /account-add. Kept as a friendlier alias for users who think in terms of login.
			try {
				const account = await promptForAccount(ctx);
				if (!account) return;
				await runtime.addConfiguredAccount(account);
				const provider = normalizeProvider(account.provider);
				const applied = await runtime.activateAccount(account, provider, ctx);
				ctx.ui.notify(`Logged in as ${account.label} (${applied}).`, "info");
				if (await reloadAfterOAuthSwitch(account, ctx)) return;
			} catch (error) {
				ctx.ui.notify(`Login failed: ${formatError(error)}`, "error");
			}
		},
	});
}
