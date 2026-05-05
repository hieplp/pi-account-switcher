import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerCustomModelProvider } from "../../providers/registration.js";
import { PROVIDERS_PATH } from "../../storage/paths.js";
import type { AccountSwitcherRuntime } from "../../runtime/account-switcher.js";
import { formatError } from "../../shared/errors.js";
import { promptForProvider } from "./prompts.js";
import type { AccountSwitcherContext } from "../../shared/ui.js";

export function registerProviderAddCommand(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("provider-add", {
		description: "Add a reusable custom provider",
		handler: async (_args, ctx) => handleProviderAdd(pi, runtime, ctx),
	});
}

async function handleProviderAdd(pi: ExtensionAPI, runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	try {
		await runtime.reloadConfig();
		const provider = await promptForProvider(ctx, undefined);
		if (!provider) return;
		await runtime.addConfiguredProvider(provider);
		registerCustomModelProvider(pi, provider);
		ctx.ui.notify(`Added custom provider ${provider.label ?? provider.id} to ${PROVIDERS_PATH}.`, "info");
	} catch (error) {
		ctx.ui.notify(`Failed to add provider: ${formatError(error)}`, "error");
	}
}
