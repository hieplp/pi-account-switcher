import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { normalizeProvider, providerChoices, requiredEnvKeysForProvider } from "../../providers/catalog.js";
import { PROVIDERS_PATH } from "../../storage/paths.js";
import type { AccountSwitcherRuntime } from "../../runtime/account-switcher.js";
import type { AccountSwitcherContext } from "../../shared/ui.js";

export function registerProvidersListCommand(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("providers", {
		description: "List built-in and custom account providers",
		handler: async (_args, ctx) => handleProvidersList(runtime, ctx),
	});
}

async function handleProvidersList(runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	await runtime.reloadConfig();
	const items = providerChoices(runtime.providers, false).map((id) => {
		const custom = runtime.providers.find((provider) => normalizeProvider(provider.id) === id);
		const envKeys = requiredEnvKeysForProvider(id, runtime.providers);
		const details = [
			envKeys.length > 0 ? `env: ${envKeys.join(", ")}` : undefined,
			custom?.baseUrl ? `baseUrl: ${custom.baseUrl}` : undefined,
			custom?.api ? `api: ${custom.api}` : undefined,
			custom?.models ? `models: ${custom.models.length}` : undefined,
		].filter(Boolean).join("; ");
		return `${custom ? "custom" : "built-in"} — ${custom?.label ?? id} (${id})${details ? ` ${details}` : ""}`;
	});
	await ctx.ui.select("Providers", items.length > 0 ? items : [`No custom providers configured. Create ${PROVIDERS_PATH}.`]);
}
