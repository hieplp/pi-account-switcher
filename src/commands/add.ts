import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { reloadAfterOAuthSwitch } from "../accounts/credentials.js";
import { promptForAccount } from "../accounts/prompts.js";
import { CONFIG_PATH } from "../storage/paths.js";
import { normalizeProvider } from "../providers/catalog.js";
import { formatError } from "../shared/errors.js";
import type { AccountSwitcherRuntime } from "../runtime/account-switcher.js";
import type { AccountConfig } from "../domain/types.js";
import type { AccountSwitcherContext } from "../shared/ui.js";

export function registerAccountAddCommands(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("account-add", {
		description: "Add a new provider account from inside Pi",
		handler: async (_args, ctx) => {
			try {
				await runtime.reloadConfig();
				const account = await promptForAccount(ctx);
				if (!account) return;

				const saved = await saveDuplicateSafe(account, runtime, ctx);
				if (!saved) return;
				ctx.ui.notify(`Added account ${saved.label} to ${CONFIG_PATH}.`, "info");

				const activate = await ctx.ui.confirm("Activate now?", `Switch ${normalizeProvider(saved.provider)} to ${saved.label} now?`);
				if (activate) {
					const provider = normalizeProvider(saved.provider);
					const applied = await runtime.activateAccount(saved, provider, ctx);
					ctx.ui.notify(`Activated ${saved.label} (${applied}).`, "info");
					if (await reloadAfterOAuthSwitch(saved, ctx)) return;
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
				await runtime.reloadConfig();
				const account = await promptForAccount(ctx);
				if (!account) return;
				const saved = await saveDuplicateSafe(account, runtime, ctx);
				if (!saved) return;
				const provider = normalizeProvider(saved.provider);
				const applied = await runtime.activateAccount(saved, provider, ctx);
				ctx.ui.notify(`Logged in as ${saved.label} (${applied}).`, "info");
				if (await reloadAfterOAuthSwitch(saved, ctx)) return;
			} catch (error) {
				ctx.ui.notify(`Login failed: ${formatError(error)}`, "error");
			}
		},
	});
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
