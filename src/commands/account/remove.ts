import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { selectAccount } from "../../accounts/select.js";
import { summarizeAccount } from "../../accounts/summary.js";
import type { AccountSwitcherRuntime } from "../../runtime/account-switcher.js";
import type { AccountSwitcherContext } from "../../shared/ui.js";
import { formatError } from "../../shared/errors.js";

export function registerAccountRemoveCommand(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("account-remove", {
		description: "Delete a configured account",
		handler: async (_args, ctx) => handleRemoveAccount(runtime, ctx),
	});
}

async function handleRemoveAccount(runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	try {
		await runtime.reloadConfig();
		if (runtime.accountCount === 0) {
			ctx.ui.notify("No accounts configured.", "info");
			return;
		}
		const account = await selectAccount(ctx.ui, "Remove account", runtime.accounts);
		if (!account) return;
		const confirmed = await ctx.ui.confirm("Delete account?", `Delete ${summarizeAccount(account)}? Secrets will not be shown.`);
		if (!confirmed) return;
		const clearedProviders = await runtime.removeConfiguredAccount(account);
		runtime.updateStatus(ctx);
		const stateNote = clearedProviders.length > 0 ? ` Cleared saved selection for ${clearedProviders.join(", ")}.` : "";
		ctx.ui.notify(`Removed account ${account.label}.${stateNote}`, "info");
	} catch (error) {
		ctx.ui.notify(`Failed to remove account: ${formatError(error)}`, "error");
	}
}
