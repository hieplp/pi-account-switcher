import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { ensureExampleConfig } from "../../storage/config.js";
import { CONFIG_PATH, PI_AUTH_PATH } from "../../storage/paths.js";
import { getPiAuthEntry } from "../../storage/pi-auth.js";
import { formatError } from "../../shared/errors.js";
import type { AccountSwitcherRuntime } from "../../runtime/account-switcher.js";
import type { AccountSwitcherContext } from "../../shared/ui.js";

export function registerAccountSystemCommands(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("account-debug", {
		description: "Show account switcher debug info without exposing secrets",
		handler: async (_args, ctx) => handleAccountDebug(runtime, ctx),
	});

	pi.registerCommand("account-reload", {
		description: "Reload account switcher config and saved selection from disk",
		handler: async (_args, ctx) => handleAccountReload(runtime, ctx),
	});

	pi.registerCommand("account-init", {
		description: "Create an example account switcher config if missing",
		handler: async (_args, ctx) => handleAccountInit(runtime, ctx),
	});
}

async function handleAccountDebug(runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	await runtime.reloadConfig();
	const provider = runtime.getProviderForContext(ctx);
	const active = runtime.getActiveAccount(provider);
	const authEntry = provider ? await getPiAuthEntry(provider) : undefined;
	ctx.ui.notify(
		[
			`model provider: ${provider || "unknown"}`,
			`active account: ${active ? `${active.label} (${active.id})` : "none"}`,
			`accounts configured: ${runtime.accountCount}`,
			`pi auth entry for provider: ${authEntry ? String(authEntry.type ?? "unknown") : "missing"}`,
			`auth file: ${PI_AUTH_PATH}`,
		].join("\n"),
		"info",
	);
}

async function handleAccountReload(runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	try {
		await runtime.reloadConfig();
		await runtime.restoreSavedAccounts(ctx);
		ctx.ui.notify(`Reloaded ${runtime.accountCount} account(s) from ${CONFIG_PATH}.`, "info");
	} catch (error) {
		ctx.ui.notify(`Failed to reload config: ${formatError(error)}`, "error");
	}
}

async function handleAccountInit(runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	await ensureExampleConfig();
	await runtime.reloadConfig();
	ctx.ui.notify(`Config ready at ${CONFIG_PATH}. Edit it with your accounts, then run /account-reload.`, "info");
}
